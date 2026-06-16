import {
  createInMemoryAuditLog,
  type AuditLog,
  type AuditAction,
} from '../src/domain/audit';

describe('AuditLog (in-memory)', () => {
  let log: AuditLog;

  beforeEach(() => {
    log = createInMemoryAuditLog();
  });

  describe('append', () => {
    it('returns an entry with a non-empty id', () => {
      const entry = log.append({
        actor_id: 'clinician-1',
        action: 'care_plan.transitioned',
        subject_id: 'plan-001',
        subject_type: 'CarePlan',
        metadata: { from: 'draft', to: 'pending_review' },
      });
      expect(entry.id).toBeTruthy();
    });

    it('sets ts to approximately now', () => {
      const before = Date.now();
      const entry = log.append({
        actor_id: 'system',
        action: 'care_plan.created',
        subject_id: 'plan-001',
        subject_type: 'CarePlan',
        metadata: {},
      });
      const after = Date.now();
      expect(entry.ts.getTime()).toBeGreaterThanOrEqual(before);
      expect(entry.ts.getTime()).toBeLessThanOrEqual(after);
    });

    it('generates unique ids across entries', () => {
      const a = log.append({
        actor_id: 'system', action: 'care_plan.created',
        subject_id: 'plan-001', subject_type: 'CarePlan', metadata: {},
      });
      const b = log.append({
        actor_id: 'system', action: 'care_plan.created',
        subject_id: 'plan-002', subject_type: 'CarePlan', metadata: {},
      });
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('entries()', () => {
    it('returns an empty array on a fresh log', () => {
      expect(log.entries()).toEqual([]);
    });

    it('returns all appended entries in insertion order', () => {
      log.append({ actor_id: 'a', action: 'care_plan.created', subject_id: '1', subject_type: 'CarePlan', metadata: {} });
      log.append({ actor_id: 'b', action: 'care_plan.transitioned', subject_id: '1', subject_type: 'CarePlan', metadata: {} });
      const entries = log.entries();
      expect(entries).toHaveLength(2);
      expect(entries[0]?.action).toBe('care_plan.created');
      expect(entries[1]?.action).toBe('care_plan.transitioned');
    });

    it('returns a defensive copy — mutating the result does not affect the log', () => {
      log.append({ actor_id: 'a', action: 'care_plan.created', subject_id: '1', subject_type: 'CarePlan', metadata: {} });
      const first = log.entries();
      first.pop();
      expect(log.entries()).toHaveLength(1);
    });
  });

  describe('filtering helpers', () => {
    it('can filter entries by subject_id using standard array methods', () => {
      log.append({ actor_id: 'a', action: 'care_plan.created', subject_id: 'plan-1', subject_type: 'CarePlan', metadata: {} });
      log.append({ actor_id: 'b', action: 'health_data.accessed', subject_id: 'member-1', subject_type: 'Member', metadata: {} });

      const planEntries = log.entries().filter(e => e.subject_id === 'plan-1');
      expect(planEntries).toHaveLength(1);
      expect(planEntries[0]?.action).toBe('care_plan.created');
    });
  });

  describe('AuditAction type coverage', () => {
    const allActions: AuditAction[] = [
      'care_plan.created',
      'care_plan.transitioned',
      'care_plan.approved',
      'care_plan.published',
      'health_data.accessed',
      'consent.granted',
      'escalation.created',
      'escalation.acknowledged',
    ];

    it.each(allActions)('action "%s" can be recorded', (action) => {
      expect(() =>
        log.append({ actor_id: 'system', action, subject_id: 'x', subject_type: 'x', metadata: {} }),
      ).not.toThrow();
    });
  });
});
