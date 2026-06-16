import { randomUUID } from 'node:crypto';
import {
  submitForReview,
  approvePlan,
  publishPlan,
  requestChanges,
  rejectPlan,
  MissingReasonError,
} from '../../src/review/review-service';
import { createInMemoryAuditLog } from '../../src/domain/audit';
import { InvalidTransitionError } from '../../src/domain/state-machine';
import type { CarePlan, CarePlanStatus } from '../../src/domain/types';
import { asCarePlanId, asMemberId } from '../../src/domain/types';

function makePlan(status: CarePlanStatus = 'draft'): CarePlan {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: asCarePlanId(randomUUID()),
    member_id: asMemberId('member-001'),
    version: 1,
    status,
    approver_id: null,
    approved_at: null,
    rejection_reason: null,
    phase: 1,
    recommendations: [],
    created_at: now,
    updated_at: now,
  };
}

const approverId = 'clinician-001';

describe('submitForReview', () => {
  it('transitions status from draft to pending_review', () => {
    const { carePlan } = submitForReview(makePlan('draft'), createInMemoryAuditLog());
    expect(carePlan.status).toBe('pending_review');
  });

  it('updates updated_at', () => {
    const plan = makePlan('draft');
    const before = plan.updated_at.getTime();
    const { carePlan } = submitForReview(plan, createInMemoryAuditLog());
    expect(carePlan.updated_at.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('does not modify id, member_id, version or phase', () => {
    const plan = makePlan('draft');
    const { carePlan } = submitForReview(plan, createInMemoryAuditLog());
    expect(carePlan.id).toBe(plan.id);
    expect(carePlan.member_id).toBe(plan.member_id);
    expect(carePlan.version).toBe(1);
    expect(carePlan.phase).toBe(1);
  });

  it('returns a member notification of type plan_under_review', () => {
    const { notifications } = submitForReview(makePlan('draft'), createInMemoryAuditLog());
    const memberNote = notifications.find(n => n.recipient_type === 'member');
    expect(memberNote?.type).toBe('plan_under_review');
    expect(memberNote?.recipient_id).toBe('member-001');
  });

  it('returns a clinician notification when clinicianId is provided', () => {
    const { notifications } = submitForReview(makePlan('draft'), createInMemoryAuditLog(), 'clinician-001');
    const clinicianNote = notifications.find(n => n.recipient_type === 'clinician');
    expect(clinicianNote?.type).toBe('plan_under_review');
    expect(clinicianNote?.recipient_id).toBe('clinician-001');
  });

  it('returns only one notification when no clinicianId provided', () => {
    const { notifications } = submitForReview(makePlan('draft'), createInMemoryAuditLog());
    expect(notifications).toHaveLength(1);
  });

  it('appends care_plan.transitioned to audit log', () => {
    const log = createInMemoryAuditLog();
    submitForReview(makePlan('draft'), log);
    expect(log.entries().some(e => e.action === 'care_plan.transitioned')).toBe(true);
  });

  it('audit entry records from=draft and to=pending_review in metadata', () => {
    const log = createInMemoryAuditLog();
    submitForReview(makePlan('draft'), log);
    const entry = log.entries().find(e => e.action === 'care_plan.transitioned')!;
    expect(entry.metadata['from']).toBe('draft');
    expect(entry.metadata['to']).toBe('pending_review');
  });

  it('throws InvalidTransitionError when plan is already in pending_review', () => {
    expect(() =>
      submitForReview(makePlan('pending_review'), createInMemoryAuditLog()),
    ).toThrow(InvalidTransitionError);
  });
});

describe('approvePlan', () => {
  it('transitions status from pending_review to approved', () => {
    const { carePlan } = approvePlan(makePlan('pending_review'), approverId, createInMemoryAuditLog());
    expect(carePlan.status).toBe('approved');
  });

  it('sets approver_id', () => {
    const { carePlan } = approvePlan(makePlan('pending_review'), approverId, createInMemoryAuditLog());
    expect(carePlan.approver_id).toBe(approverId);
  });

  it('sets approved_at to a Date instance', () => {
    const { carePlan } = approvePlan(makePlan('pending_review'), approverId, createInMemoryAuditLog());
    expect(carePlan.approved_at).toBeInstanceOf(Date);
  });

  it('updates updated_at', () => {
    const plan = makePlan('pending_review');
    const before = plan.updated_at.getTime();
    const { carePlan } = approvePlan(plan, approverId, createInMemoryAuditLog());
    expect(carePlan.updated_at.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('appends both care_plan.transitioned and care_plan.approved to audit log', () => {
    const log = createInMemoryAuditLog();
    approvePlan(makePlan('pending_review'), approverId, log);
    const actions = log.entries().map(e => e.action);
    expect(actions).toContain('care_plan.transitioned');
    expect(actions).toContain('care_plan.approved');
  });

  it('returns no notifications (member notified on publish, not on approve)', () => {
    const { notifications } = approvePlan(makePlan('pending_review'), approverId, createInMemoryAuditLog());
    expect(notifications).toHaveLength(0);
  });

  it('throws InvalidTransitionError when plan is not in pending_review', () => {
    expect(() =>
      approvePlan(makePlan('draft'), approverId, createInMemoryAuditLog()),
    ).toThrow(InvalidTransitionError);
  });
});

describe('publishPlan', () => {
  it('transitions status from approved to published', () => {
    const { carePlan } = publishPlan(makePlan('approved'), createInMemoryAuditLog());
    expect(carePlan.status).toBe('published');
  });

  it('updates updated_at', () => {
    const plan = makePlan('approved');
    const before = plan.updated_at.getTime();
    const { carePlan } = publishPlan(plan, createInMemoryAuditLog());
    expect(carePlan.updated_at.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('appends care_plan.transitioned and care_plan.published to audit log', () => {
    const log = createInMemoryAuditLog();
    publishPlan(makePlan('approved'), log);
    const actions = log.entries().map(e => e.action);
    expect(actions).toContain('care_plan.transitioned');
    expect(actions).toContain('care_plan.published');
  });

  it('returns a member notification of type plan_approved', () => {
    const { notifications } = publishPlan(makePlan('approved'), createInMemoryAuditLog());
    expect(notifications[0]?.type).toBe('plan_approved');
    expect(notifications[0]?.recipient_type).toBe('member');
  });

  it('throws InvalidTransitionError when plan is not in approved state', () => {
    expect(() =>
      publishPlan(makePlan('draft'), createInMemoryAuditLog()),
    ).toThrow(InvalidTransitionError);
  });
});

describe('requestChanges', () => {
  it('throws MissingReasonError when reason is empty string', () => {
    expect(() =>
      requestChanges(makePlan('pending_review'), approverId, '', createInMemoryAuditLog()),
    ).toThrow(MissingReasonError);
  });

  it('throws MissingReasonError when reason is whitespace only', () => {
    expect(() =>
      requestChanges(makePlan('pending_review'), approverId, '   ', createInMemoryAuditLog()),
    ).toThrow(MissingReasonError);
  });

  it('transitions status to changes_requested', () => {
    const { carePlan } = requestChanges(makePlan('pending_review'), approverId, 'Revise nutrition section.', createInMemoryAuditLog());
    expect(carePlan.status).toBe('changes_requested');
  });

  it('sets approver_id', () => {
    const { carePlan } = requestChanges(makePlan('pending_review'), approverId, 'Revise.', createInMemoryAuditLog());
    expect(carePlan.approver_id).toBe(approverId);
  });

  it('sets rejection_reason to the provided reason', () => {
    const reason = 'Revise exercise intensity targets.';
    const { carePlan } = requestChanges(makePlan('pending_review'), approverId, reason, createInMemoryAuditLog());
    expect(carePlan.rejection_reason).toBe(reason);
  });

  it('returns a member notification of type plan_rejected', () => {
    const { notifications } = requestChanges(makePlan('pending_review'), approverId, 'Reason.', createInMemoryAuditLog());
    expect(notifications[0]?.type).toBe('plan_rejected');
    expect(notifications[0]?.recipient_type).toBe('member');
  });

  it('appends care_plan.transitioned with to=changes_requested and reason in metadata', () => {
    const log = createInMemoryAuditLog();
    const reason = 'Revise section.';
    requestChanges(makePlan('pending_review'), approverId, reason, log);
    const entry = log.entries().find(e => e.action === 'care_plan.transitioned')!;
    expect(entry.metadata['to']).toBe('changes_requested');
    expect(entry.metadata['reason']).toBe(reason);
  });

  it('throws InvalidTransitionError when plan is not in pending_review', () => {
    expect(() =>
      requestChanges(makePlan('draft'), approverId, 'reason', createInMemoryAuditLog()),
    ).toThrow(InvalidTransitionError);
  });
});

describe('rejectPlan', () => {
  it('throws MissingReasonError when reason is empty string', () => {
    expect(() =>
      rejectPlan(makePlan('pending_review'), approverId, '', createInMemoryAuditLog()),
    ).toThrow(MissingReasonError);
  });

  it('transitions status to rejected', () => {
    const { carePlan } = rejectPlan(makePlan('pending_review'), approverId, 'Not appropriate.', createInMemoryAuditLog());
    expect(carePlan.status).toBe('rejected');
  });

  it('sets approver_id and rejection_reason', () => {
    const reason = 'Evidence gap for this member profile.';
    const { carePlan } = rejectPlan(makePlan('pending_review'), approverId, reason, createInMemoryAuditLog());
    expect(carePlan.approver_id).toBe(approverId);
    expect(carePlan.rejection_reason).toBe(reason);
  });

  it('returns a member notification of type plan_rejected', () => {
    const { notifications } = rejectPlan(makePlan('pending_review'), approverId, 'Reason.', createInMemoryAuditLog());
    expect(notifications[0]?.type).toBe('plan_rejected');
  });

  it('appends care_plan.transitioned to audit log', () => {
    const log = createInMemoryAuditLog();
    rejectPlan(makePlan('pending_review'), approverId, 'Reason.', log);
    expect(log.entries().some(e => e.action === 'care_plan.transitioned')).toBe(true);
  });

  it('throws InvalidTransitionError when plan is not in pending_review', () => {
    expect(() =>
      rejectPlan(makePlan('approved'), approverId, 'Reason.', createInMemoryAuditLog()),
    ).toThrow(InvalidTransitionError);
  });
});
