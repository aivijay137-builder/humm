import {
  canTransition,
  transition,
  InvalidTransitionError,
  VALID_TRANSITIONS,
} from '../src/domain/state-machine';
import type { CarePlanStatus } from '../src/domain/types';

describe('CarePlan state machine', () => {
  describe('canTransition', () => {
    const valid: Array<[CarePlanStatus, CarePlanStatus]> = [
      ['draft', 'pending_review'],
      ['draft', 'archived'],
      ['pending_review', 'approved'],
      ['pending_review', 'changes_requested'],
      ['pending_review', 'rejected'],
      ['pending_review', 'archived'],
      ['changes_requested', 'draft'],
      ['changes_requested', 'archived'],
      ['approved', 'published'],
      ['approved', 'archived'],
      ['published', 'draft'],
      ['published', 'archived'],
      ['rejected', 'archived'],
    ];

    test.each(valid)('%s → %s is allowed', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });

    const invalid: Array<[CarePlanStatus, CarePlanStatus]> = [
      ['draft', 'approved'],
      ['draft', 'published'],
      ['draft', 'rejected'],
      ['pending_review', 'published'],
      ['approved', 'draft'],
      ['approved', 'changes_requested'],
      ['published', 'approved'],
      ['rejected', 'draft'],
      ['archived', 'draft'],
      ['archived', 'pending_review'],
    ];

    test.each(invalid)('%s → %s is rejected', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    });
  });

  describe('transition()', () => {
    it('returns the new status on a valid transition', () => {
      expect(transition('draft', 'pending_review')).toBe('pending_review');
    });

    it('throws InvalidTransitionError on an invalid transition', () => {
      expect(() => transition('draft', 'published')).toThrow(InvalidTransitionError);
    });

    it('error message names from and to states', () => {
      expect(() => transition('archived', 'draft')).toThrow(
        'Invalid CarePlan transition: archived → draft',
      );
    });
  });

  describe('terminal state', () => {
    it('archived has no valid outgoing transitions', () => {
      const targets: CarePlanStatus[] = [
        'draft', 'pending_review', 'approved', 'published',
        'changes_requested', 'rejected', 'archived',
      ];
      targets.forEach(to => {
        expect(canTransition('archived', to)).toBe(false);
      });
    });
  });

  describe('VALID_TRANSITIONS table', () => {
    it('lists all statuses as keys', () => {
      const statuses: CarePlanStatus[] = [
        'draft', 'pending_review', 'approved', 'published',
        'changes_requested', 'rejected', 'archived',
      ];
      statuses.forEach(s => expect(s in VALID_TRANSITIONS).toBe(true));
    });
  });
});
