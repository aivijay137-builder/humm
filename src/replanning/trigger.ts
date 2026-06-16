import type { CarePlanId, CheckIn, MemberId, Outcome } from '../domain/types';

export type ReplanningReason = 'phase_30' | 'phase_60' | 'phase_90' | 'milestone' | 'lapse';

export interface ReplanningTrigger {
  readonly care_plan_id: CarePlanId;
  readonly member_id: MemberId;
  readonly reason: ReplanningReason;
  readonly triggered_at: Date;
}

export interface EvaluateReplanningTriggerInput {
  readonly member_id: MemberId;
  readonly care_plan_id: CarePlanId;
  readonly currentWeek: number;
  readonly milestones: readonly Outcome[];
  readonly lastCheckIn: CheckIn | null;
  readonly existingTriggers: readonly ReplanningTrigger[];
}

function alreadyFired(
  existingTriggers: readonly ReplanningTrigger[],
  care_plan_id: CarePlanId,
  reason: ReplanningReason,
): boolean {
  return existingTriggers.some(t => t.care_plan_id === care_plan_id && t.reason === reason);
}

function make(input: EvaluateReplanningTriggerInput, reason: ReplanningReason): ReplanningTrigger {
  return { care_plan_id: input.care_plan_id, member_id: input.member_id, reason, triggered_at: new Date() };
}

export function evaluateReplanningTrigger(
  input: EvaluateReplanningTriggerInput,
): ReplanningTrigger | null {
  const { currentWeek, milestones, lastCheckIn, existingTriggers, care_plan_id } = input;

  if (currentWeek >= 30 && !alreadyFired(existingTriggers, care_plan_id, 'phase_30')) {
    return make(input, 'phase_30');
  }
  if (currentWeek >= 60 && !alreadyFired(existingTriggers, care_plan_id, 'phase_60')) {
    return make(input, 'phase_60');
  }
  if (currentWeek >= 90 && !alreadyFired(existingTriggers, care_plan_id, 'phase_90')) {
    return make(input, 'phase_90');
  }
  if (milestones.length > 0 && !alreadyFired(existingTriggers, care_plan_id, 'milestone')) {
    return make(input, 'milestone');
  }
  const hasLapse =
    (lastCheckIn === null && currentWeek > 1) ||
    (lastCheckIn !== null && currentWeek > lastCheckIn.week + 1);
  if (hasLapse && !alreadyFired(existingTriggers, care_plan_id, 'lapse')) {
    return make(input, 'lapse');
  }
  return null;
}
