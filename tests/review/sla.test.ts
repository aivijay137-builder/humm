import { randomUUID } from 'node:crypto';
import { getSLAInfo, SLA_TARGET_HOURS, SLA_WARNING_HOURS } from '../../src/review/sla';
import type { CarePlan } from '../../src/domain/types';
import { asCarePlanId, asMemberId } from '../../src/domain/types';

function makePendingPlan(updatedAt: Date): CarePlan {
  return {
    id: asCarePlanId(randomUUID()),
    member_id: asMemberId('member-001'),
    version: 1,
    status: 'pending_review',
    approver_id: null,
    approved_at: null,
    rejection_reason: null,
    phase: 1,
    recommendations: [],
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: updatedAt,
  };
}

describe('SLA constants', () => {
  it('SLA_TARGET_HOURS is 24', () => expect(SLA_TARGET_HOURS).toBe(24));
  it('SLA_WARNING_HOURS is 20', () => expect(SLA_WARNING_HOURS).toBe(20));
});

describe('getSLAInfo — status', () => {
  it('returns on_track when less than 20h have elapsed', () => {
    const submittedAt = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-01T10:00:00.000Z');
    expect(getSLAInfo(makePendingPlan(submittedAt), now).status).toBe('on_track');
  });

  it('returns at_risk when between 20h and 24h have elapsed', () => {
    const submittedAt = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-01T22:00:00.000Z');
    expect(getSLAInfo(makePendingPlan(submittedAt), now).status).toBe('at_risk');
  });

  it('returns breached when more than 24h have elapsed', () => {
    const submittedAt = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-02T01:00:00.000Z');
    expect(getSLAInfo(makePendingPlan(submittedAt), now).status).toBe('breached');
  });

  it('returns breached at exactly 24h', () => {
    const submittedAt = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-02T00:00:00.000Z');
    expect(getSLAInfo(makePendingPlan(submittedAt), now).status).toBe('breached');
  });

  it('returns at_risk at exactly SLA_WARNING_HOURS', () => {
    const submittedAt = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-01T20:00:00.000Z');
    expect(getSLAInfo(makePendingPlan(submittedAt), now).status).toBe('at_risk');
  });
});

describe('getSLAInfo — hoursElapsed', () => {
  it('is approximately correct', () => {
    const submittedAt = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-01T10:00:00.000Z');
    expect(getSLAInfo(makePendingPlan(submittedAt), now).hoursElapsed).toBeCloseTo(10, 1);
  });
});

describe('getSLAInfo — hoursRemaining', () => {
  it('is SLA_TARGET_HOURS minus elapsed when on_track', () => {
    const submittedAt = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-01T10:00:00.000Z');
    expect(getSLAInfo(makePendingPlan(submittedAt), now).hoursRemaining).toBeCloseTo(14, 1);
  });

  it('is 0 when breached (never negative)', () => {
    const submittedAt = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-03T00:00:00.000Z');
    expect(getSLAInfo(makePendingPlan(submittedAt), now).hoursRemaining).toBe(0);
  });
});
