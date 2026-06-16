import { randomUUID } from 'node:crypto';
import { createPlanDelta } from '../../src/replanning/plan-delta';
import {
  asMemberId,
  asCarePlanId,
  asRecommendationId,
  asConditionProfileId,
  type Member,
  type ConditionProfile,
  type CarePlan,
  type Recommendation,
} from '../../src/domain/types';
import { createInMemoryAuditLog } from '../../src/domain/audit';
import type { ValidatedModule } from '../../src/module-library/schema';

const auditLog = createInMemoryAuditLog();
const member: Member = { id: asMemberId('m1'), email: 'a@b.com', created_at: new Date() };
const profile: ConditionProfile = {
  id: asConditionProfileId('p1'),
  member_id: asMemberId('m1'),
  symptoms: [],
  primary_goal: 'general',
  conditions: [],
  diagnosed: false,
  diagnosis_date: null,
  free_text_flagged: false,
};

function makeModule(id: string): ValidatedModule {
  return {
    id,
    phase: 1,
    kind: 'self',
    icon: 'icon',
    title: `Title ${id}`,
    action: `Action ${id}`,
    cadence: 'weekly',
    goals_served: [],
    always: true,
    this_week: true,
    evidence: {
      claim: `Claim ${id}`,
      rationale: 'Rationale',
      evidence_level: 'good',
      source: 'Source',
      confidence: 'validated',
      reviewed_by: null,
      last_reviewed: null,
    },
  };
}

function makeRec(moduleId: string): Recommendation {
  return {
    id: asRecommendationId(randomUUID()),
    module_id: moduleId,
    title: `Title ${moduleId}`,
    action: `Action ${moduleId}`,
    cadence: 'weekly',
    phase: 1,
    evidence: {
      claim: `Claim ${moduleId}`,
      rationale: 'Rationale',
      evidence_level: 'good',
      source: 'Source',
      confidence: 'validated',
      reviewed_by: null,
      last_reviewed: null,
    },
  };
}

function makeCarePlan(version: number, recs: Recommendation[]): CarePlan {
  const now = new Date();
  return {
    id: asCarePlanId(randomUUID()),
    member_id: asMemberId('m1'),
    version,
    status: 'approved',
    approver_id: 'dr1',
    approved_at: now,
    rejection_reason: null,
    phase: 1,
    recommendations: recs,
    created_at: now,
    updated_at: now,
  };
}

describe('createPlanDelta', () => {
  it('increments version by 1', () => {
    const existing = makeCarePlan(1, [makeRec('mod-a')]);
    const { newDraft } = createPlanDelta({
      existingPlan: existing, member, profile,
      allModules: [makeModule('mod-a')], auditLog,
    });
    expect(newDraft.version).toBe(2);
  });

  it('new draft has correct metadata', () => {
    const existing = makeCarePlan(1, [makeRec('mod-a')]);
    const { newDraft } = createPlanDelta({
      existingPlan: existing, member, profile,
      allModules: [makeModule('mod-a')], auditLog,
    });
    expect(newDraft.status).toBe('draft');
    expect(newDraft.member_id).toBe(member.id);
  });

  it('marks modules present in both plans as unchanged', () => {
    const existing = makeCarePlan(1, [makeRec('mod-a'), makeRec('mod-b')]);
    const { changes } = createPlanDelta({
      existingPlan: existing, member, profile,
      allModules: [makeModule('mod-a'), makeModule('mod-b')], auditLog,
    });
    expect(changes.every(c => c.type === 'unchanged')).toBe(true);
    expect(changes.map(c => c.recommendation.module_id).sort()).toEqual(['mod-a', 'mod-b']);
  });

  it('marks new module as added', () => {
    const existing = makeCarePlan(1, [makeRec('mod-a')]);
    const { changes } = createPlanDelta({
      existingPlan: existing, member, profile,
      allModules: [makeModule('mod-a'), makeModule('mod-c')], auditLog,
    });
    const added = changes.filter(c => c.type === 'added');
    expect(added).toHaveLength(1);
    expect(added[0]!.recommendation.module_id).toBe('mod-c');
  });

  it('marks module absent from new assembly as removed', () => {
    const existing = makeCarePlan(1, [makeRec('mod-a'), makeRec('mod-b')]);
    const { changes } = createPlanDelta({
      existingPlan: existing, member, profile,
      allModules: [makeModule('mod-a')],
      auditLog,
    });
    const removed = changes.filter(c => c.type === 'removed');
    expect(removed).toHaveLength(1);
    expect(removed[0]!.recommendation.module_id).toBe('mod-b');
  });

  it('handles simultaneous add, remove, and unchanged', () => {
    const existing = makeCarePlan(1, [makeRec('mod-a'), makeRec('mod-b')]);
    const { changes } = createPlanDelta({
      existingPlan: existing, member, profile,
      allModules: [makeModule('mod-a'), makeModule('mod-c')], auditLog,
    });
    const byType = (t: string) => changes.filter(c => c.type === t);
    expect(byType('unchanged')).toHaveLength(1);
    expect(byType('added')).toHaveLength(1);
    expect(byType('removed')).toHaveLength(1);
  });

  it('returns empty changes when both plans have no modules', () => {
    const existing = makeCarePlan(1, []);
    const { changes } = createPlanDelta({
      existingPlan: existing, member, profile,
      allModules: [], auditLog,
    });
    expect(changes).toHaveLength(0);
  });
});
