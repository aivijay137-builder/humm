import * as path from 'node:path';
import { assemblePlan, type AssemblyInput } from '../../src/plan-assembly/assembler';
import { loadModuleLibraryFromFile } from '../../src/module-library/loader';
import { createInMemoryAuditLog } from '../../src/domain/audit';
import { IncompleteEvidenceError } from '../../src/domain/evidence';
import type { ValidatedModule } from '../../src/module-library/schema';
import type { Member, ConditionProfile } from '../../src/domain/types';
import { asConditionProfileId, asMemberId } from '../../src/domain/types';

const memberId = asMemberId('member-001');
const member: Member = { id: memberId, email: 'priya@example.com', created_at: new Date('2026-01-01') };
const profile: ConditionProfile = {
  id: asConditionProfileId('profile-001'),
  member_id: memberId,
  symptoms: ['weight'],
  primary_goal: 'metabolic',
  conditions: [],
  diagnosed: true,
  diagnosis_date: null,
  free_text_flagged: false,
};
const input: AssemblyInput = { member, profile };

const validEvidence = {
  claim: 'A claim.',
  rationale: 'A rationale.',
  evidence_level: 'guideline' as const,
  source: 'Source',
  confidence: 'illustrative' as const,
  reviewed_by: null,
  last_reviewed: null,
};

function makeModule(id: string, phase: 1 | 2 | 3 = 1, always = true): ValidatedModule {
  return {
    id, phase, kind: 'self', icon: 'icon',
    title: `Module ${id}`, action: 'Do it.', cadence: 'Daily',
    goals_served: ['all'], always, this_week: false, evidence: validEvidence,
  };
}

const twoModules = [makeModule('mod-a', 1), makeModule('mod-b', 2)];

describe('assemblePlan — CarePlan shape', () => {
  it('status is draft', () => {
    expect(assemblePlan(input, twoModules, createInMemoryAuditLog()).carePlan.status).toBe('draft');
  });

  it('version is 1', () => {
    expect(assemblePlan(input, twoModules, createInMemoryAuditLog()).carePlan.version).toBe(1);
  });

  it('phase is 1', () => {
    expect(assemblePlan(input, twoModules, createInMemoryAuditLog()).carePlan.phase).toBe(1);
  });

  it('member_id matches input', () => {
    expect(assemblePlan(input, twoModules, createInMemoryAuditLog()).carePlan.member_id).toBe(memberId);
  });

  it('approver_id is null', () => {
    expect(assemblePlan(input, twoModules, createInMemoryAuditLog()).carePlan.approver_id).toBeNull();
  });

  it('id is a non-empty string', () => {
    expect(assemblePlan(input, twoModules, createInMemoryAuditLog()).carePlan.id).toBeTruthy();
  });
});

describe('assemblePlan — Recommendations', () => {
  it('creates one Recommendation per selected module', () => {
    const { carePlan } = assemblePlan(input, twoModules, createInMemoryAuditLog());
    expect(carePlan.recommendations).toHaveLength(2);
  });

  it('Recommendation.module_id matches source module', () => {
    const { carePlan } = assemblePlan(input, [makeModule('mod-x')], createInMemoryAuditLog());
    expect(carePlan.recommendations[0]?.module_id).toBe('mod-x');
  });

  it('Recommendation copies title, action, cadence from module', () => {
    const mod = makeModule('mod-y');
    const { carePlan } = assemblePlan(input, [mod], createInMemoryAuditLog());
    const rec = carePlan.recommendations[0]!;
    expect(rec.title).toBe(mod.title);
    expect(rec.action).toBe(mod.action);
    expect(rec.cadence).toBe(mod.cadence);
  });

  it('Recommendation.evidence comes from the module', () => {
    const { carePlan } = assemblePlan(input, [makeModule('mod-z')], createInMemoryAuditLog());
    expect(carePlan.recommendations[0]?.evidence.evidence_level).toBe('guideline');
  });

  it('recommendations are sorted by phase ascending', () => {
    const modules = [makeModule('p3', 3), makeModule('p1', 1), makeModule('p2', 2)];
    const { carePlan } = assemblePlan(input, modules, createInMemoryAuditLog());
    expect(carePlan.recommendations.map(r => r.phase)).toEqual([1, 2, 3]);
  });
});

describe('assemblePlan — excluded_module_ids', () => {
  it('excluded_module_ids is empty when all modules are always=true', () => {
    expect(assemblePlan(input, twoModules, createInMemoryAuditLog()).excluded_module_ids).toHaveLength(0);
  });

  it('excluded_module_ids contains non-selected module ids', () => {
    const nonMatch = makeModule('no-match', 1, false); // always=false, no include_when → excluded
    const { excluded_module_ids } = assemblePlan(input, [...twoModules, nonMatch], createInMemoryAuditLog());
    expect(excluded_module_ids).toContain('no-match');
  });
});

describe('assemblePlan — Evidence contract', () => {
  it('throws IncompleteEvidenceError when a module has empty claim', () => {
    const badModule: ValidatedModule = { ...makeModule('bad'), evidence: { ...validEvidence, claim: '' } };
    expect(() => assemblePlan(input, [badModule], createInMemoryAuditLog())).toThrow(IncompleteEvidenceError);
  });
});

describe('assemblePlan — Audit log', () => {
  it('appends care_plan.created', () => {
    const log = createInMemoryAuditLog();
    assemblePlan(input, twoModules, log);
    expect(log.entries().some(e => e.action === 'care_plan.created')).toBe(true);
  });

  it('care_plan.created metadata.member_id matches input', () => {
    const log = createInMemoryAuditLog();
    assemblePlan(input, twoModules, log);
    const entry = log.entries().find(e => e.action === 'care_plan.created')!;
    expect(entry.metadata['member_id']).toBe(memberId);
  });
});

describe('assemblePlan — with real seed', () => {
  it('assembles a draft plan from the full seed without throwing', () => {
    const modules = loadModuleLibraryFromFile(path.join(process.cwd(), 'module-library.seed.json'));
    const { carePlan } = assemblePlan(input, modules, createInMemoryAuditLog());
    expect(carePlan.status).toBe('draft');
    expect(carePlan.recommendations.length).toBeGreaterThan(0);
  });

  it('all recommendations in the seed-backed plan have non-empty evidence', () => {
    const modules = loadModuleLibraryFromFile(path.join(process.cwd(), 'module-library.seed.json'));
    const { carePlan } = assemblePlan(input, modules, createInMemoryAuditLog());
    carePlan.recommendations.forEach(rec => {
      expect(rec.evidence.claim.length).toBeGreaterThan(0);
      expect(rec.evidence.source.length).toBeGreaterThan(0);
    });
  });
});
