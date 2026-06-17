# Part 4 — Safety (US-4.C1–C3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement deterministic check-in red-flag rules, a structured check-in summariser, and escalation routing with a 4-hour ack SLA — covering US-4.C1, US-4.C2, and US-4.C3.

**Architecture:** Three pure-function modules under `src/safety/` (no AI decisions, no external calls). Red-flag rules produce `EscalationEvent[]` from a `CheckIn`; the summariser folds those escalations and check-in fields into a `CheckInSummary` queue signal; the router maps an `EscalationEvent` to `Notification[]` for member/coordinator/clinician and provides SLA/ack helpers. All types come from the already-defined `src/domain/types.ts`.

**Tech Stack:** TypeScript 5.x, Jest 29 + ts-jest, `randomUUID` from `node:crypto`, no third-party packages.

---

## Domain background (read before coding)

All types live in `src/domain/types.ts`. Relevant ones:

```typescript
// Branded ID
export type MemberId = string & { readonly _brand: 'MemberId' };
export function asMemberId(s: string): MemberId { return s as MemberId; }

// CheckIn
export type SymptomSeverity = 'mild' | 'moderate' | 'marked';
export interface CheckIn {
  readonly id: string;
  readonly member_id: MemberId;
  readonly week: number;
  readonly cycle_date: Date | null;
  readonly top_symptom_severity: SymptomSeverity | null;
  readonly meds_taken: boolean;
  readonly lifestyle_chips: readonly string[];
  readonly mood: readonly [number, number]; // values 1–5 each
  readonly created_at: Date;
}

// EscalationEvent
export type EscalationSeverity = 'low' | 'medium' | 'high';
export type EscalationStatus = 'open' | 'acknowledged' | 'resolved';
export interface EscalationEvent {
  readonly id: string;
  readonly member_id: MemberId;
  readonly trigger: string;
  readonly severity: EscalationSeverity;
  readonly status: EscalationStatus;
  readonly created_at: Date;
  readonly acknowledged_at: Date | null;
}

// Notification
export type NotificationRecipientType = 'member' | 'clinician' | 'coordinator';
export type NotificationType =
  | 'plan_under_review' | 'plan_approved' | 'plan_rejected'
  | 'check_in_due' | 'lapse_nudge' | 'milestone'
  | 'escalation_created' | 'escalation_ack';
export interface Notification {
  readonly id: string;
  readonly recipient_id: string;
  readonly recipient_type: NotificationRecipientType;
  readonly type: NotificationType;
  readonly ts: Date;
  readonly read_at: Date | null;
}
```

---

## File map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/safety/checkin-red-flag.ts` | US-4.C1 — 3 deterministic rules → `EscalationEvent[]` |
| Create | `src/safety/checkin-summariser.ts` | US-4.C2 — `CheckIn` + escalations → `CheckInSummary` |
| Create | `src/safety/escalation-router.ts` | US-4.C3 — routing + ack + 4h SLA |
| Create | `src/safety/index.ts` | barrel |
| Modify | `src/index.ts` | add safety exports |
| Create | `tests/safety/checkin-red-flag.test.ts` | |
| Create | `tests/safety/checkin-summariser.test.ts` | |
| Create | `tests/safety/escalation-router.test.ts` | |

---

## Task 1: Check-in red-flag rules (US-4.C1)

**Files:**
- Create: `src/safety/checkin-red-flag.ts`
- Create: `tests/safety/checkin-red-flag.test.ts`

Three rules fire independently (no silent suppression per spec):
- **Rule 1** `top_symptom_severity === 'marked'` → `EscalationEvent(severity='high')`
- **Rule 2** avg of `mood[0]+mood[1]` ≤ 2.0 → `EscalationEvent(severity='medium')`
- **Rule 3** previous check-in provided AND severity level jumped ≥ 2 steps → `EscalationEvent(severity='medium')`. Severity ladder: `null=0, mild=1, moderate=2, marked=3`.

Rules 1 and 3 can both fire when a member goes from null → marked (high for Rule 1, medium for Rule 3).

- [ ] **Step 1: Write the failing test**

Create `tests/safety/checkin-red-flag.test.ts`:

```typescript
import { checkCheckInRedFlags } from '../../src/safety/checkin-red-flag';
import { asMemberId, CheckIn } from '../../src/domain/types';
import { randomUUID } from 'node:crypto';

const memberId = asMemberId('m-001');

function makeCheckIn(overrides: Partial<CheckIn> = {}): CheckIn {
  return {
    id: randomUUID(),
    member_id: memberId,
    week: 1,
    cycle_date: null,
    top_symptom_severity: null,
    meds_taken: true,
    lifestyle_chips: [],
    mood: [3, 3],
    created_at: new Date(),
    ...overrides,
  };
}

describe('checkCheckInRedFlags', () => {
  it('returns no escalations for a normal check-in', () => {
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: makeCheckIn({ top_symptom_severity: 'mild', mood: [3, 3] }),
      previousCheckIn: null,
    });
    expect(result.escalations).toHaveLength(0);
  });

  it('fires high escalation for marked severity (Rule 1)', () => {
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: makeCheckIn({ top_symptom_severity: 'marked' }),
      previousCheckIn: null,
    });
    expect(result.escalations).toHaveLength(1);
    expect(result.escalations[0]!.severity).toBe('high');
    expect(result.escalations[0]!.status).toBe('open');
    expect(result.escalations[0]!.trigger).toContain('marked symptom severity');
    expect(result.escalations[0]!.acknowledged_at).toBeNull();
  });

  it('fires medium escalation for low mood avg ≤ 2.0 (Rule 2)', () => {
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: makeCheckIn({ mood: [2, 2] }),
      previousCheckIn: null,
    });
    expect(result.escalations).toHaveLength(1);
    expect(result.escalations[0]!.severity).toBe('medium');
    expect(result.escalations[0]!.trigger).toContain('low mood');
  });

  it('fires medium escalation when avg mood is exactly 2.0 — boundary (Rule 2)', () => {
    // mood [3,1] → avg = 2.0 exactly
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: makeCheckIn({ mood: [3, 1] }),
      previousCheckIn: null,
    });
    expect(result.escalations).toHaveLength(1);
    expect(result.escalations[0]!.severity).toBe('medium');
  });

  it('does not fire Rule 2 when avg mood > 2.0', () => {
    // [3,2] → avg = 2.5
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: makeCheckIn({ mood: [3, 2] }),
      previousCheckIn: null,
    });
    expect(result.escalations).toHaveLength(0);
  });

  it('fires medium escalation for sharp symptom change of 2 levels (Rule 3)', () => {
    // null(0) → moderate(2) = delta 2 ≥ 2 → fires
    const prev = makeCheckIn({ top_symptom_severity: null, week: 1 });
    const curr = makeCheckIn({ top_symptom_severity: 'moderate', week: 2 });
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: curr,
      previousCheckIn: prev,
    });
    expect(result.escalations).toHaveLength(1);
    expect(result.escalations[0]!.severity).toBe('medium');
    expect(result.escalations[0]!.trigger).toContain('sharp symptom change');
  });

  it('does not fire Rule 3 when severity increases by only 1 level', () => {
    // mild(1) → moderate(2) = delta 1 — not a sharp change
    const prev = makeCheckIn({ top_symptom_severity: 'mild', week: 1 });
    const curr = makeCheckIn({ top_symptom_severity: 'moderate', week: 2 });
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: curr,
      previousCheckIn: prev,
    });
    expect(result.escalations).toHaveLength(0);
  });

  it('fires both Rule 1 (high) and Rule 3 (medium) when null→marked', () => {
    // null(0) → marked(3) = delta 3 ≥ 2 → Rule 3; marked → Rule 1
    const prev = makeCheckIn({ top_symptom_severity: null, week: 1 });
    const curr = makeCheckIn({ top_symptom_severity: 'marked', week: 2 });
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: curr,
      previousCheckIn: prev,
    });
    expect(result.escalations).toHaveLength(2);
    const severities = result.escalations.map(e => e.severity).sort();
    expect(severities).toEqual(['high', 'medium']);
  });

  it('does not fire Rule 3 without previousCheckIn', () => {
    // Only Rule 1 can fire (marked); Rule 3 needs a previous
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: makeCheckIn({ top_symptom_severity: 'marked' }),
      previousCheckIn: null,
    });
    expect(result.escalations).toHaveLength(1);
    expect(result.escalations[0]!.severity).toBe('high');
  });

  it('sets member_id on every escalation', () => {
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: makeCheckIn({ top_symptom_severity: 'marked', mood: [1, 1] }),
      previousCheckIn: null,
    });
    for (const e of result.escalations) {
      expect(e.member_id).toBe(memberId);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx jest tests/safety/checkin-red-flag.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../../src/safety/checkin-red-flag'`

- [ ] **Step 3: Write implementation**

Create `src/safety/checkin-red-flag.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { CheckIn, EscalationEvent, MemberId, SymptomSeverity } from '../domain/types';

export interface CheckInRedFlagInput {
  readonly member_id: MemberId;
  readonly checkIn: CheckIn;
  readonly previousCheckIn: CheckIn | null;
}

export interface CheckInRedFlagResult {
  readonly escalations: readonly EscalationEvent[];
}

function severityToNumber(s: SymptomSeverity | null): number {
  if (s === null) return 0;
  if (s === 'mild') return 1;
  if (s === 'moderate') return 2;
  return 3; // marked
}

export function checkCheckInRedFlags(input: CheckInRedFlagInput): CheckInRedFlagResult {
  const escalations: EscalationEvent[] = [];
  const { checkIn, member_id, previousCheckIn } = input;
  const now = new Date();

  // Rule 1: Marked severity → high escalation
  if (checkIn.top_symptom_severity === 'marked') {
    escalations.push({
      id: randomUUID(),
      member_id,
      trigger: 'marked symptom severity on check-in',
      severity: 'high',
      status: 'open',
      created_at: now,
      acknowledged_at: null,
    });
  }

  // Rule 2: Low mood (avg ≤ 2.0) → medium escalation
  const avgMood = (checkIn.mood[0] + checkIn.mood[1]) / 2;
  if (avgMood <= 2.0) {
    escalations.push({
      id: randomUUID(),
      member_id,
      trigger: `low mood score on check-in: ${avgMood}`,
      severity: 'medium',
      status: 'open',
      created_at: now,
      acknowledged_at: null,
    });
  }

  // Rule 3: Sharp symptom change (≥ 2 levels) → medium escalation
  if (previousCheckIn !== null) {
    const prevSev = severityToNumber(previousCheckIn.top_symptom_severity);
    const currSev = severityToNumber(checkIn.top_symptom_severity);
    if (currSev - prevSev >= 2) {
      escalations.push({
        id: randomUUID(),
        member_id,
        trigger: `sharp symptom change on check-in: ${previousCheckIn.top_symptom_severity ?? 'none'} → ${checkIn.top_symptom_severity ?? 'none'}`,
        severity: 'medium',
        status: 'open',
        created_at: now,
        acknowledged_at: null,
      });
    }
  }

  return { escalations };
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npx jest tests/safety/checkin-red-flag.test.ts --no-coverage
```

Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```
git add src/safety/checkin-red-flag.ts tests/safety/checkin-red-flag.test.ts
git commit -m "feat(part4): check-in red-flag rules — marked severity, low mood, sharp change"
```

---

## Task 2: Check-in summariser (US-4.C2)

**Files:**
- Create: `src/safety/checkin-summariser.ts`
- Create: `tests/safety/checkin-summariser.test.ts`

`summariseCheckIn(checkIn, escalations)` produces a `CheckInSummary` — a structured queue signal for coordinators/clinicians. No AI, fully deterministic.

**`severity_level` derivation:**
- `'high'` if any escalation has `severity === 'high'`
- `'medium'` if any escalation has `severity === 'medium'` (and none are high)
- `'low'` if no escalations but `flags` is non-empty
- `'none'` if no escalations and no flags

**`flags` derivation (from CheckIn fields):**
- `'marked_symptom'` when `top_symptom_severity === 'marked'`
- `'moderate_symptom'` when `top_symptom_severity === 'moderate'`
- `'low_mood'` when avg of `mood[0]+mood[1]` ≤ 2.0
- `'lapsed_meds'` when `meds_taken === false`

- [ ] **Step 1: Write the failing test**

Create `tests/safety/checkin-summariser.test.ts`:

```typescript
import { summariseCheckIn } from '../../src/safety/checkin-summariser';
import { asMemberId, CheckIn, EscalationEvent, EscalationSeverity } from '../../src/domain/types';
import { randomUUID } from 'node:crypto';

const memberId = asMemberId('m-001');

function makeCheckIn(overrides: Partial<CheckIn> = {}): CheckIn {
  return {
    id: 'ci-001',
    member_id: memberId,
    week: 3,
    cycle_date: null,
    top_symptom_severity: null,
    meds_taken: true,
    lifestyle_chips: [],
    mood: [3, 3],
    created_at: new Date(),
    ...overrides,
  };
}

function makeEscalation(severity: EscalationSeverity): EscalationEvent {
  return {
    id: randomUUID(),
    member_id: memberId,
    trigger: 'test trigger',
    severity,
    status: 'open',
    created_at: new Date(),
    acknowledged_at: null,
  };
}

describe('summariseCheckIn', () => {
  it('severity_level=none with no flags and no escalations', () => {
    const summary = summariseCheckIn(makeCheckIn(), []);
    expect(summary.severity_level).toBe('none');
    expect(summary.flags).toHaveLength(0);
    expect(summary.has_escalation).toBe(false);
  });

  it('copies check_in_id, member_id, week from the check-in', () => {
    const ci = makeCheckIn({ id: 'ci-42', week: 7 });
    const summary = summariseCheckIn(ci, []);
    expect(summary.check_in_id).toBe('ci-42');
    expect(summary.member_id).toBe(memberId);
    expect(summary.week).toBe(7);
  });

  it('severity_level=high when a high escalation is present', () => {
    const summary = summariseCheckIn(makeCheckIn(), [makeEscalation('high')]);
    expect(summary.severity_level).toBe('high');
    expect(summary.has_escalation).toBe(true);
  });

  it('severity_level=medium when only a medium escalation is present', () => {
    const summary = summariseCheckIn(makeCheckIn(), [makeEscalation('medium')]);
    expect(summary.severity_level).toBe('medium');
  });

  it('high takes precedence over medium when both escalations are present', () => {
    const summary = summariseCheckIn(makeCheckIn(), [
      makeEscalation('medium'),
      makeEscalation('high'),
    ]);
    expect(summary.severity_level).toBe('high');
  });

  it('severity_level=low when only flags present, no escalations', () => {
    const ci = makeCheckIn({ meds_taken: false });
    const summary = summariseCheckIn(ci, []);
    expect(summary.severity_level).toBe('low');
    expect(summary.flags).toContain('lapsed_meds');
  });

  it('includes marked_symptom flag for marked severity', () => {
    const summary = summariseCheckIn(makeCheckIn({ top_symptom_severity: 'marked' }), []);
    expect(summary.flags).toContain('marked_symptom');
  });

  it('includes moderate_symptom flag for moderate severity', () => {
    const summary = summariseCheckIn(makeCheckIn({ top_symptom_severity: 'moderate' }), []);
    expect(summary.flags).toContain('moderate_symptom');
  });

  it('includes low_mood flag when avg mood ≤ 2.0', () => {
    const summary = summariseCheckIn(makeCheckIn({ mood: [2, 2] }), []);
    expect(summary.flags).toContain('low_mood');
  });

  it('does not include low_mood flag when avg mood > 2.0', () => {
    const summary = summariseCheckIn(makeCheckIn({ mood: [3, 3] }), []);
    expect(summary.flags).not.toContain('low_mood');
  });

  it('includes lapsed_meds flag when meds_taken=false', () => {
    const summary = summariseCheckIn(makeCheckIn({ meds_taken: false }), []);
    expect(summary.flags).toContain('lapsed_meds');
  });

  it('does not include lapsed_meds when meds_taken=true', () => {
    const summary = summariseCheckIn(makeCheckIn({ meds_taken: true }), []);
    expect(summary.flags).not.toContain('lapsed_meds');
  });

  it('has_escalation=false for empty escalation list', () => {
    const summary = summariseCheckIn(makeCheckIn(), []);
    expect(summary.has_escalation).toBe(false);
  });

  it('generated_at is a Date instance', () => {
    const summary = summariseCheckIn(makeCheckIn(), []);
    expect(summary.generated_at).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx jest tests/safety/checkin-summariser.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../../src/safety/checkin-summariser'`

- [ ] **Step 3: Write implementation**

Create `src/safety/checkin-summariser.ts`:

```typescript
import { CheckIn, EscalationEvent, MemberId } from '../domain/types';

export type CheckInSeverityLevel = 'none' | 'low' | 'medium' | 'high';

export interface CheckInSummary {
  readonly check_in_id: string;
  readonly member_id: MemberId;
  readonly week: number;
  readonly severity_level: CheckInSeverityLevel;
  readonly flags: readonly string[];
  readonly has_escalation: boolean;
  readonly generated_at: Date;
}

export function summariseCheckIn(
  checkIn: CheckIn,
  escalations: readonly EscalationEvent[],
): CheckInSummary {
  const flags: string[] = [];

  if (checkIn.top_symptom_severity === 'marked') {
    flags.push('marked_symptom');
  } else if (checkIn.top_symptom_severity === 'moderate') {
    flags.push('moderate_symptom');
  }

  const avgMood = (checkIn.mood[0] + checkIn.mood[1]) / 2;
  if (avgMood <= 2.0) flags.push('low_mood');

  if (!checkIn.meds_taken) flags.push('lapsed_meds');

  const has_escalation = escalations.length > 0;

  let severity_level: CheckInSeverityLevel = 'none';
  if (escalations.some(e => e.severity === 'high')) {
    severity_level = 'high';
  } else if (escalations.some(e => e.severity === 'medium')) {
    severity_level = 'medium';
  } else if (flags.length > 0) {
    severity_level = 'low';
  }

  return {
    check_in_id: checkIn.id,
    member_id: checkIn.member_id,
    week: checkIn.week,
    severity_level,
    flags,
    has_escalation,
    generated_at: new Date(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npx jest tests/safety/checkin-summariser.test.ts --no-coverage
```

Expected: PASS — 13 tests

- [ ] **Step 5: Commit**

```
git add src/safety/checkin-summariser.ts tests/safety/checkin-summariser.test.ts
git commit -m "feat(part4): check-in summariser — structured CheckInSummary signal for coordinator queue"
```

---

## Task 3: Escalation routing + ack SLA (US-4.C3)

**Files:**
- Create: `src/safety/escalation-router.ts`
- Create: `tests/safety/escalation-router.test.ts`

**`routeEscalation(input)`** produces `Notification[]` for:
- Member (always) — supportive "we've got you" message; `type='escalation_created'`
- Coordinator (always) — alert; `type='escalation_created'`
- Clinician — ONLY when `input.escalation.severity === 'high'` OR `input.clinician_id` is provided; `type='escalation_created'`; `recipient_id` = `input.clinician_id ?? 'clinician-queue'`

**`acknowledgeEscalation(event, acknowledgedAt?)`** returns new event with `status='acknowledged'`, `acknowledged_at` set (defaults to `new Date()`).

**`getEscalationSLAInfo(event, now?)`** measures hours since `event.created_at`:
- `status='pending'` when elapsed < 4h
- `status='overdue'` when elapsed ≥ 4h (boundary inclusive)
- `hoursRemaining = Math.max(0, 4 - hoursElapsed)`

- [ ] **Step 1: Write the failing test**

Create `tests/safety/escalation-router.test.ts`:

```typescript
import {
  routeEscalation,
  acknowledgeEscalation,
  getEscalationSLAInfo,
  ESCALATION_ACK_SLA_HOURS,
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

describe('ESCALATION_ACK_SLA_HOURS', () => {
  it('is 4 hours', () => {
    expect(ESCALATION_ACK_SLA_HOURS).toBe(4);
  });
});

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
    const now = new Date('2026-06-01T10:00:00Z'); // 2h later
    const event = makeEscalation('medium', { created_at: createdAt });
    const sla = getEscalationSLAInfo(event, now);
    expect(sla.status).toBe('pending');
    expect(sla.hoursElapsed).toBeCloseTo(2);
    expect(sla.hoursRemaining).toBeCloseTo(2);
  });

  it('returns overdue when elapsed ≥ 4h', () => {
    const createdAt = new Date('2026-06-01T08:00:00Z');
    const now = new Date('2026-06-01T13:00:00Z'); // 5h later
    const event = makeEscalation('medium', { created_at: createdAt });
    const sla = getEscalationSLAInfo(event, now);
    expect(sla.status).toBe('overdue');
    expect(sla.hoursElapsed).toBeCloseTo(5);
    expect(sla.hoursRemaining).toBe(0);
  });

  it('returns overdue at exactly 4h — boundary inclusive', () => {
    const createdAt = new Date('2026-06-01T08:00:00Z');
    const now = new Date('2026-06-01T12:00:00Z'); // exactly 4h
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
```

- [ ] **Step 2: Run test to verify it fails**

```
npx jest tests/safety/escalation-router.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../../src/safety/escalation-router'`

- [ ] **Step 3: Write implementation**

Create `src/safety/escalation-router.ts`:

```typescript
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

  // Member: supportive "we've got you" message
  notifications.push({
    id: randomUUID(),
    recipient_id: input.escalation.member_id,
    recipient_type: 'member',
    type: 'escalation_created',
    ts: now,
    read_at: null,
  });

  // Coordinator: always notified
  notifications.push({
    id: randomUUID(),
    recipient_id: input.coordinator_id,
    recipient_type: 'coordinator',
    type: 'escalation_created',
    ts: now,
    read_at: null,
  });

  // Clinician: when high severity OR clinician_id explicitly provided
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

  return { notifications };
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
```

- [ ] **Step 4: Run test to verify it passes**

```
npx jest tests/safety/escalation-router.test.ts --no-coverage
```

Expected: PASS — 16 tests

- [ ] **Step 5: Commit**

```
git add src/safety/escalation-router.ts tests/safety/escalation-router.test.ts
git commit -m "feat(part4): escalation routing — member/coordinator/clinician notifications + 4h ack SLA"
```

---

## Task 4: Barrel + main export update

**Files:**
- Create: `src/safety/index.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create the safety barrel**

Create `src/safety/index.ts`:

```typescript
export * from './checkin-red-flag';
export * from './checkin-summariser';
export * from './escalation-router';
```

- [ ] **Step 2: Add safety exports to the main barrel**

Edit `src/index.ts` — append these three lines after the last engagement export:

```typescript
export * from './safety/checkin-red-flag';
export * from './safety/checkin-summariser';
export * from './safety/escalation-router';
```

Complete `src/index.ts` after edit:

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
export * from './engagement/action-service';
export * from './engagement/nudge-service';
export * from './engagement/checkin-service';
export * from './engagement/outcome-service';
export * from './safety/checkin-red-flag';
export * from './safety/checkin-summariser';
export * from './safety/escalation-router';
```

- [ ] **Step 3: Run the full test suite**

```
npx jest --no-coverage
```

Expected: all existing 265 tests pass + the 39 new safety tests = **304 tests, 0 failures** across 17 suites.

- [ ] **Step 4: Commit**

```
git add src/safety/index.ts src/index.ts
git commit -m "feat(part4): barrel export — Part 4 Safety complete (US-4.C1/C2/C3)"
```

---

## Self-review

### Spec coverage

| Spec requirement | Task |
|---|---|
| US-4.C1: deterministic rules over check-in (marked low mood, sharp symptom change) → `EscalationEvent(severity)` | Task 1 |
| US-4.C1: defined triggers always fire; no silent suppression | Task 1 (all 3 rules independent) |
| US-4.C2: summarises check-in into structured signal for queue; AI never decides clinical action | Task 2 |
| US-4.C2: original data preserved | Task 2 (`check_in_id` copied, `CheckIn` not mutated) |
| US-4.C3: routes `EscalationEvent` → coordinator queue + clinician flag + member "we've got you" message | Task 3 (`routeEscalation`) |
| US-4.C3: ack SLA = 4h; overdue → status='overdue' | Task 3 (`ESCALATION_ACK_SLA_HOURS`, `getEscalationSLAInfo`) |
| US-4.C3: escalation visible immediately | Task 3 (synchronous, no queue) |
| US-4.C3: member sees supportive message | Task 3 (member always notified first) |
| US-4.C3: no autonomous crisis triage | Task 3 (routes to humans only, no AI) |

### Placeholder scan

No TBD, TODO, or missing code blocks found.

### Type consistency

- `CheckInRedFlagInput.checkIn: CheckIn` — used consistently in Task 1
- `CheckInRedFlagResult.escalations: readonly EscalationEvent[]` — referenced in Task 2's `summariseCheckIn` parameter
- `CheckInSummary.check_in_id: string` — set from `checkIn.id` (string) ✓
- `EscalationRoutingInput.escalation: EscalationEvent` — consistent throughout Task 3
- `EscalationSLAInfo` — returned by `getEscalationSLAInfo`, not used in other tasks ✓
- All barrel re-exports in Task 4 match the export names in Tasks 1–3 ✓
