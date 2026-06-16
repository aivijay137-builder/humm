import { randomUUID } from 'node:crypto';
import type { CarePlan, Notification, NotificationRecipientType, NotificationType } from '../domain/types';
import { transition } from '../domain/state-machine';
import type { AuditLog } from '../domain/audit';

export class MissingReasonError extends Error {
  constructor(action: string) {
    super(`A reason is required when performing "${action}" on a CarePlan`);
    this.name = 'MissingReasonError';
  }
}

export interface ReviewActionResult {
  readonly carePlan: CarePlan;
  readonly notifications: readonly Notification[];
}

function notify(
  recipientId: string,
  recipientType: NotificationRecipientType,
  type: NotificationType,
): Notification {
  return {
    id: randomUUID(),
    recipient_id: recipientId,
    recipient_type: recipientType,
    type,
    ts: new Date(),
    read_at: null,
  };
}

export function submitForReview(
  carePlan: CarePlan,
  auditLog: AuditLog,
  clinicianId?: string,
): ReviewActionResult {
  const newStatus = transition(carePlan.status, 'pending_review');
  const now = new Date();
  const updated: CarePlan = { ...carePlan, status: newStatus, updated_at: now };
  auditLog.append({
    actor_id: carePlan.member_id,
    action: 'care_plan.transitioned',
    subject_id: carePlan.id,
    subject_type: 'CarePlan',
    metadata: { from: carePlan.status, to: newStatus },
  });
  const notifications: Notification[] = [
    notify(carePlan.member_id, 'member', 'plan_under_review'),
  ];
  if (clinicianId !== undefined) {
    notifications.push(notify(clinicianId, 'clinician', 'plan_under_review'));
  }
  return { carePlan: updated, notifications };
}

export function approvePlan(
  carePlan: CarePlan,
  approverId: string,
  auditLog: AuditLog,
): ReviewActionResult {
  const newStatus = transition(carePlan.status, 'approved');
  const now = new Date();
  const updated: CarePlan = {
    ...carePlan,
    status: newStatus,
    approver_id: approverId,
    approved_at: now,
    updated_at: now,
  };
  auditLog.append({
    actor_id: approverId,
    action: 'care_plan.transitioned',
    subject_id: carePlan.id,
    subject_type: 'CarePlan',
    metadata: { from: carePlan.status, to: newStatus },
  });
  auditLog.append({
    actor_id: approverId,
    action: 'care_plan.approved',
    subject_id: carePlan.id,
    subject_type: 'CarePlan',
    metadata: { approver_id: approverId },
  });
  return { carePlan: updated, notifications: [] };
}

export function publishPlan(
  carePlan: CarePlan,
  auditLog: AuditLog,
): ReviewActionResult {
  const newStatus = transition(carePlan.status, 'published');
  const now = new Date();
  const updated: CarePlan = { ...carePlan, status: newStatus, updated_at: now };
  auditLog.append({
    actor_id: 'system',
    action: 'care_plan.transitioned',
    subject_id: carePlan.id,
    subject_type: 'CarePlan',
    metadata: { from: carePlan.status, to: newStatus },
  });
  auditLog.append({
    actor_id: 'system',
    action: 'care_plan.published',
    subject_id: carePlan.id,
    subject_type: 'CarePlan',
    metadata: { member_id: carePlan.member_id },
  });
  return {
    carePlan: updated,
    notifications: [notify(carePlan.member_id, 'member', 'plan_approved')],
  };
}

export function requestChanges(
  carePlan: CarePlan,
  approverId: string,
  reason: string,
  auditLog: AuditLog,
): ReviewActionResult {
  if (reason.trim().length === 0) throw new MissingReasonError('request_changes');
  const newStatus = transition(carePlan.status, 'changes_requested');
  const now = new Date();
  const updated: CarePlan = {
    ...carePlan,
    status: newStatus,
    approver_id: approverId,
    rejection_reason: reason,
    updated_at: now,
  };
  auditLog.append({
    actor_id: approverId,
    action: 'care_plan.transitioned',
    subject_id: carePlan.id,
    subject_type: 'CarePlan',
    metadata: { from: carePlan.status, to: newStatus, reason },
  });
  return {
    carePlan: updated,
    notifications: [notify(carePlan.member_id, 'member', 'plan_rejected')],
  };
}

export function rejectPlan(
  carePlan: CarePlan,
  approverId: string,
  reason: string,
  auditLog: AuditLog,
): ReviewActionResult {
  if (reason.trim().length === 0) throw new MissingReasonError('reject');
  const newStatus = transition(carePlan.status, 'rejected');
  const now = new Date();
  const updated: CarePlan = {
    ...carePlan,
    status: newStatus,
    approver_id: approverId,
    rejection_reason: reason,
    updated_at: now,
  };
  auditLog.append({
    actor_id: approverId,
    action: 'care_plan.transitioned',
    subject_id: carePlan.id,
    subject_type: 'CarePlan',
    metadata: { from: carePlan.status, to: newStatus, reason },
  });
  return {
    carePlan: updated,
    notifications: [notify(carePlan.member_id, 'member', 'plan_rejected')],
  };
}
