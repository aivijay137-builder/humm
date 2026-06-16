import type { CarePlan } from '../domain/types';

export const SLA_TARGET_HOURS = 24;
export const SLA_WARNING_HOURS = 20;

export type SLAStatus = 'on_track' | 'at_risk' | 'breached';

export interface SLAInfo {
  readonly hoursElapsed: number;
  readonly hoursRemaining: number;
  readonly status: SLAStatus;
}

export function getSLAInfo(carePlan: CarePlan, now: Date = new Date()): SLAInfo {
  const hoursElapsed =
    (now.getTime() - carePlan.updated_at.getTime()) / (1000 * 60 * 60);
  const hoursRemaining = Math.max(0, SLA_TARGET_HOURS - hoursElapsed);

  let status: SLAStatus;
  if (hoursElapsed >= SLA_TARGET_HOURS) {
    status = 'breached';
  } else if (hoursElapsed >= SLA_WARNING_HOURS) {
    status = 'at_risk';
  } else {
    status = 'on_track';
  }

  return { hoursElapsed, hoursRemaining, status };
}
