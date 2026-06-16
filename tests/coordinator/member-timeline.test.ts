import { buildMemberTimeline, MemberTimelineInput } from '../../src/coordinator/member-timeline';
import {
  asMemberId,
  asCarePlanId,
  CarePlan,
  CheckIn,
  EscalationEvent,
  Outcome,
} from '../../src/domain/types';
import { randomUUID } from 'node:crypto';

const memberId = asMemberId('m-001');

function makeCheckIn(createdAt: Date): CheckIn {
  return {
    id: randomUUID(),
    member_id: memberId,
    week: 1,
    cycle_date: null,
    top_symptom_severity: null,
    meds_taken: true,
    lifestyle_chips: [],
    mood: [3, 3],
    created_at: createdAt,
  };
}

function makeEscalation(createdAt: Date, acknowledgedAt: Date | null = null): EscalationEvent {
  return {
    id: randomUUID(),
    member_id: memberId,
    trigger: 'test',
    severity: 'medium',
    status: acknowledgedAt ? 'acknowledged' : 'open',
    created_at: createdAt,
    acknowledged_at: acknowledgedAt,
  };
}

function makeCarePlan(createdAt: Date): CarePlan {
  return {
    id: asCarePlanId(randomUUID()),
    member_id: memberId,
    version: 1,
    status: 'draft',
    approver_id: null,
    approved_at: null,
    rejection_reason: null,
    phase: 1,
    recommendations: [],
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function makeMilestone(ts: Date): Outcome {
  return {
    id: randomUUID(),
    member_id: memberId,
    metric: 'milestone',
    value: '4_week_streak',
    ts,
  };
}

function emptyInput(): MemberTimelineInput {
  return {
    member_id: memberId,
    checkIns: [],
    escalations: [],
    carePlans: [],
    milestones: [],
  };
}

describe('buildMemberTimeline', () => {
  it('returns empty events for a member with no data', () => {
    const timeline = buildMemberTimeline(emptyInput());
    expect(timeline.member_id).toBe(memberId);
    expect(timeline.events).toHaveLength(0);
  });

  it('maps a CheckIn to a check_in event with ts=created_at', () => {
    const ts = new Date('2026-06-01T10:00:00Z');
    const ci = makeCheckIn(ts);
    const timeline = buildMemberTimeline({ ...emptyInput(), checkIns: [ci] });
    expect(timeline.events).toHaveLength(1);
    const ev = timeline.events[0]!;
    expect(ev.type).toBe('check_in');
    expect(ev.ts).toEqual(ts);
    if (ev.type === 'check_in') expect(ev.checkIn).toBe(ci);
  });

  it('maps an open EscalationEvent to one escalation_opened event', () => {
    const ts = new Date('2026-06-01T10:00:00Z');
    const esc = makeEscalation(ts);
    const timeline = buildMemberTimeline({ ...emptyInput(), escalations: [esc] });
    expect(timeline.events).toHaveLength(1);
    expect(timeline.events[0]!.type).toBe('escalation_opened');
    expect(timeline.events[0]!.ts).toEqual(ts);
  });

  it('maps an acknowledged EscalationEvent to two events', () => {
    const openedAt = new Date('2026-06-01T08:00:00Z');
    const ackedAt = new Date('2026-06-01T10:00:00Z');
    const esc = makeEscalation(openedAt, ackedAt);
    const timeline = buildMemberTimeline({ ...emptyInput(), escalations: [esc] });
    expect(timeline.events).toHaveLength(2);
    const types = timeline.events.map(e => e.type);
    expect(types).toContain('escalation_opened');
    expect(types).toContain('escalation_acknowledged');
  });

  it('maps a CarePlan to a care_plan_created event', () => {
    const ts = new Date('2026-06-01T09:00:00Z');
    const cp = makeCarePlan(ts);
    const timeline = buildMemberTimeline({ ...emptyInput(), carePlans: [cp] });
    expect(timeline.events).toHaveLength(1);
    expect(timeline.events[0]!.type).toBe('care_plan_created');
    expect(timeline.events[0]!.ts).toEqual(ts);
  });

  it('maps a milestone Outcome to a milestone event', () => {
    const ts = new Date('2026-06-01T11:00:00Z');
    const m = makeMilestone(ts);
    const timeline = buildMemberTimeline({ ...emptyInput(), milestones: [m] });
    expect(timeline.events).toHaveLength(1);
    expect(timeline.events[0]!.type).toBe('milestone');
    expect(timeline.events[0]!.ts).toEqual(ts);
  });

  it('sorts all events by ts descending (most recent first)', () => {
    const t1 = new Date('2026-06-01T08:00:00Z');
    const t2 = new Date('2026-06-01T10:00:00Z');
    const t3 = new Date('2026-06-01T12:00:00Z');
    const timeline = buildMemberTimeline({
      ...emptyInput(),
      checkIns: [makeCheckIn(t1)],
      carePlans: [makeCarePlan(t3)],
      milestones: [makeMilestone(t2)],
    });
    expect(timeline.events).toHaveLength(3);
    expect(timeline.events[0]!.ts).toEqual(t3);
    expect(timeline.events[1]!.ts).toEqual(t2);
    expect(timeline.events[2]!.ts).toEqual(t1);
  });

  it('handles multiple objects of each type', () => {
    const t1 = new Date('2026-06-01T08:00:00Z');
    const t2 = new Date('2026-06-02T08:00:00Z');
    const timeline = buildMemberTimeline({
      ...emptyInput(),
      checkIns: [makeCheckIn(t1), makeCheckIn(t2)],
    });
    expect(timeline.events).toHaveLength(2);
  });

  it('copies member_id to the timeline', () => {
    const timeline = buildMemberTimeline(emptyInput());
    expect(timeline.member_id).toBe(memberId);
  });

  it('acknowledged escalation events reference the same escalation object', () => {
    const esc = makeEscalation(
      new Date('2026-06-01T08:00:00Z'),
      new Date('2026-06-01T10:00:00Z'),
    );
    const timeline = buildMemberTimeline({ ...emptyInput(), escalations: [esc] });
    for (const ev of timeline.events) {
      if (ev.type === 'escalation_opened' || ev.type === 'escalation_acknowledged') {
        expect(ev.escalation).toBe(esc);
      }
    }
  });
});
