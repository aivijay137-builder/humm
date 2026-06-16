import { randomUUID } from 'node:crypto';
import type { CarePlan, CarePlanId, CarePlanStatus, Notification } from '../domain/types';
import type { RecommendationChange } from './plan-delta';

export interface ChangeSummary {
  readonly care_plan_id: CarePlanId;
  readonly version_from: number;
  readonly version_to: number;
  readonly added_count: number;
  readonly removed_count: number;
  readonly unchanged_count: number;
  readonly changes: readonly RecommendationChange[];
}

export interface DeltaPublishResult {
  readonly notification: Notification;
}

export class UnapprovedDeltaError extends Error {
  constructor(care_plan_id: CarePlanId, status: CarePlanStatus) {
    super(`CarePlan ${care_plan_id} is not approved (status: ${status})`);
    this.name = 'UnapprovedDeltaError';
  }
}

export function buildChangeSummary(
  existingPlan: CarePlan,
  newPlan: CarePlan,
  changes: readonly RecommendationChange[],
): ChangeSummary {
  return {
    care_plan_id: newPlan.id,
    version_from: existingPlan.version,
    version_to: newPlan.version,
    added_count: changes.filter(c => c.type === 'added').length,
    removed_count: changes.filter(c => c.type === 'removed').length,
    unchanged_count: changes.filter(c => c.type === 'unchanged').length,
    changes,
  };
}

export function notifyDeltaPublished(
  existingPlan: CarePlan,
  approvedDraft: CarePlan,
): DeltaPublishResult {
  if (approvedDraft.status !== 'approved') {
    throw new UnapprovedDeltaError(approvedDraft.id, approvedDraft.status);
  }
  const notification: Notification = {
    id: randomUUID(),
    recipient_id: existingPlan.member_id,
    recipient_type: 'member',
    type: 'plan_updated',
    ts: new Date(),
    read_at: null,
  };
  return { notification };
}
