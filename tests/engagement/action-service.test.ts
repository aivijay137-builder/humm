import { randomUUID } from 'node:crypto';
import {
  createWeeklyActions,
  selectPrimaryAction,
  completeAction,
  skipAction,
} from '../../src/engagement/action-service';
import type { CarePlan, Recommendation } from '../../src/domain/types';
import { asCarePlanId, asMemberId, asRecommendationId } from '../../src/domain/types';

const validEvidence = {
  claim: 'A claim.', rationale: 'A rationale.',
  evidence_level: 'guideline' as const, source: 'Source',
  confidence: 'illustrative' as const, reviewed_by: null, last_reviewed: null,
};

function makeRec(id: string, phase: 1 | 2 | 3 = 1): Recommendation {
  return {
    id: asRecommendationId(id), module_id: id, title: `Rec ${id}`,
    action: 'Do it.', cadence: 'Daily', phase, evidence: validEvidence,
  };
}

function makeCarePlan(recs: Recommendation[]): CarePlan {
  const now = new Date();
  return {
    id: asCarePlanId(randomUUID()), member_id: asMemberId('member-001'),
    version: 1, status: 'published', approver_id: 'clinician-001',
    approved_at: now, rejection_reason: null, phase: 1,
    recommendations: recs, created_at: now, updated_at: now,
  };
}

describe('createWeeklyActions', () => {
  it('returns empty array for a plan with no recommendations', () => {
    expect(createWeeklyActions(makeCarePlan([]), 1)).toHaveLength(0);
  });

  it('creates one Action per Recommendation', () => {
    const plan = makeCarePlan([makeRec('a'), makeRec('b'), makeRec('c')]);
    expect(createWeeklyActions(plan, 1)).toHaveLength(3);
  });

  it('all actions have status pending', () => {
    const actions = createWeeklyActions(makeCarePlan([makeRec('a'), makeRec('b')]), 1);
    actions.forEach(a => expect(a.status).toBe('pending'));
  });

  it('all actions have the correct week', () => {
    const actions = createWeeklyActions(makeCarePlan([makeRec('a'), makeRec('b')]), 3);
    actions.forEach(a => expect(a.week).toBe(3));
  });

  it('all actions have completed_at null', () => {
    const actions = createWeeklyActions(makeCarePlan([makeRec('a')]), 1);
    expect(actions[0]?.completed_at).toBeNull();
  });

  it('action.care_plan_id matches the plan id', () => {
    const plan = makeCarePlan([makeRec('a')]);
    const [action] = createWeeklyActions(plan, 1);
    expect(action?.care_plan_id).toBe(plan.id);
  });

  it('action.recommendation_id matches the recommendation id', () => {
    const rec = makeRec('rec-001');
    const [action] = createWeeklyActions(makeCarePlan([rec]), 1);
    expect(action?.recommendation_id).toBe(rec.id);
  });

  it('marks the first phase-1 recommendation as primary', () => {
    const recs = [makeRec('p2a', 2), makeRec('p1a', 1), makeRec('p1b', 1)];
    const actions = createWeeklyActions(makeCarePlan(recs), 1);
    expect(actions[1]?.is_primary).toBe(true);
    expect(actions[0]?.is_primary).toBe(false);
    expect(actions[2]?.is_primary).toBe(false);
  });

  it('falls back to first recommendation when no phase-1 exists', () => {
    const recs = [makeRec('p2a', 2), makeRec('p2b', 2)];
    const actions = createWeeklyActions(makeCarePlan(recs), 1);
    expect(actions[0]?.is_primary).toBe(true);
    expect(actions[1]?.is_primary).toBe(false);
  });

  it('exactly one action is primary', () => {
    const recs = [makeRec('a', 1), makeRec('b', 1), makeRec('c', 2)];
    const actions = createWeeklyActions(makeCarePlan(recs), 1);
    expect(actions.filter(a => a.is_primary)).toHaveLength(1);
  });
});

describe('selectPrimaryAction', () => {
  it('returns the is_primary action', () => {
    const plan = makeCarePlan([makeRec('a', 2), makeRec('b', 1)]);
    const actions = createWeeklyActions(plan, 1);
    const primary = selectPrimaryAction(actions);
    expect(primary?.is_primary).toBe(true);
  });

  it('returns null for an empty array', () => {
    expect(selectPrimaryAction([])).toBeNull();
  });
});

describe('completeAction', () => {
  it('sets status to complete', () => {
    const [action] = createWeeklyActions(makeCarePlan([makeRec('a')]), 1);
    expect(completeAction(action!).status).toBe('complete');
  });

  it('sets completed_at to a Date', () => {
    const [action] = createWeeklyActions(makeCarePlan([makeRec('a')]), 1);
    expect(completeAction(action!).completed_at).toBeInstanceOf(Date);
  });

  it('does not mutate the original action', () => {
    const [action] = createWeeklyActions(makeCarePlan([makeRec('a')]), 1);
    completeAction(action!);
    expect(action!.status).toBe('pending');
  });
});

describe('skipAction', () => {
  it('sets status to skipped', () => {
    const [action] = createWeeklyActions(makeCarePlan([makeRec('a')]), 1);
    expect(skipAction(action!).status).toBe('skipped');
  });

  it('does not mutate the original action', () => {
    const [action] = createWeeklyActions(makeCarePlan([makeRec('a')]), 1);
    skipAction(action!);
    expect(action!.status).toBe('pending');
  });
});
