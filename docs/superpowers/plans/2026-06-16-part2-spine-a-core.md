# Part 2 — Spine A Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the clinician approval gate (US-1.C3) and the review queue service (US-6.C1–C3) — the state-transition + audit layer that every other spine reuses.

**Architecture:** Three focused modules under `src/review/` — `review-service.ts` (five approval actions: submit/approve/publish/requestChanges/reject), `sla.ts` (24h SLA clock), and `review-queue.ts` (ranked pending-review list). The existing state machine (`src/domain/state-machine.ts`) provides `transition(from, to)` which returns the new status or throws `InvalidTransitionError`. The review service wraps each transition with CarePlan field updates + audit entries + Notification production. No new npm dependencies.

**Tech Stack:** TypeScript 5.x · Node 20 · Jest 29 (ts-jest) · existing domain types from Part 0/1

---

## File map

| File | Responsibility |
|---|---|
| `src/review/review-service.ts` | `submitForReview` · `approvePlan` · `publishPlan` · `requestChanges` · `rejectPlan` · `MissingReasonError` · `ReviewActionResult` |
| `src/review/sla.ts` | `getSLAInfo` · `SLAStatus` · `SLAInfo` · `SLA_TARGET_HOURS=24` · `SLA_WARNING_HOURS=20` |
| `src/review/review-queue.ts` | `buildReviewQueue` · `ReviewQueueItem` |
| `src/review/index.ts` | Barrel (created in Task 3) |
| `src/index.ts` | MODIFY: re-export `src/review` |
| `tests/review/review-service.test.ts` | All approval action tests |
| `tests/review/sla.test.ts` | SLA status + hours tests |
| `tests/review/review-queue.test.ts` | Queue filtering + ordering tests |

### Key existing APIs (read-only — do NOT modify)

**`src/domain/state-machine.ts`**
```typescript
export function transition(from: CarePlanStatus, to: CarePlanStatus): CarePlanStatus
// throws InvalidTransitionError if transition is invalid
// valid paths: draft→pending_review, pending_review→{approved,changes_requested,rejected},
//              approved→published, changes_requested→draft, published→draft, any→archived
```

**`src/domain/audit.ts`**
```typescript
export type AuditAction =
  | 'care_plan.created' | 'care_plan.transitioned' | 'care_plan.approved' | 'care_plan.published'
  | 'health_data.accessed' | 'consent.granted' | 'escalation.created' | 'escalation.acknowledged';

export interface AuditLog {
  append(entry: Omit<AuditEntry, 'id' | 'ts'>): AuditEntry;
  entries(): AuditEntry[];
}
```

**`src/domain/types.ts` (relevant fields)**
```typescript
export interface CarePlan {
  readonly id: CarePlanId; readonly member_id: MemberId; readonly version: number;
  readonly status: CarePlanStatus; readonly approver_id: string | null;
  readonly approved_at: Date | null; readonly rejection_reason: string | null;
  readonly phase: 1 | 2 | 3; readonly recommendations: readonly Recommendation[];
  readonly created_at: Date; readonly updated_at: Date;
}
export type NotificationType = 'plan_under_review' | 'plan_approved' | 'plan_rejected' | ...;
export type NotificationRecipientType = 'member' | 'clinician' | 'coordinator';
export interface Notification {
  readonly id: string; readonly recipient_id: string;
  readonly recipient_type: NotificationRecipientType; readonly type: NotificationType;
  readonly ts: Date; readonly read_at: Date | null;
}
```

---

## Task 1: Review service

**Files:**
- Create: `src/review/review-service.ts`
- Test: `tests/review/review-service.test.ts`

Spec US-1.C3 + US-6.C2: five approval actions that each (a) call `transition()` to validate + return new status, (b) spread the CarePlan with updated fields, (c) append audit entries, (d) return `Notification[]`.

Flow for member: `submitForReview` (draft→pending_review, member sees "under review") → `approvePlan` (pending_review→approved, no member notification yet) → `publishPlan` (approved→published, member sees "plan ready"). Clinician rejection paths: `requestChanges` (pending_review→changes_requested, reason mandatory, member notified) · `rejectPlan` (pending_review→rejected, reason mandatory, member notified).

- [ ] **Step 1: Write the failing tests**

Create `tests/review/review-service.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run — must FAIL**

Run: `npx jest tests/review/review-service.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../../src/review/review-service'`

- [ ] **Step 3: Create `src/review/review-service.ts`**

```typescript
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
```

- [ ] **Step 4: Run — must PASS**

Run: `npx jest tests/review/review-service.test.ts --no-coverage`
Expected: all green (30 tests)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 6: Commit**

```bash
git add src/review/review-service.ts tests/review/review-service.test.ts
git commit -m "feat(part2): review service — submit/approve/publish/requestChanges/reject + audit + notifications"
```

---

## Task 2: SLA module

**Files:**
- Create: `src/review/sla.ts`
- Test: `tests/review/sla.test.ts`

Spec US-6.C3: per-draft SLA countdown. Target = 24h. Plans in `pending_review` are at-risk after 20h, breached after 24h. SLA is measured from `carePlan.updated_at` (set to the submission timestamp by `submitForReview`). The `getSLAInfo` function accepts an optional `now: Date` param so tests are deterministic.

- [ ] **Step 1: Write the failing tests**

Create `tests/review/sla.test.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { getSLAInfo, SLA_TARGET_HOURS, SLA_WARNING_HOURS } from '../../src/review/sla';
import type { CarePlan } from '../../src/domain/types';
import { asCarePlanId, asMemberId } from '../../src/domain/types';

function makePendingPlan(updatedAt: Date): CarePlan {
  return {
    id: asCarePlanId(randomUUID()),
    member_id: asMemberId('member-001'),
    version: 1,
    status: 'pending_review',
    approver_id: null,
    approved_at: null,
    rejection_reason: null,
    phase: 1,
    recommendations: [],
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: updatedAt,
  };
}

describe('SLA constants', () => {
  it('SLA_TARGET_HOURS is 24', () => expect(SLA_TARGET_HOURS).toBe(24));
  it('SLA_WARNING_HOURS is 20', () => expect(SLA_WARNING_HOURS).toBe(20));
});

describe('getSLAInfo — status', () => {
  it('returns on_track when less than 20h have elapsed', () => {
    const submittedAt = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-01T10:00:00.000Z'); // 10h later
    expect(getSLAInfo(makePendingPlan(submittedAt), now).status).toBe('on_track');
  });

  it('returns at_risk when between 20h and 24h have elapsed', () => {
    const submittedAt = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-01T22:00:00.000Z'); // 22h later
    expect(getSLAInfo(makePendingPlan(submittedAt), now).status).toBe('at_risk');
  });

  it('returns breached when 24h or more have elapsed', () => {
    const submittedAt = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-02T01:00:00.000Z'); // 25h later
    expect(getSLAInfo(makePendingPlan(submittedAt), now).status).toBe('breached');
  });

  it('returns breached at exactly 24h', () => {
    const submittedAt = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-02T00:00:00.000Z'); // exactly 24h
    expect(getSLAInfo(makePendingPlan(submittedAt), now).status).toBe('breached');
  });

  it('returns at_risk at exactly SLA_WARNING_HOURS', () => {
    const submittedAt = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-01T20:00:00.000Z'); // exactly 20h
    expect(getSLAInfo(makePendingPlan(submittedAt), now).status).toBe('at_risk');
  });
});

describe('getSLAInfo — hoursElapsed', () => {
  it('is approximately correct', () => {
    const submittedAt = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-01T10:00:00.000Z');
    const info = getSLAInfo(makePendingPlan(submittedAt), now);
    expect(info.hoursElapsed).toBeCloseTo(10, 1);
  });
});

describe('getSLAInfo — hoursRemaining', () => {
  it('is SLA_TARGET_HOURS minus elapsed when on_track', () => {
    const submittedAt = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-01T10:00:00.000Z');
    const info = getSLAInfo(makePendingPlan(submittedAt), now);
    expect(info.hoursRemaining).toBeCloseTo(14, 1);
  });

  it('is 0 when breached (never negative)', () => {
    const submittedAt = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-03T00:00:00.000Z'); // 48h later
    expect(getSLAInfo(makePendingPlan(submittedAt), now).hoursRemaining).toBe(0);
  });
});
```

- [ ] **Step 2: Run — must FAIL**

Run: `npx jest tests/review/sla.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../../src/review/sla'`

- [ ] **Step 3: Create `src/review/sla.ts`**

```typescript
import type { CarePlan } from '../domain/types';

export const SLA_TARGET_HOURS = 24;
export const SLA_WARNING_HOURS = 20;

export type SLAStatus = 'on_track' | 'at_risk' | 'breached';

export interface SLAInfo {
  readonly hoursElapsed: number;
  readonly hoursRemaining: number;
  readonly status: SLAStatus;
}

export function getSLAInfo(carePlan: CarePlan, now: Date = new Date()): SLAInfo {
  const hoursElapsed =
    (now.getTime() - carePlan.updated_at.getTime()) / (1000 * 60 * 60);
  const hoursRemaining = Math.max(0, SLA_TARGET_HOURS - hoursElapsed);

  let status: SLAStatus;
  if (hoursElapsed >= SLA_TARGET_HOURS) {
    status = 'breached';
  } else if (hoursElapsed >= SLA_WARNING_HOURS) {
    status = 'at_risk';
  } else {
    status = 'on_track';
  }

  return { hoursElapsed, hoursRemaining, status };
}
```

- [ ] **Step 4: Run — must PASS**

Run: `npx jest tests/review/sla.test.ts --no-coverage`
Expected: all green (10 tests)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 6: Commit**

```bash
git add src/review/sla.ts tests/review/sla.test.ts
git commit -m "feat(part2): SLA module — 24h target, 20h warning, on_track/at_risk/breached"
```

---

## Task 3: Review queue + barrel

**Files:**
- Create: `src/review/review-queue.ts`
- Create: `src/review/index.ts`
- Test: `tests/review/review-queue.test.ts`

Spec US-6.C1: the queue surfaces all `pending_review` plans ranked by urgency (oldest `updated_at` first = longest waiting = most at-risk of SLA breach). Each item carries the plan + its SLA info so the UI can render the countdown without a second call.

- [ ] **Step 1: Write the failing tests**

Create `tests/review/review-queue.test.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { buildReviewQueue } from '../../src/review/review-queue';
import type { CarePlan, CarePlanStatus } from '../../src/domain/types';
import { asCarePlanId, asMemberId } from '../../src/domain/types';

function makePlan(status: CarePlanStatus, updatedAt: Date): CarePlan {
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
    created_at: updatedAt,
    updated_at: updatedAt,
  };
}

describe('buildReviewQueue', () => {
  it('returns empty array when no plans are provided', () => {
    expect(buildReviewQueue([])).toHaveLength(0);
  });

  it('returns empty array when no plans are in pending_review', () => {
    const plans = [
      makePlan('draft', new Date()),
      makePlan('approved', new Date()),
      makePlan('published', new Date()),
    ];
    expect(buildReviewQueue(plans)).toHaveLength(0);
  });

  it('only includes pending_review plans', () => {
    const pending = makePlan('pending_review', new Date());
    const draft = makePlan('draft', new Date());
    const queue = buildReviewQueue([pending, draft]);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.carePlan.status).toBe('pending_review');
  });

  it('each item carries slaInfo with a status field', () => {
    const plan = makePlan('pending_review', new Date(Date.now() - 5 * 3600 * 1000));
    const [item] = buildReviewQueue([plan]);
    expect(item?.slaInfo.status).toBe('on_track');
    expect(typeof item?.slaInfo.hoursElapsed).toBe('number');
    expect(typeof item?.slaInfo.hoursRemaining).toBe('number');
  });

  it('sorts oldest updated_at first (most urgent first)', () => {
    const older = makePlan('pending_review', new Date('2026-01-01T00:00:00.000Z'));
    const newer = makePlan('pending_review', new Date('2026-01-02T00:00:00.000Z'));
    const queue = buildReviewQueue([newer, older]);
    expect(queue[0]?.carePlan.updated_at.getTime()).toBeLessThan(
      queue[1]?.carePlan.updated_at.getTime() ?? 0,
    );
  });

  it('marks breached SLA correctly', () => {
    const old = makePlan('pending_review', new Date(Date.now() - 30 * 3600 * 1000));
    const [item] = buildReviewQueue([old]);
    expect(item?.slaInfo.status).toBe('breached');
  });

  it('includes all pending_review plans when multiple exist', () => {
    const plans = [
      makePlan('pending_review', new Date('2026-01-01T00:00:00.000Z')),
      makePlan('pending_review', new Date('2026-01-02T00:00:00.000Z')),
      makePlan('draft', new Date()),
    ];
    expect(buildReviewQueue(plans)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run — must FAIL**

Run: `npx jest tests/review/review-queue.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../../src/review/review-queue'`

- [ ] **Step 3: Create `src/review/review-queue.ts`**

```typescript
import type { CarePlan } from '../domain/types';
import { getSLAInfo, type SLAInfo } from './sla';

export interface ReviewQueueItem {
  readonly carePlan: CarePlan;
  readonly slaInfo: SLAInfo;
}

export function buildReviewQueue(plans: CarePlan[]): ReviewQueueItem[] {
  return plans
    .filter(p => p.status === 'pending_review')
    .map(p => ({ carePlan: p, slaInfo: getSLAInfo(p) }))
    .sort((a, b) => a.carePlan.updated_at.getTime() - b.carePlan.updated_at.getTime());
}
```

- [ ] **Step 4: Create `src/review/index.ts`**

```typescript
export * from './review-service';
export * from './sla';
export * from './review-queue';
```

- [ ] **Step 5: Run — must PASS**

Run: `npx jest tests/review/review-queue.test.ts --no-coverage`
Expected: all green (6 tests)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 7: Commit**

```bash
git add src/review/review-queue.ts src/review/index.ts tests/review/review-queue.test.ts
git commit -m "feat(part2): review queue — ranked pending-review list with SLA info per item"
```

---

## Task 4: Barrel exports + full suite

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Read the current `src/index.ts`**

Then replace its contents with:

```typescript
export * from './domain/types';
export * from './domain/state-machine';
export * from './domain/evidence';
export * from './domain/consent';
export * from './domain/audit';
export * from './module-library/schema';
export * from './module-library/loader';
export * from './intake/red-flag';
export * from './intake/intake-service';
export * from './plan-assembly/module-selector';
export * from './plan-assembly/assembler';
export * from './review/review-service';
export * from './review/sla';
export * from './review/review-queue';
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected:
```
Test Suites: 13 passed, 13 total
Tests:       ~193 passed, ~193 total
Failures:    0
```

If any test fails, fix before proceeding.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(part2): barrel export — Part 2 Spine A core complete"
```

- [ ] **Step 5: Print git log**

Run: `git log --oneline -7`

Expected (newest first):
```
<sha>  feat(part2): barrel export — Part 2 Spine A core complete
<sha>  feat(part2): review queue — ranked pending-review list with SLA info per item
<sha>  feat(part2): SLA module — 24h target, 20h warning, on_track/at_risk/breached
<sha>  feat(part2): review service — submit/approve/publish/requestChanges/reject + audit + notifications
<sha>  feat(part1): barrel export — Part 1 Spine C + Intake complete
```

---

## Self-review

### Spec coverage

| Spec requirement | Task |
|---|---|
| US-1.C3 — state transitions per 0.3 | Task 1: all five functions call `transition()` which enforces VALID_TRANSITIONS |
| US-1.C3 — no member sees unapproved plan | Only `publishPlan` (approved→published) emits the `plan_approved` member notification |
| US-1.C3 — transition audit-logged | Every function appends `care_plan.transitioned` |
| US-1.C3 — member notified submitted→under review | `submitForReview` returns `plan_under_review` notification |
| US-1.C3 — member notified approved→ready | `publishPlan` returns `plan_approved` notification |
| US-1.C3 — clinician notified new draft | `submitForReview` optional `clinicianId` param → `plan_under_review` to clinician |
| US-1.C3 — changes_requested → re-draft | Task 1: `requestChanges` transitions to `changes_requested`; VALID_TRANSITIONS allows `changes_requested→draft` for subsequent `submitForReview` |
| US-1.C3 — rejection → member sees status + note | `rejectPlan` sets `rejection_reason`, returns `plan_rejected` notification |
| US-6.C1 — review queue surfaces pending_review plans | Task 3: `buildReviewQueue` filters on `status === 'pending_review'` |
| US-6.C1 — SLA timer visible | Task 3: each `ReviewQueueItem` carries `slaInfo` |
| US-6.C2 — approve/reject + reason | Task 1: `approvePlan`, `rejectPlan`, `requestChanges`; reason mandatory enforced via `MissingReasonError` |
| US-6.C2 — edits versioned | Versioning (CarePlan.version++) is left to the re-draft flow (changes_requested→draft→submitForReview) — the assembler already produces version=1; incrementing version on re-plan is US-7.C2 scope |
| US-6.C3 — P90 < 24h tracked / SLA-risk flagged | Task 2: `SLA_TARGET_HOURS=24`, `SLA_WARNING_HOURS=20`, `at_risk` status |
| 0.3 — care_plan.approved audit | `approvePlan` appends `care_plan.approved` |
| 0.3 — care_plan.published audit | `publishPlan` appends `care_plan.published` |

**Intentional gap:** US-6.C2 mentions "edit (swap module, adjust target)" — the swap-module UI is Stitch-able per spec. The domain-model equivalent is `requestChanges` followed by a re-draft (the assembler can be called again with different inputs). No additional code is needed here for the logic gate.

### Placeholder scan

No TBDs, no "implement later." Every step has complete code. Every test has actual assertions.

### Type consistency

- `ReviewActionResult.notifications: readonly Notification[]` — used consistently in all five functions and all tests.
- `transition(carePlan.status, 'pending_review')` — matches the actual `transition(from, to): CarePlanStatus` signature from `state-machine.ts`.
- `SLAInfo` defined in `sla.ts`, imported by `review-queue.ts` — consistent.
- `ReviewQueueItem.slaInfo: SLAInfo` — consistent in implementation and tests.
- `makePlan(status, updatedAt)` test helper — all three test files use compatible `CarePlan` construction patterns (same fields, same branded ID helpers).
- `MissingReasonError` thrown in `requestChanges` and `rejectPlan` — both tests import and assert the same class.
