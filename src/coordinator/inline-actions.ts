import { randomUUID } from 'node:crypto';
import { EscalationEvent, MemberId, Notification } from '../domain/types';

export function nudgeMember(member_id: MemberId): Notification {
  return {
    id: randomUUID(),
    recipient_id: member_id,
    recipient_type: 'member',
    type: 'check_in_due',
    ts: new Date(),
    read_at: null,
  };
}

export function sendMessage(member_id: MemberId): Notification {
  return {
    id: randomUUID(),
    recipient_id: member_id,
    recipient_type: 'member',
    type: 'coordinator_message',
    ts: new Date(),
    read_at: null,
  };
}

export function markHandled(escalation: EscalationEvent): EscalationEvent {
  return {
    ...escalation,
    status: 'resolved',
  };
}
