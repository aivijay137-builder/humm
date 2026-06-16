import {
  buildAttentionQueue,
  AttentionQueueInput,
} from '../../src/coordinator/attention-queue';
import {
  asMemberId,
  asCarePlanId,
  CarePlan,
  CarePlanStatus,
  CheckIn,
  EscalationEvent,
  MemberId,
  Outcome,
} from '../../src/domain/types';
import { randomUUID } from 'node:crypto';

const M1 = asMemberId('m-001');

function makeEscalation(overrides: Partial<EscalationEvent> = {}): EscalationEvent {
  return {
    id: randomUUID(),
    member_id: M1,
    trigger: 'test',
    severity: 'medium',
    status: 'open',
    created_at: new Date(),
    acknowledged_at: null,
    ...overrides,
  };
}

function makeCheckIn(week: number): CheckIn {
  return {
    id: randomUUID(),
    member_id: M1,
    week,
    cycle_date: null,
    top_symptom_severity: null,
    meds_taken: true,
    lifestyle_chips: [],
    mood: [3, 3],
    created_at: new Date(),
  };
}

function makeCarePlan(status: CarePlanStatus): CarePlan {
  const now = new Date();
  return {
    id: asCarePlanId(randomUUID()),
    member_id: M1,
    version: 1,
    status,
    approver_id: null,
    approved_at: null,
    rejection_reason: null,
    phase: 1,
    recommendations: [],
    created_at: now,
    updated_at: now,
  };
}

function makeMilestone(): Outcome {
  return {
    id: randomUUID(),
    member_id: M1,
    metric: 'milestone',
    value: '4_week_streak',
    ts: new Date(),
  };
}

function baseInput(member_id: MemberId, overrides: Partial<AttentionQueueInput> = {}): AttentionQueueInput {
  return {
    member_id,
    openEscalations: [],
    checkIns: [],
    carePlan: null,
    currentWeek: 3,
    milestones: [],
    ...overrides,
  };
}

describe('buildAttentionQueue', () => {
  it('excludes members with no triggers', () => {
    const entries = buildAttentionQueue([
      baseInput(M1, { checkIns: [makeCheckIn(3)] }),
    ]);
    expect(entries).toHaveLength(0);
  });

  it('includes member with open escalation at priority 1', () => {
    const entries = buildAttentionQueue([
      baseInput(M1, { openEscalations: [makeEscalation()] }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.category).toBe('escalation');
    expect(entries[0]!.priority).toBe(1);
  });

  it('includes member with lapse (missed week) at priority 2', () => {
    const entries = buildAttentionQueue([
      baseInput(M1, { checkIns: [makeCheckIn(1)], currentWeek: 3 }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.category).toBe('lapse');
    expect(entries[0]!.priority).toBe(2);
  });

  it('includes member with no check-ins and currentWeek > 1 as lapse', () => {
    const entries = buildAttentionQueue([
      baseInput(M1, { checkIns: [], currentWeek: 2 }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.category).toBe('lapse');
  });

  it('does not flag lapse when currentWeek === 1 and no check-ins', () => {
    const entries = buildAttentionQueue([
      baseInput(M1, { checkIns: [], currentWeek: 1 }),
    ]);
    expect(entries).toHaveLength(0);
  });

  it('does not flag lapse when check-in is only 1 week behind', () => {
    const entries = buildAttentionQueue([
      baseInput(M1, { checkIns: [makeCheckIn(2)], currentWeek: 3 }),
    ]);
    expect(entries).toHaveLength(0);
  });

  it('includes member with milestone at priority 3', () => {
    const entries = buildAttentionQueue([
      baseInput(M1, { milestones: [makeMilestone()], checkIns: [makeCheckIn(3)] }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.category).toBe('milestone');
    expect(entries[0]!.priority).toBe(3);
  });

  it('includes member with draft care plan at priority 4', () => {
    const entries = buildAttentionQueue([
      baseInput(M1, { carePlan: makeCarePlan('draft'), checkIns: [makeCheckIn(3)] }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.category).toBe('plan_due');
    expect(entries[0]!.priority).toBe(4);
  });

  it('includes member with pending_review care plan at priority 4', () => {
    const entries = buildAttentionQueue([
      baseInput(M1, { carePlan: makeCarePlan('pending_review'), checkIns: [makeCheckIn(3)] }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.category).toBe('plan_due');
  });

  it('escalation takes priority over lapse for same member', () => {
    const entries = buildAttentionQueue([
      baseInput(M1, {
        openEscalations: [makeEscalation()],
        checkIns: [makeCheckIn(1)],
        currentWeek: 5,
      }),
    ]);
    expect(entries[0]!.category).toBe('escalation');
  });

  it('orders entries: escalation > lapse > milestone > plan_due', () => {
    const mEsc = asMemberId('m-esc');
    const mLap = asMemberId('m-lap');
    const mMil = asMemberId('m-mil');
    const mPlan = asMemberId('m-plan');
    const entries = buildAttentionQueue([
      baseInput(mPlan, { carePlan: makeCarePlan('draft'), checkIns: [makeCheckIn(3)] }),
      baseInput(mMil, { milestones: [makeMilestone()], checkIns: [makeCheckIn(3)] }),
      baseInput(mEsc, { openEscalations: [makeEscalation()] }),
      baseInput(mLap, { checkIns: [makeCheckIn(1)], currentWeek: 3 }),
    ]);
    expect(entries[0]!.member_id).toBe(mEsc);
    expect(entries[1]!.member_id).toBe(mLap);
    expect(entries[2]!.member_id).toBe(mMil);
    expect(entries[3]!.member_id).toBe(mPlan);
  });

  it('within escalation tier, oldest escalation surfaces first', () => {
    const olderTime = new Date('2026-06-01T08:00:00Z');
    const newerTime = new Date('2026-06-01T12:00:00Z');
    const mOld = asMemberId('m-old');
    const mNew = asMemberId('m-new');
    const entries = buildAttentionQueue([
      baseInput(mNew, { openEscalations: [makeEscalation({ created_at: newerTime })] }),
      baseInput(mOld, { openEscalations: [makeEscalation({ created_at: olderTime })] }),
    ]);
    expect(entries[0]!.member_id).toBe(mOld);
    expect(entries[1]!.member_id).toBe(mNew);
  });

  it('openEscalation on the entry is the oldest open escalation', () => {
    const olderTime = new Date('2026-06-01T08:00:00Z');
    const newerTime = new Date('2026-06-01T12:00:00Z');
    const entries = buildAttentionQueue([
      baseInput(M1, {
        openEscalations: [
          makeEscalation({ created_at: newerTime }),
          makeEscalation({ created_at: olderTime }),
        ],
      }),
    ]);
    expect(entries[0]!.openEscalation?.created_at).toEqual(olderTime);
  });

  it('lastCheckIn on the entry is the most recent check-in by week', () => {
    const entries = buildAttentionQueue([
      baseInput(M1, {
        openEscalations: [makeEscalation()],
        checkIns: [makeCheckIn(1), makeCheckIn(3), makeCheckIn(2)],
      }),
    ]);
    expect(entries[0]!.lastCheckIn?.week).toBe(3);
  });

  it('within plan_due tier, oldest carePlan.updated_at surfaces first', () => {
    const olderTime = new Date('2026-06-01T08:00:00Z');
    const newerTime = new Date('2026-06-01T12:00:00Z');
    const mOld = asMemberId('m-plan-old');
    const mNew = asMemberId('m-plan-new');
    const makeCarePlanAt = (t: Date): CarePlan => ({
      id: asCarePlanId(randomUUID()),
      member_id: mOld,
      version: 1,
      status: 'pending_review' as CarePlanStatus,
      approver_id: null,
      approved_at: null,
      rejection_reason: null,
      phase: 1,
      recommendations: [],
      created_at: t,
      updated_at: t,
    });
    const entries = buildAttentionQueue([
      baseInput(mNew, { carePlan: makeCarePlanAt(newerTime), checkIns: [makeCheckIn(3)] }),
      baseInput(mOld, { carePlan: makeCarePlanAt(olderTime), checkIns: [makeCheckIn(3)] }),
    ]);
    expect(entries[0]!.member_id).toBe(mOld);
    expect(entries[1]!.member_id).toBe(mNew);
  });
});
