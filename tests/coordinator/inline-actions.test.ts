import {
  nudgeMember,
  sendMessage,
  markHandled,
} from '../../src/coordinator/inline-actions';
import { asMemberId, EscalationEvent } from '../../src/domain/types';
import { randomUUID } from 'node:crypto';

const memberId = asMemberId('m-001');

function makeEscalation(overrides: Partial<EscalationEvent> = {}): EscalationEvent {
  return {
    id: randomUUID(),
    member_id: memberId,
    trigger: 'test trigger',
    severity: 'medium',
    status: 'open',
    created_at: new Date(),
    acknowledged_at: null,
    ...overrides,
  };
}

describe('nudgeMember', () => {
  it('returns a check_in_due notification for the member', () => {
    const notif = nudgeMember(memberId);
    expect(notif.type).toBe('check_in_due');
    expect(notif.recipient_type).toBe('member');
    expect(notif.recipient_id).toBe(memberId);
    expect(notif.read_at).toBeNull();
  });

  it('generates a unique id', () => {
    const a = nudgeMember(memberId);
    const b = nudgeMember(memberId);
    expect(a.id).not.toBe(b.id);
  });

  it('sets ts to approximately now', () => {
    const before = new Date();
    const notif = nudgeMember(memberId);
    const after = new Date();
    expect(notif.ts.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(notif.ts.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe('sendMessage', () => {
  it('returns a coordinator_message notification for the member', () => {
    const notif = sendMessage(memberId);
    expect(notif.type).toBe('coordinator_message');
    expect(notif.recipient_type).toBe('member');
    expect(notif.recipient_id).toBe(memberId);
    expect(notif.read_at).toBeNull();
  });

  it('generates a unique id', () => {
    const a = sendMessage(memberId);
    const b = sendMessage(memberId);
    expect(a.id).not.toBe(b.id);
  });
});

describe('markHandled', () => {
  it('transitions status to resolved', () => {
    const event = makeEscalation();
    const handled = markHandled(event);
    expect(handled.status).toBe('resolved');
  });

  it('preserves all other fields', () => {
    const event = makeEscalation({ severity: 'high' });
    const handled = markHandled(event);
    expect(handled.id).toBe(event.id);
    expect(handled.member_id).toBe(event.member_id);
    expect(handled.trigger).toBe(event.trigger);
    expect(handled.severity).toBe(event.severity);
    expect(handled.created_at).toBe(event.created_at);
    expect(handled.acknowledged_at).toBe(event.acknowledged_at);
  });

  it('works on an already-acknowledged escalation', () => {
    const ackTime = new Date();
    const event = makeEscalation({ status: 'acknowledged', acknowledged_at: ackTime });
    const handled = markHandled(event);
    expect(handled.status).toBe('resolved');
    expect(handled.acknowledged_at).toBe(ackTime);
  });

  it('does not mutate the original escalation', () => {
    const event = makeEscalation();
    markHandled(event);
    expect(event.status).toBe('open');
  });
});
