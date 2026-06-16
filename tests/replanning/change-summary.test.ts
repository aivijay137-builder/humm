import { randomUUID } from 'node:crypto';
import {
  buildChangeSummary,
  notifyDeltaPublished,
  UnapprovedDeltaError,
} from '../../src/replanning/change-summary';
import type { RecommendationChange } from '../../src/replanning/plan-delta';
import {
  asMemberId,
  asCarePlanId,
  asRecommendationId,
  type CarePlan,
  type Recommendation,
} from '../../src/domain/types';

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

function makeCarePlan(version: number, status: CarePlan['status'] = 'approved'): CarePlan {
  const now = new Date();
  return {
    id: asCarePlanId(randomUUID()),
    member_id: asMemberId('m1'),
    version,
    status,
    approver_id: status === 'approved' ? 'dr1' : null,
    approved_at: status === 'approved' ? now : null,
    rejection_reason: null,
    phase: 1,
    recommendations: [],
    created_at: now,
    updated_at: now,
  };
}

function ch(type: RecommendationChange['type'], moduleId: string): RecommendationChange {
  return { type, recommendation: makeRec(moduleId) };
}

describe('buildChangeSummary', () => {
  it('counts added, removed, unchanged correctly', () => {
    const existing = makeCarePlan(1);
    const newPlan = makeCarePlan(2);
    const changes = [ch('added', 'c'), ch('removed', 'b'), ch('unchanged', 'a')];

    const summary = buildChangeSummary(existing, newPlan, changes);

    expect(summary.added_count).toBe(1);
    expect(summary.removed_count).toBe(1);
    expect(summary.unchanged_count).toBe(1);
  });

  it('captures version_from and version_to', () => {
    const summary = buildChangeSummary(makeCarePlan(3), makeCarePlan(4), []);
    expect(summary.version_from).toBe(3);
    expect(summary.version_to).toBe(4);
  });

  it('care_plan_id is the new plan id', () => {
    const existing = makeCarePlan(1);
    const newPlan = makeCarePlan(2);
    const summary = buildChangeSummary(existing, newPlan, []);
    expect(summary.care_plan_id).toBe(newPlan.id);
  });

  it('preserves changes array reference', () => {
    const changes = [ch('added', 'x')];
    const summary = buildChangeSummary(makeCarePlan(1), makeCarePlan(2), changes);
    expect(summary.changes).toBe(changes);
  });

  it('handles all-unchanged', () => {
    const changes = [ch('unchanged', 'a'), ch('unchanged', 'b')];
    const summary = buildChangeSummary(makeCarePlan(1), makeCarePlan(2), changes);
    expect(summary.added_count).toBe(0);
    expect(summary.removed_count).toBe(0);
    expect(summary.unchanged_count).toBe(2);
  });

  it('handles empty changes', () => {
    const summary = buildChangeSummary(makeCarePlan(1), makeCarePlan(2), []);
    expect(summary.added_count).toBe(0);
    expect(summary.removed_count).toBe(0);
    expect(summary.unchanged_count).toBe(0);
  });
});

describe('notifyDeltaPublished', () => {
  it('returns plan_updated notification for approved draft', () => {
    const existing = makeCarePlan(1);
    const approved = makeCarePlan(2, 'approved');
    const { notification } = notifyDeltaPublished(existing, approved);

    expect(notification.type).toBe('plan_updated');
    expect(notification.recipient_type).toBe('member');
    expect(notification.recipient_id).toBe(existing.member_id);
    expect(notification.read_at).toBeNull();
    expect(notification.ts).toBeInstanceOf(Date);
  });

  it('notification id is a non-empty string', () => {
    const { notification } = notifyDeltaPublished(makeCarePlan(1), makeCarePlan(2, 'approved'));
    expect(typeof notification.id).toBe('string');
    expect(notification.id.length).toBeGreaterThan(0);
  });

  it('throws UnapprovedDeltaError for draft status', () => {
    const existing = makeCarePlan(1);
    const draft = makeCarePlan(2, 'draft');
    expect(() => notifyDeltaPublished(existing, draft)).toThrow(UnapprovedDeltaError);
  });

  it('throws UnapprovedDeltaError for pending_review status', () => {
    const existing = makeCarePlan(1);
    const pending = makeCarePlan(2, 'pending_review');
    expect(() => notifyDeltaPublished(existing, pending)).toThrow(UnapprovedDeltaError);
  });

  it('error message includes status', () => {
    const existing = makeCarePlan(1);
    const draft = makeCarePlan(2, 'draft');
    expect(() => notifyDeltaPublished(existing, draft)).toThrow(/draft/);
  });
});
