import * as path from 'node:path';
import { selectModules } from '../../src/plan-assembly/module-selector';
import { loadModuleLibraryFromFile } from '../../src/module-library/loader';
import type { ValidatedModule } from '../../src/module-library/schema';
import type { ConditionProfile } from '../../src/domain/types';
import { asConditionProfileId, asMemberId } from '../../src/domain/types';

const baseEvidence = {
  claim: 'A claim.',
  rationale: 'A rationale.',
  evidence_level: 'guideline' as const,
  source: 'Test',
  confidence: 'illustrative' as const,
  reviewed_by: null,
  last_reviewed: null,
};

function makeModule(overrides: Partial<ValidatedModule> & { id: string }): ValidatedModule {
  return {
    phase: 1,
    kind: 'self',
    icon: 'icon',
    title: 'Title',
    action: 'Action.',
    cadence: 'Daily',
    goals_served: ['all'],
    always: false,
    this_week: false,
    evidence: baseEvidence,
    ...overrides,
  };
}

const baseProfile: ConditionProfile = {
  id: asConditionProfileId('profile-001'),
  member_id: asMemberId('member-001'),
  symptoms: ['weight', 'irregular_cycle'],
  primary_goal: 'metabolic',
  conditions: ['Insulin resistance'],
  diagnosed: true,
  diagnosis_date: null,
  free_text_flagged: false,
};

describe('selectModules — always=true', () => {
  it('includes always=true modules regardless of include_when', () => {
    const m = makeModule({ id: 'always-mod', always: true });
    expect(selectModules([m], baseProfile)).toContain(m);
  });

  it('includes always=true with no include_when', () => {
    const m = makeModule({ id: 'always-no-when', always: true });
    expect(selectModules([m], baseProfile)).toContain(m);
  });
});

describe('selectModules — always=false, no include_when', () => {
  it('excludes module with always=false and no include_when', () => {
    const m = makeModule({ id: 'no-when', always: false });
    expect(selectModules([m], baseProfile)).not.toContain(m);
  });
});

describe('selectModules — symptom matching', () => {
  it('includes module when profile.symptoms contains a symptom from include_when.symptoms', () => {
    const m = makeModule({ id: 'symptom-match', always: false, include_when: { symptoms: ['weight'] } });
    expect(selectModules([m], baseProfile)).toContain(m);
  });

  it('excludes module when no profile symptom matches', () => {
    const m = makeModule({ id: 'symptom-miss', always: false, include_when: { symptoms: ['skinhair'] } });
    expect(selectModules([m], baseProfile)).not.toContain(m);
  });
});

describe('selectModules — primary_goal matching', () => {
  it('includes module when profile.primary_goal matches include_when.primary_goal', () => {
    const m = makeModule({ id: 'goal-match', always: false, include_when: { primary_goal: ['metabolic'] } });
    expect(selectModules([m], baseProfile)).toContain(m);
  });

  it('excludes module when primary_goal does not match', () => {
    const m = makeModule({ id: 'goal-miss', always: false, include_when: { primary_goal: ['fertility'] } });
    expect(selectModules([m], baseProfile)).not.toContain(m);
  });
});

describe('selectModules — condition matching', () => {
  it('includes module when profile.conditions contains a match', () => {
    const m = makeModule({ id: 'cond-match', always: false, include_when: { conditions: ['Insulin resistance'] } });
    expect(selectModules([m], baseProfile)).toContain(m);
  });

  it('excludes module when profile.conditions has no match', () => {
    const m = makeModule({ id: 'cond-miss', always: false, include_when: { conditions: ['Type-2 diabetes'] } });
    expect(selectModules([m], baseProfile)).not.toContain(m);
  });
});

describe('selectModules — OR semantics across axes', () => {
  it('includes module matching symptoms even when goal axis does not match', () => {
    const m = makeModule({
      id: 'or-test',
      always: false,
      include_when: { symptoms: ['weight'], primary_goal: ['fertility'] },
    });
    expect(selectModules([m], baseProfile)).toContain(m);
  });
});

describe('selectModules — against real seed', () => {
  it('all always=true seed modules are selected for any profile', () => {
    const seedPath = path.join(process.cwd(), 'module-library.seed.json');
    const allModules = loadModuleLibraryFromFile(seedPath);
    const alwaysCount = allModules.filter(m => m.always).length;
    const selected = selectModules(allModules, baseProfile);
    expect(selected.filter(m => m.always)).toHaveLength(alwaysCount);
  });
});
