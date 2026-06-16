import { randomUUID } from 'node:crypto';
import { buildReviewQueue } from '../../src/review/review-queue';
import type { CarePlan, CarePlanStatus } from '../../src/domain/types';
import { asCarePlanId, asMemberId } from '../../src/domain/types';

function makePlan(status: CarePlanStatus, updatedAt: Date): CarePlan {
  return {
    id: asCarePlanId(randomUUID()),
    member_id: asMemberId('member-001'),
    version: 1,
    status,
    approver_id: null,
    approved_at: null,
    rejection_reason: null,
    phase: 1,
    recommendations: [],
    created_at: updatedAt,
    updated_at: updatedAt,
  };
}

describe('buildReviewQueue', () => {
  it('returns empty array when no plans are provided', () => {
    expect(buildReviewQueue([])).toHaveLength(0);
  });

  it('returns empty array when no plans are in pending_review', () => {
    const plans = [
      makePlan('draft', new Date()),
      makePlan('approved', new Date()),
      makePlan('published', new Date()),
    ];
    expect(buildReviewQueue(plans)).toHaveLength(0);
  });

  it('only includes pending_review plans', () => {
    const pending = makePlan('pending_review', new Date());
    const draft = makePlan('draft', new Date());
    const queue = buildReviewQueue([pending, draft]);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.carePlan.status).toBe('pending_review');
  });

  it('each item carries slaInfo with a status field', () => {
    const plan = makePlan('pending_review', new Date(Date.now() - 5 * 3600 * 1000));
    const [item] = buildReviewQueue([plan]);
    expect(item?.slaInfo.status).toBe('on_track');
    expect(typeof item?.slaInfo.hoursElapsed).toBe('number');
    expect(typeof item?.slaInfo.hoursRemaining).toBe('number');
  });

  it('sorts oldest updated_at first (most urgent first)', () => {
    const older = makePlan('pending_review', new Date('2026-01-01T00:00:00.000Z'));
    const newer = makePlan('pending_review', new Date('2026-01-02T00:00:00.000Z'));
    const queue = buildReviewQueue([newer, older]);
    expect(queue[0]?.carePlan.updated_at.getTime()).toBeLessThan(
      queue[1]?.carePlan.updated_at.getTime() ?? 0,
    );
  });

  it('marks breached SLA correctly', () => {
    const old = makePlan('pending_review', new Date(Date.now() - 30 * 3600 * 1000));
    const [item] = buildReviewQueue([old]);
    expect(item?.slaInfo.status).toBe('breached');
  });

  it('includes all pending_review plans when multiple exist', () => {
    const plans = [
      makePlan('pending_review', new Date('2026-01-01T00:00:00.000Z')),
      makePlan('pending_review', new Date('2026-01-02T00:00:00.000Z')),
      makePlan('draft', new Date()),
    ];
    expect(buildReviewQueue(plans)).toHaveLength(2);
  });
});
