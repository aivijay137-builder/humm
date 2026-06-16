import { CarePlan, CheckIn, EscalationEvent, MemberId, Outcome } from '../domain/types';

export type TimelineEventType =
  | 'check_in'
  | 'escalation_opened'
  | 'escalation_acknowledged'
  | 'care_plan_created'
  | 'milestone';

export type TimelineEvent =
  | { readonly ts: Date; readonly type: 'check_in'; readonly checkIn: CheckIn }
  | { readonly ts: Date; readonly type: 'escalation_opened'; readonly escalation: EscalationEvent }
  | { readonly ts: Date; readonly type: 'escalation_acknowledged'; readonly escalation: EscalationEvent }
  | { readonly ts: Date; readonly type: 'care_plan_created'; readonly carePlan: CarePlan }
  | { readonly ts: Date; readonly type: 'milestone'; readonly outcome: Outcome };

export interface MemberTimelineInput {
  readonly member_id: MemberId;
  readonly checkIns: readonly CheckIn[];
  readonly escalations: readonly EscalationEvent[];
  readonly carePlans: readonly CarePlan[];
  readonly milestones: readonly Outcome[];
}

export interface MemberTimeline {
  readonly member_id: MemberId;
  readonly events: readonly TimelineEvent[];
}

export function buildMemberTimeline(input: MemberTimelineInput): MemberTimeline {
  const events: TimelineEvent[] = [];

  for (const checkIn of input.checkIns) {
    events.push({ ts: checkIn.created_at, type: 'check_in', checkIn });
  }

  for (const escalation of input.escalations) {
    events.push({ ts: escalation.created_at, type: 'escalation_opened', escalation });
    if (escalation.acknowledged_at !== null) {
      events.push({ ts: escalation.acknowledged_at, type: 'escalation_acknowledged', escalation });
    }
  }

  for (const carePlan of input.carePlans) {
    events.push({ ts: carePlan.created_at, type: 'care_plan_created', carePlan });
  }

  for (const outcome of input.milestones) {
    events.push({ ts: outcome.ts, type: 'milestone', outcome });
  }

  return {
    member_id: input.member_id,
    events: events.sort((a, b) => b.ts.getTime() - a.ts.getTime()),
  };
}
