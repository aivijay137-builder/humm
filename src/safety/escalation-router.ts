import { randomUUID } from 'node:crypto';
import { EscalationEvent, Notification } from '../domain/types';

export const ESCALATION_ACK_SLA_HOURS = 4;

export interface EscalationRoutingInput {
  readonly escalation: EscalationEvent;
  readonly coordinator_id: string;
  readonly clinician_id?: string;
}

export interface EscalationRoutingResult {
  readonly notifications: readonly Notification[];
}

export interface EscalationSLAInfo {
  readonly hoursElapsed: number;
  readonly hoursRemaining: number;
  readonly status: 'pending' | 'overdue';
}

export function routeEscalation(input: EscalationRoutingInput): EscalationRoutingResult {
  const now = new Date();
  const notifications: Notification[] = [];

  notifications.push({
    id: randomUUID(),
    recipient_id: input.escalation.member_id,
    recipient_type: 'member',
    type: 'escalation_created',
    ts: now,
    read_at: null,
  });

  notifications.push({
    id: randomUUID(),
    recipient_id: input.coordinator_id,
    recipient_type: 'coordinator',
    type: 'escalation_created',
    ts: now,
    read_at: null,
  });

  if (input.escalation.severity === 'high' || input.clinician_id !== undefined) {
    notifications.push({
      id: randomUUID(),
      recipient_id: input.clinician_id ?? 'clinician-queue',
      recipient_type: 'clinician',
      type: 'escalation_created',
      ts: now,
      read_at: null,
    });
  }

  return { notifications: [...notifications] };
}

export function acknowledgeEscalation(
  escalation: EscalationEvent,
  acknowledgedAt: Date = new Date(),
): EscalationEvent {
  return {
    ...escalation,
    status: 'acknowledged',
    acknowledged_at: acknowledgedAt,
  };
}

export function getEscalationSLAInfo(
  escalation: EscalationEvent,
  now: Date = new Date(),
): EscalationSLAInfo {
  const hoursElapsed =
    (now.getTime() - escalation.created_at.getTime()) / (1000 * 60 * 60);
  const hoursRemaining = Math.max(0, ESCALATION_ACK_SLA_HOURS - hoursElapsed);
  const status: 'pending' | 'overdue' =
    hoursElapsed >= ESCALATION_ACK_SLA_HOURS ? 'overdue' : 'pending';
  return { hoursElapsed, hoursRemaining, status };
}
