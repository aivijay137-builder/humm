import type { CarePlanStatus } from './types';

export const VALID_TRANSITIONS: Readonly<Record<CarePlanStatus, readonly CarePlanStatus[]>> = {
  draft:             ['pending_review', 'archived'],
  pending_review:    ['approved', 'changes_requested', 'rejected', 'archived'],
  changes_requested: ['draft', 'archived'],
  approved:          ['published', 'archived'],
  published:         ['draft', 'archived'],
  rejected:          ['archived'],
  archived:          [],
};

export class InvalidTransitionError extends Error {
  constructor(from: CarePlanStatus, to: CarePlanStatus) {
    super(`Invalid CarePlan transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: CarePlanStatus, to: CarePlanStatus): boolean {
  return (VALID_TRANSITIONS[from] as readonly string[]).includes(to);
}

export function transition(from: CarePlanStatus, to: CarePlanStatus): CarePlanStatus {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
  return to;
}
