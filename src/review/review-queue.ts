import type { CarePlan } from '../domain/types';
import { getSLAInfo, type SLAInfo } from './sla';

export interface ReviewQueueItem {
  readonly carePlan: CarePlan;
  readonly slaInfo: SLAInfo;
}

export function buildReviewQueue(plans: CarePlan[]): ReviewQueueItem[] {
  return plans
    .filter(p => p.status === 'pending_review')
    .map(p => ({ carePlan: p, slaInfo: getSLAInfo(p) }))
    .sort((a, b) => a.carePlan.updated_at.getTime() - b.carePlan.updated_at.getTime());
}
