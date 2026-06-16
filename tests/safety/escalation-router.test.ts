import {
  routeEscalation,
  acknowledgeEscalation,
  getEscalationSLAInfo,
} from '../../src/safety/escalation-router';
import { asMemberId, EscalationEvent, EscalationSeverity } from '../../src/domain/types';
import { randomUUID } from 'node:crypto';

const memberId = asMemberId('m-001');
const coordinatorId = 'coord-001';
const clinicianId = 'clin-001';

function makeEscalation(
  severity: EscalationSeverity,
  overrides: Partial<EscalationEvent> = {},
): EscalationEvent {
  return {
    id: randomUUID(),
    member_id: memberId,
    trigger: 'test trigger',
    severity,
    status: 'open',
    created_at: new Date(),
    acknowledged_at: null,
    ...overrides,
  };
}

describe('routeEscalation', () => {
  it('always produces member + coordinator notifications for medium escalation', () => {
    const result = routeEscalation({
      escalation: makeEscalation('medium'),
      coordinator_id: coordinatorId,
    });
    expect(result.notifications).toHaveLength(2);
    const types = result.notifications.map(n => n.recipient_type);
    expect(types).toContain('member');
    expect(types).toContain('coordinator');
  });

  it('all notifications have type=escalation_created', () => {
    const result = routeEscalation({
      escalation: makeEscalation('medium'),
      coordinator_id: coordinatorId,
    });
    for (const n of result.notifications) {
      expect(n.type).toBe('escalation_created');
    }
  });

  it('member notification recipient_id equals the escalation member_id', () => {
    const result = routeEscalation({
      escalation: makeEscalation('medium'),
      coordinator_id: coordinatorId,
    });
    const m = result.notifications.find(n => n.recipient_type === 'member');
    expect(m?.recipient_id).toBe(memberId);
  });

  it('coordinator notification recipient_id equals coordinator_id', () => {
    const result = routeEscalation({
      escalation: makeEscalation('medium'),
      coordinator_id: coordinatorId,
    });
    const c = result.notifications.find(n => n.recipient_type === 'coordinator');
    expect(c?.recipient_id).toBe(coordinatorId);
  });

  it('produces 3 notifications for high severity escalation (clinician included)', () => {
    const result = routeEscalation({
      escalation: makeEscalation('high'),
      coordinator_id: coordinatorId,
    });
    expect(result.notifications).toHaveLength(3);
    const clin = result.notifications.find(n => n.recipient_type === 'clinician');
    expect(clin).toBeDefined();
  });

  it('notifies clinician with provided clinician_id for medium severity', () => {
    const result = routeEscalation({
      escalation: makeEscalation('medium'),
      coordinator_id: coordinatorId,
      clinician_id: clinicianId,
    });
    expect(result.notifications).toHaveLength(3);
    const clin = result.notifications.find(n => n.recipient_type === 'clinician');
    expect(clin?.recipient_id).toBe(clinicianId);
  });

  it('does not notify clinician for medium severity without clinician_id', () => {
    const result = routeEscalation({
      escalation: makeEscalation('medium'),
      coordinator_id: coordinatorId,
    });
    const types = result.notifications.map(n => n.recipient_type);
    expect(types).not.toContain('clinician');
  });

  it('all notifications have read_at=null', () => {
    const result = routeEscalation({
      escalation: makeEscalation('high'),
      coordinator_id: coordinatorId,
    });
    for (const n of result.notifications) {
      expect(n.read_at).toBeNull();
    }
  });

  it('clinician recipient_id defaults to clinician-queue when high severity and no clinician_id', () => {
    const result = routeEscalation({
      escalation: makeEscalation('high'),
      coordinator_id: coordinatorId,
    });
    const clin = result.notifications.find(n => n.recipient_type === 'clinician');
    expect(clin?.recipient_id).toBe('clinician-queue');
  });

  it('uses explicit clinician_id over clinician-queue when high severity and clinician_id provided', () => {
    const result = routeEscalation({
      escalation: makeEscalation('high'),
      coordinator_id: coordinatorId,
      clinician_id: clinicianId,
    });
    const clin = result.notifications.find(n => n.recipient_type === 'clinician');
    expect(clin?.recipient_id).toBe(clinicianId);
  });
});

describe('acknowledgeEscalation', () => {
  it('transitions status to acknowledged', () => {
    const event = makeEscalation('high');
    const acked = acknowledgeEscalation(event);
    expect(acked.status).toBe('acknowledged');
  });

  it('sets acknowledged_at to the provided date', () => {
    const ackTime = new Date('2026-06-01T10:00:00Z');
    const acked = acknowledgeEscalation(makeEscalation('high'), ackTime);
    expect(acked.acknowledged_at).toBe(ackTime);
  });

  it('defaults acknowledged_at to approximately now when not provided', () => {
    const before = new Date();
    const acked = acknowledgeEscalation(makeEscalation('high'));
    const after = new Date();
    expect(acked.acknowledged_at!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(acked.acknowledged_at!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('preserves all other fields unchanged', () => {
    const event = makeEscalation('medium');
    const acked = acknowledgeEscalation(event);
    expect(acked.id).toBe(event.id);
    expect(acked.member_id).toBe(event.member_id);
    expect(acked.trigger).toBe(event.trigger);
    expect(acked.severity).toBe(event.severity);
    expect(acked.created_at).toBe(event.created_at);
  });
});

describe('getEscalationSLAInfo', () => {
  it('returns pending when elapsed < 4h', () => {
    const createdAt = new Date('2026-06-01T08:00:00Z');
    const now = new Date('2026-06-01T10:00:00Z');
    const event = makeEscalation('medium', { created_at: createdAt });
    const sla = getEscalationSLAInfo(event, now);
    expect(sla.status).toBe('pending');
    expect(sla.hoursElapsed).toBeCloseTo(2);
    expect(sla.hoursRemaining).toBeCloseTo(2);
  });

  it('returns overdue when elapsed > 4h', () => {
    const createdAt = new Date('2026-06-01T08:00:00Z');
    const now = new Date('2026-06-01T13:00:00Z');
    const event = makeEscalation('medium', { created_at: createdAt });
    const sla = getEscalationSLAInfo(event, now);
    expect(sla.status).toBe('overdue');
    expect(sla.hoursElapsed).toBeCloseTo(5);
    expect(sla.hoursRemaining).toBe(0);
  });

  it('returns overdue at exactly 4h boundary', () => {
    const createdAt = new Date('2026-06-01T08:00:00Z');
    const now = new Date('2026-06-01T12:00:00Z');
    const event = makeEscalation('medium', { created_at: createdAt });
    const sla = getEscalationSLAInfo(event, now);
    expect(sla.status).toBe('overdue');
    expect(sla.hoursRemaining).toBe(0);
  });

  it('uses current time when now is not provided', () => {
    const event = makeEscalation('medium', { created_at: new Date() });
    const sla = getEscalationSLAInfo(event);
    expect(sla.status).toBe('pending');
    expect(sla.hoursElapsed).toBeGreaterThanOrEqual(0);
  });
});
