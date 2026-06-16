import { randomUUID } from 'node:crypto';
import type { Action, CarePlan } from '../domain/types';

export function createWeeklyActions(carePlan: CarePlan, week: number): Action[] {
  const recs = carePlan.recommendations;
  if (recs.length === 0) return [];

  const phase1Idx = recs.findIndex(r => r.phase === 1);
  const primaryIdx = phase1Idx >= 0 ? phase1Idx : 0;

  return recs.map((rec, idx) => ({
    id: randomUUID(),
    care_plan_id: carePlan.id,
    recommendation_id: rec.id,
    week,
    status: 'pending' as const,
    is_primary: idx === primaryIdx,
    completed_at: null,
  }));
}

export function selectPrimaryAction(actions: Action[]): Action | null {
  return actions.find(a => a.is_primary) ?? null;
}

export function completeAction(action: Action): Action {
  return { ...action, status: 'complete', completed_at: new Date() };
}

export function skipAction(action: Action): Action {
  return { ...action, status: 'skipped' };
}
