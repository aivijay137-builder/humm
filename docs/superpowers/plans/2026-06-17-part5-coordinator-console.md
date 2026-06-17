# Part 5 — Coordinator Console (US-5.C1–C3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the coordinator-facing domain logic — ranked attention queue, member timeline, and inline actions (nudge, message, mark-handled) — covering US-5.C1, US-5.C2, and US-5.C3.

**Architecture:** Three pure-function modules under `src/coordinator/`. No DB, no AI, no side effects — all functions accept pre-fetched domain objects and return new ones. US-5.C1 produces a ranked `AttentionQueueEntry[]` from per-member signal inputs; US-5.C2 merges all member events into a chronological `MemberTimeline`; US-5.C3 provides three coordinator actions as pure functions.

**Tech Stack:** TypeScript 5.x, Jest 29 + ts-jest, `randomUUID` from `node:crypto`, no third-party packages.

---

## Domain background (read before coding)

All types live in `src/domain/types.ts`. Relevant ones for Part 5:

```typescript
export type MemberId = string & { readonly _brand: 'MemberId' };
export type CarePlanId = string & { readonly _brand: 'CarePlanId' };
export function asMemberId(s: string): MemberId { return s as MemberId; }
export function asCarePlanId(s: string): CarePlanId { return s as CarePlanId; }

export type CarePlanStatus =
  | 'draft' | 'pending_review' | 'approved' | 'published'
  | 'changes_requested' | 'rejected' | 'archived';

export interface CarePlan {
  readonly id: CarePlanId;
  readonly member_id: MemberId;
  readonly version: number;
  readonly status: CarePlanStatus;
  readonly approver_id: string | null;
  readonly approved_at: Date | null;
  readonly rejection_reason: string | null;
  readonly phase: 1 | 2 | 3;
  readonly recommendations: readonly Recommendation[];
  readonly created_at: Date;
  readonly updated_at: Date;
}

export type SymptomSeverity = 'mild' | 'moderate' | 'marked';
export interface CheckIn {
  readonly id: string;
  readonly member_id: MemberId;
  readonly week: number;
  readonly cycle_date: Date | null;
  readonly top_symptom_severity: SymptomSeverity | null;
  readonly meds_taken: boolean;
  readonly lifestyle_chips: readonly string[];
  readonly mood: readonly [number, number];
  readonly created_at: Date;
}

export type OutcomeMetric = 'cycle_regularity' | 'symptom_severity' | 'mood' | 'milestone';
export interface Outcome {
  readonly id: string;
  readonly member_id: MemberId;
  readonly metric: OutcomeMetric;
  readonly value: number | string;
  readonly ts: Date;
}

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

export type NotificationRecipientType = 'member' | 'clinician' | 'coordinator';
// NotificationType will have 'coordinator_message' added in Task 3
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
| Create | `src/coordinator/attention-queue.ts` | US-5.C1 — ranked attention queue |
| Create | `src/coordinator/member-timeline.ts` | US-5.C2 — chronological member event timeline |
| Create | `src/coordinator/inline-actions.ts` | US-5.C3 — nudge, message, mark-handled |
| Create | `src/coordinator/index.ts` | barrel |
| Modify | `src/domain/types.ts` | add `'coordinator_message'` to NotificationType |
| Modify | `src/index.ts` | add coordinator exports |
| Create | `tests/coordinator/attention-queue.test.ts` | |
| Create | `tests/coordinator/member-timeline.test.ts` | |
| Create | `tests/coordinator/inline-actions.test.ts` | |

---

## Task 1: Attention queue — ranked member list (US-5.C1)

**Files:**
- Create: `src/coordinator/attention-queue.ts`
- Create: `tests/coordinator/attention-queue.test.ts`

**Priority tiers (exclusive — each member takes their highest tier):**
1. `'escalation'` (priority 1) — has at least one open EscalationEvent
2. `'lapse'` (priority 2) — missed a check-in: `currentWeek > lastCheckIn.week + 1`, OR no check-ins and `currentWeek > 1`
3. `'milestone'` (priority 3) — has at least one milestone Outcome
4. `'plan_due'` (priority 4) — carePlan status is `'draft'` or `'pending_review'`
5. None — excluded from queue

**Within-tier sort (secondary):**
- escalation tier: oldest `openEscalation.created_at` first (SLA risk)
- plan_due tier: oldest `carePlan.updated_at` first
- other tiers: stable (no secondary sort)

- [ ] **Step 1: Write the failing test**

Create `tests/coordinator/attention-queue.test.ts`:

```typescript
import {
  buildAttentionQueue,
  AttentionQueueInput,
} from '../../src/coordinator/attention-queue';
import {
  asMemberId,
  asCarePlanId,
  CarePlan,
  CarePlanStatus,
  CheckIn,
  EscalationEvent,
  Outcome,
} from '../../src/domain/types';
import { randomUUID } from 'node:crypto';

const M1 = asMemberId('m-001');

function makeEscalation(overrides: Partial<EscalationEvent> = {}): EscalationEvent {
  return {
    id: randomUUID(),
    member_id: M1,
    trigger: 'test',
    severity: 'medium',
    status: 'open',
    created_at: new Date(),
    acknowledged_at: null,
    ...overrides,
  };
}

function makeCheckIn(week: number): CheckIn {
  return {
    id: randomUUID(),
    member_id: M1,
    week,
    cycle_date: null,
    top_symptom_severity: null,
    meds_taken: true,
    lifestyle_chips: [],
    mood: [3, 3],
    created_at: new Date(),
  };
}

function makeCarePlan(status: CarePlanStatus): CarePlan {
  const now = new Date();
  return {
    id: asCarePlanId(randomUUID()),
    member_id: M1,
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

function makeMilestone(): Outcome {
  return {
    id: randomUUID(),
    member_id: M1,
    metric: 'milestone',
    value: '4_week_streak',
    ts: new Date(),
  };
}

function baseInput(member_id: typeof M1, overrides: Partial<AttentionQueueInput> = {}): AttentionQueueInput {
  return {
    member_id,
    openEscalations: [],
    checkIns: [],
    carePlan: null,
    currentWeek: 3,
    milestones: [],
    ...overrides,
  };
}

describe('buildAttentionQueue', () => {
  it('excludes members with no triggers', () => {
    const entries = buildAttentionQueue([
      baseInput(M1, { checkIns: [makeCheckIn(3)] }), // no lapse, no escalation
    ]);
    expect(entries).toHaveLength(0);
  });

  it('includes member with open escalation at priority 1', () => {
    const entries = buildAttentionQueue([
      baseInput(M1, { openEscalations: [makeEscalation()] }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.category).toBe('escalation');
    expect(entries[0]!.priority).toBe(1);
  });

  it('includes member with lapse (missed week) at priority 2', () => {
    // currentWeek=3, lastCheckIn.week=1 → 3 > 1+1 → lapse
    const entries = buildAttentionQueue([
      baseInput(M1, { checkIns: [makeCheckIn(1)], currentWeek: 3 }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.category).toBe('lapse');
    expect(entries[0]!.priority).toBe(2);
  });

  it('includes member with no check-ins and currentWeek > 1 as lapse', () => {
    const entries = buildAttentionQueue([
      baseInput(M1, { checkIns: [], currentWeek: 2 }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.category).toBe('lapse');
  });

  it('does not flag lapse when currentWeek === 1 and no check-ins', () => {
    const entries = buildAttentionQueue([
      baseInput(M1, { checkIns: [], currentWeek: 1 }),
    ]);
    expect(entries).toHaveLength(0);
  });

  it('does not flag lapse when check-in is only 1 week behind', () => {
    // currentWeek=3, lastCheckIn.week=2 → 3 > 2+1 is false
    const entries = buildAttentionQueue([
      baseInput(M1, { checkIns: [makeCheckIn(2)], currentWeek: 3 }),
    ]);
    expect(entries).toHaveLength(0);
  });

  it('includes member with milestone at priority 3', () => {
    const entries = buildAttentionQueue([
      baseInput(M1, { milestones: [makeMilestone()], checkIns: [makeCheckIn(3)] }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.category).toBe('milestone');
    expect(entries[0]!.priority).toBe(3);
  });

  it('includes member with draft care plan at priority 4', () => {
    const entries = buildAttentionQueue([
      baseInput(M1, { carePlan: makeCarePlan('draft'), checkIns: [makeCheckIn(3)] }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.category).toBe('plan_due');
    expect(entries[0]!.priority).toBe(4);
  });

  it('includes member with pending_review care plan at priority 4', () => {
    const entries = buildAttentionQueue([
      baseInput(M1, { carePlan: makeCarePlan('pending_review'), checkIns: [makeCheckIn(3)] }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.category).toBe('plan_due');
  });

  it('escalation takes priority over lapse for same member', () => {
    // member has both open escalation AND lapsed check-ins → escalation wins
    const entries = buildAttentionQueue([
      baseInput(M1, {
        openEscalations: [makeEscalation()],
        checkIns: [makeCheckIn(1)], // lapsed
        currentWeek: 5,
      }),
    ]);
    expect(entries[0]!.category).toBe('escalation');
  });

  it('orders entries: escalation > lapse > milestone > plan_due', () => {
    const mEsc = asMemberId('m-esc');
    const mLap = asMemberId('m-lap');
    const mMil = asMemberId('m-mil');
    const mPlan = asMemberId('m-plan');
    const entries = buildAttentionQueue([
      baseInput(mPlan, { carePlan: makeCarePlan('draft'), checkIns: [makeCheckIn(3)] }),
      baseInput(mMil, { milestones: [makeMilestone()], checkIns: [makeCheckIn(3)] }),
      baseInput(mEsc, { openEscalations: [makeEscalation()] }),
      baseInput(mLap, { checkIns: [makeCheckIn(1)], currentWeek: 3 }),
    ]);
    expect(entries[0]!.member_id).toBe(mEsc);
    expect(entries[1]!.member_id).toBe(mLap);
    expect(entries[2]!.member_id).toBe(mMil);
    expect(entries[3]!.member_id).toBe(mPlan);
  });

  it('within escalation tier, oldest escalation surfaces first (SLA risk)', () => {
    const olderTime = new Date('2026-06-01T08:00:00Z');
    const newerTime = new Date('2026-06-01T12:00:00Z');
    const mOld = asMemberId('m-old');
    const mNew = asMemberId('m-new');
    const entries = buildAttentionQueue([
      baseInput(mNew, { openEscalations: [makeEscalation({ created_at: newerTime })] }),
      baseInput(mOld, { openEscalations: [makeEscalation({ created_at: olderTime })] }),
    ]);
    expect(entries[0]!.member_id).toBe(mOld);
    expect(entries[1]!.member_id).toBe(mNew);
  });

  it('openEscalation on the entry is the oldest open escalation', () => {
    const olderTime = new Date('2026-06-01T08:00:00Z');
    const newerTime = new Date('2026-06-01T12:00:00Z');
    const entries = buildAttentionQueue([
      baseInput(M1, {
        openEscalations: [
          makeEscalation({ created_at: newerTime }),
          makeEscalation({ created_at: olderTime }),
        ],
      }),
    ]);
    expect(entries[0]!.openEscalation?.created_at).toEqual(olderTime);
  });

  it('lastCheckIn on the entry is the most recent check-in by week', () => {
    const entries = buildAttentionQueue([
      baseInput(M1, {
        openEscalations: [makeEscalation()],
        checkIns: [makeCheckIn(1), makeCheckIn(3), makeCheckIn(2)],
      }),
    ]);
    expect(entries[0]!.lastCheckIn?.week).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx jest tests/coordinator/attention-queue.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../../src/coordinator/attention-queue'`

- [ ] **Step 3: Write implementation**

Create `src/coordinator/attention-queue.ts`:

```typescript
import { CarePlan, CheckIn, EscalationEvent, MemberId, Outcome } from '../domain/types';

export type AttentionCategory = 'escalation' | 'lapse' | 'milestone' | 'plan_due';

export interface AttentionQueueInput {
  readonly member_id: MemberId;
  readonly openEscalations: readonly EscalationEvent[]; // caller pre-filters to status='open'
  readonly checkIns: readonly CheckIn[];
  readonly carePlan: CarePlan | null;
  readonly currentWeek: number;
  readonly milestones: readonly Outcome[]; // caller pre-filters to metric='milestone'
}

export interface AttentionQueueEntry {
  readonly member_id: MemberId;
  readonly category: AttentionCategory;
  readonly priority: 1 | 2 | 3 | 4;
  readonly openEscalation: EscalationEvent | null;
  readonly lastCheckIn: CheckIn | null;
  readonly carePlan: CarePlan | null;
}

function categoryPriority(c: AttentionCategory): 1 | 2 | 3 | 4 {
  if (c === 'escalation') return 1;
  if (c === 'lapse') return 2;
  if (c === 'milestone') return 3;
  return 4;
}

function getLastCheckIn(checkIns: readonly CheckIn[]): CheckIn | null {
  if (checkIns.length === 0) return null;
  return [...checkIns].sort((a, b) => b.week - a.week)[0] ?? null;
}

function getOldestEscalation(escalations: readonly EscalationEvent[]): EscalationEvent | null {
  if (escalations.length === 0) return null;
  return escalations.reduce((oldest, e) =>
    e.created_at < oldest.created_at ? e : oldest
  );
}

function isLapsed(currentWeek: number, lastCheckIn: CheckIn | null): boolean {
  if (lastCheckIn === null) return currentWeek > 1;
  return currentWeek > lastCheckIn.week + 1;
}

function categorize(input: AttentionQueueInput): AttentionCategory | null {
  if (input.openEscalations.length > 0) return 'escalation';
  const lastCheckIn = getLastCheckIn(input.checkIns);
  if (isLapsed(input.currentWeek, lastCheckIn)) return 'lapse';
  if (input.milestones.length > 0) return 'milestone';
  if (
    input.carePlan !== null &&
    (input.carePlan.status === 'draft' || input.carePlan.status === 'pending_review')
  ) return 'plan_due';
  return null;
}

export function buildAttentionQueue(
  members: readonly AttentionQueueInput[],
): AttentionQueueEntry[] {
  const entries: AttentionQueueEntry[] = [];

  for (const member of members) {
    const category = categorize(member);
    if (category === null) continue;

    entries.push({
      member_id: member.member_id,
      category,
      priority: categoryPriority(category),
      openEscalation: getOldestEscalation(member.openEscalations),
      lastCheckIn: getLastCheckIn(member.checkIns),
      carePlan: member.carePlan,
    });
  }

  return entries.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.category === 'escalation' && b.category === 'escalation') {
      const aTs = a.openEscalation?.created_at.getTime() ?? 0;
      const bTs = b.openEscalation?.created_at.getTime() ?? 0;
      return aTs - bTs;
    }
    if (a.category === 'plan_due' && b.category === 'plan_due') {
      const aTs = a.carePlan?.updated_at.getTime() ?? 0;
      const bTs = b.carePlan?.updated_at.getTime() ?? 0;
      return aTs - bTs;
    }
    return 0;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npx jest tests/coordinator/attention-queue.test.ts --no-coverage
```

Expected: PASS — 16 tests

- [ ] **Step 5: Verify full suite still passes**

```
npx jest --no-coverage
```

Expected: 308 + 16 = 324 tests, 0 failures

- [ ] **Step 6: Commit**

```
git add src/coordinator/attention-queue.ts tests/coordinator/attention-queue.test.ts
git commit -m "feat(part5): attention queue — ranked member list by escalation/lapse/milestone/plan_due"
```

---

## Task 2: Member timeline (US-5.C2)

**Files:**
- Create: `src/coordinator/member-timeline.ts`
- Create: `tests/coordinator/member-timeline.test.ts`

Maps all member-linked objects into a single chronological list sorted by `ts` descending (most recent first). Each source produces one or two timeline events:
- CheckIn → one `check_in` event (ts = `checkIn.created_at`)
- EscalationEvent → one `escalation_opened` event (ts = `escalation.created_at`); if `acknowledged_at !== null`, also one `escalation_acknowledged` event (ts = `escalation.acknowledged_at`)
- CarePlan → one `care_plan_created` event (ts = `carePlan.created_at`)
- Milestone Outcome → one `milestone` event (ts = `outcome.ts`)

Uses a discriminated union so callers can type-narrow on `type`.

- [ ] **Step 1: Write the failing test**

Create `tests/coordinator/member-timeline.test.ts`:

```typescript
import { buildMemberTimeline, MemberTimelineInput } from '../../src/coordinator/member-timeline';
import {
  asMemberId,
  asCarePlanId,
  CarePlan,
  CheckIn,
  EscalationEvent,
  Outcome,
} from '../../src/domain/types';
import { randomUUID } from 'node:crypto';

const memberId = asMemberId('m-001');

function makeCheckIn(createdAt: Date): CheckIn {
  return {
    id: randomUUID(),
    member_id: memberId,
    week: 1,
    cycle_date: null,
    top_symptom_severity: null,
    meds_taken: true,
    lifestyle_chips: [],
    mood: [3, 3],
    created_at: createdAt,
  };
}

function makeEscalation(createdAt: Date, acknowledgedAt: Date | null = null): EscalationEvent {
  return {
    id: randomUUID(),
    member_id: memberId,
    trigger: 'test',
    severity: 'medium',
    status: acknowledgedAt ? 'acknowledged' : 'open',
    created_at: createdAt,
    acknowledged_at: acknowledgedAt,
  };
}

function makeCarePlan(createdAt: Date): CarePlan {
  return {
    id: asCarePlanId(randomUUID()),
    member_id: memberId,
    version: 1,
    status: 'draft',
    approver_id: null,
    approved_at: null,
    rejection_reason: null,
    phase: 1,
    recommendations: [],
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function makeMilestone(ts: Date): Outcome {
  return {
    id: randomUUID(),
    member_id: memberId,
    metric: 'milestone',
    value: '4_week_streak',
    ts,
  };
}

function emptyInput(): MemberTimelineInput {
  return {
    member_id: memberId,
    checkIns: [],
    escalations: [],
    carePlans: [],
    milestones: [],
  };
}

describe('buildMemberTimeline', () => {
  it('returns empty events for a member with no data', () => {
    const timeline = buildMemberTimeline(emptyInput());
    expect(timeline.member_id).toBe(memberId);
    expect(timeline.events).toHaveLength(0);
  });

  it('maps a CheckIn to a check_in event with ts=created_at', () => {
    const ts = new Date('2026-06-01T10:00:00Z');
    const ci = makeCheckIn(ts);
    const timeline = buildMemberTimeline({ ...emptyInput(), checkIns: [ci] });
    expect(timeline.events).toHaveLength(1);
    const ev = timeline.events[0]!;
    expect(ev.type).toBe('check_in');
    expect(ev.ts).toEqual(ts);
    if (ev.type === 'check_in') expect(ev.checkIn).toBe(ci);
  });

  it('maps an open EscalationEvent to one escalation_opened event', () => {
    const ts = new Date('2026-06-01T10:00:00Z');
    const esc = makeEscalation(ts);
    const timeline = buildMemberTimeline({ ...emptyInput(), escalations: [esc] });
    expect(timeline.events).toHaveLength(1);
    expect(timeline.events[0]!.type).toBe('escalation_opened');
    expect(timeline.events[0]!.ts).toEqual(ts);
  });

  it('maps an acknowledged EscalationEvent to two events', () => {
    const openedAt = new Date('2026-06-01T08:00:00Z');
    const ackedAt = new Date('2026-06-01T10:00:00Z');
    const esc = makeEscalation(openedAt, ackedAt);
    const timeline = buildMemberTimeline({ ...emptyInput(), escalations: [esc] });
    expect(timeline.events).toHaveLength(2);
    const types = timeline.events.map(e => e.type);
    expect(types).toContain('escalation_opened');
    expect(types).toContain('escalation_acknowledged');
  });

  it('maps a CarePlan to a care_plan_created event', () => {
    const ts = new Date('2026-06-01T09:00:00Z');
    const cp = makeCarePlan(ts);
    const timeline = buildMemberTimeline({ ...emptyInput(), carePlans: [cp] });
    expect(timeline.events).toHaveLength(1);
    expect(timeline.events[0]!.type).toBe('care_plan_created');
    expect(timeline.events[0]!.ts).toEqual(ts);
  });

  it('maps a milestone Outcome to a milestone event', () => {
    const ts = new Date('2026-06-01T11:00:00Z');
    const m = makeMilestone(ts);
    const timeline = buildMemberTimeline({ ...emptyInput(), milestones: [m] });
    expect(timeline.events).toHaveLength(1);
    expect(timeline.events[0]!.type).toBe('milestone');
    expect(timeline.events[0]!.ts).toEqual(ts);
  });

  it('sorts all events by ts descending (most recent first)', () => {
    const t1 = new Date('2026-06-01T08:00:00Z');
    const t2 = new Date('2026-06-01T10:00:00Z');
    const t3 = new Date('2026-06-01T12:00:00Z');
    const timeline = buildMemberTimeline({
      ...emptyInput(),
      checkIns: [makeCheckIn(t1)],
      carePlans: [makeCarePlan(t3)],
      milestones: [makeMilestone(t2)],
    });
    expect(timeline.events).toHaveLength(3);
    expect(timeline.events[0]!.ts).toEqual(t3);
    expect(timeline.events[1]!.ts).toEqual(t2);
    expect(timeline.events[2]!.ts).toEqual(t1);
  });

  it('handles multiple objects of each type', () => {
    const t1 = new Date('2026-06-01T08:00:00Z');
    const t2 = new Date('2026-06-02T08:00:00Z');
    const timeline = buildMemberTimeline({
      ...emptyInput(),
      checkIns: [makeCheckIn(t1), makeCheckIn(t2)],
    });
    expect(timeline.events).toHaveLength(2);
  });

  it('copies member_id to the timeline', () => {
    const timeline = buildMemberTimeline(emptyInput());
    expect(timeline.member_id).toBe(memberId);
  });

  it('acknowledged escalation events reference the same escalation object', () => {
    const esc = makeEscalation(
      new Date('2026-06-01T08:00:00Z'),
      new Date('2026-06-01T10:00:00Z'),
    );
    const timeline = buildMemberTimeline({ ...emptyInput(), escalations: [esc] });
    for (const ev of timeline.events) {
      if (ev.type === 'escalation_opened' || ev.type === 'escalation_acknowledged') {
        expect(ev.escalation).toBe(esc);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx jest tests/coordinator/member-timeline.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../../src/coordinator/member-timeline'`

- [ ] **Step 3: Write implementation**

Create `src/coordinator/member-timeline.ts`:

```typescript
import { CarePlan, CheckIn, EscalationEvent, MemberId, Outcome } from '../domain/types';

export type TimelineEventType =
  | 'check_in'
  | 'escalation_opened'
  | 'escalation_acknowledged'
  | 'care_plan_created'
  | 'milestone';

export type TimelineEvent =
  | { readonly ts: Date; readonly type: 'check_in'; readonly checkIn: CheckIn }
  | { readonly ts: Date; readonly type: 'escalation_opened'; readonly escalation: EscalationEvent }
  | { readonly ts: Date; readonly type: 'escalation_acknowledged'; readonly escalation: EscalationEvent }
  | { readonly ts: Date; readonly type: 'care_plan_created'; readonly carePlan: CarePlan }
  | { readonly ts: Date; readonly type: 'milestone'; readonly outcome: Outcome };

export interface MemberTimelineInput {
  readonly member_id: MemberId;
  readonly checkIns: readonly CheckIn[];
  readonly escalations: readonly EscalationEvent[];
  readonly carePlans: readonly CarePlan[];
  readonly milestones: readonly Outcome[];
}

export interface MemberTimeline {
  readonly member_id: MemberId;
  readonly events: readonly TimelineEvent[];
}

export function buildMemberTimeline(input: MemberTimelineInput): MemberTimeline {
  const events: TimelineEvent[] = [];

  for (const checkIn of input.checkIns) {
    events.push({ ts: checkIn.created_at, type: 'check_in', checkIn });
  }

  for (const escalation of input.escalations) {
    events.push({ ts: escalation.created_at, type: 'escalation_opened', escalation });
    if (escalation.acknowledged_at !== null) {
      events.push({ ts: escalation.acknowledged_at, type: 'escalation_acknowledged', escalation });
    }
  }

  for (const carePlan of input.carePlans) {
    events.push({ ts: carePlan.created_at, type: 'care_plan_created', carePlan });
  }

  for (const outcome of input.milestones) {
    events.push({ ts: outcome.ts, type: 'milestone', outcome });
  }

  return {
    member_id: input.member_id,
    events: events.sort((a, b) => b.ts.getTime() - a.ts.getTime()),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npx jest tests/coordinator/member-timeline.test.ts --no-coverage
```

Expected: PASS — 10 tests

- [ ] **Step 5: Verify full suite still passes**

```
npx jest --no-coverage
```

Expected: 324 + 10 = ~334 tests, 0 failures

- [ ] **Step 6: Commit**

```
git add src/coordinator/member-timeline.ts tests/coordinator/member-timeline.test.ts
git commit -m "feat(part5): member timeline — chronological event history for coordinator view"
```

---

## Task 3: Inline actions (US-5.C3) + NotificationType update

**Files:**
- Modify: `src/domain/types.ts` — add `'coordinator_message'` to `NotificationType`
- Create: `src/coordinator/inline-actions.ts`
- Create: `tests/coordinator/inline-actions.test.ts`

Three coordinator actions:
1. **`nudgeMember(member_id)`** → `Notification` with `type='check_in_due'` (prompts member to check in)
2. **`sendMessage(member_id)`** → `Notification` with `type='coordinator_message'` (direct coordinator message)
3. **`markHandled(escalation)`** → `EscalationEvent` with `status='resolved'` (closes the escalation)

- [ ] **Step 1: Add `'coordinator_message'` to NotificationType in src/domain/types.ts**

In `src/domain/types.ts`, find:
```typescript
export type NotificationType =
  | 'plan_under_review'
  | 'plan_approved'
  | 'plan_rejected'
  | 'check_in_due'
  | 'lapse_nudge'
  | 'milestone'
  | 'escalation_created'
  | 'escalation_ack';
```

Change to:
```typescript
export type NotificationType =
  | 'plan_under_review'
  | 'plan_approved'
  | 'plan_rejected'
  | 'check_in_due'
  | 'lapse_nudge'
  | 'milestone'
  | 'escalation_created'
  | 'escalation_ack'
  | 'coordinator_message';
```

Run `npx jest --no-coverage` after this edit to confirm all ~334 existing tests still pass (additive change, nothing breaks).

- [ ] **Step 2: Write the failing test**

Create `tests/coordinator/inline-actions.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**

```
npx jest tests/coordinator/inline-actions.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../../src/coordinator/inline-actions'`

- [ ] **Step 4: Write implementation**

Create `src/coordinator/inline-actions.ts`:

```typescript
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
```

- [ ] **Step 5: Run test to verify it passes**

```
npx jest tests/coordinator/inline-actions.test.ts --no-coverage
```

Expected: PASS — 10 tests

- [ ] **Step 6: Verify full suite still passes**

```
npx jest --no-coverage
```

Expected: ~334 + 10 = ~344 tests, 0 failures

- [ ] **Step 7: Commit**

```
git add src/domain/types.ts src/coordinator/inline-actions.ts tests/coordinator/inline-actions.test.ts
git commit -m "feat(part5): inline actions — nudge, coordinator_message, mark-handled"
```

---

## Task 4: Barrel + main export update

**Files:**
- Create: `src/coordinator/index.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create the coordinator barrel**

Create `src/coordinator/index.ts`:

```typescript
export * from './attention-queue';
export * from './member-timeline';
export * from './inline-actions';
```

- [ ] **Step 2: Append coordinator exports to src/index.ts**

Edit `src/index.ts` — append after the last safety export:

```typescript
export * from './coordinator/attention-queue';
export * from './coordinator/member-timeline';
export * from './coordinator/inline-actions';
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
export * from './coordinator/attention-queue';
export * from './coordinator/member-timeline';
export * from './coordinator/inline-actions';
```

- [ ] **Step 3: Run the full test suite**

```
npx jest --no-coverage
```

Expected: ~344 tests, 0 failures, across all suites.

- [ ] **Step 4: Commit**

```
git add src/coordinator/index.ts src/index.ts
git commit -m "feat(part5): barrel export — Part 5 Coordinator Console complete (US-5.C1/C2/C3)"
```

---

## Self-review

### Spec coverage

| Spec requirement | Task |
|---|---|
| US-5.C1: ranked list (escalation > lapse > milestone > plan_due) | Task 1 (`buildAttentionQueue`, `categoryPriority`) |
| US-5.C1: highest-priority member surfaces top | Task 1 (sort by priority ascending) |
| US-5.C1: within escalation tier, oldest first (SLA risk) | Task 1 (secondary sort on `created_at`) |
| US-5.C1: filter chips support | Task 1 (`category` field on each entry — frontend filters by category) |
| US-5.C1: reads EscalationEvent, CheckIn, CarePlan | Task 1 (inputs to `buildAttentionQueue`) |
| US-5.C2: full history in one view | Task 2 (`buildMemberTimeline` merges all objects) |
| US-5.C2: chronological (most recent first) | Task 2 (sort by `ts` descending) |
| US-5.C2: reads all member-linked objects | Task 2 (`MemberTimelineInput` accepts all types) |
| US-5.C3: nudge | Task 3 (`nudgeMember` → `check_in_due` notification) |
| US-5.C3: message | Task 3 (`sendMessage` → `coordinator_message` notification) |
| US-5.C3: mark-handled (EscalationEvent.status update) | Task 3 (`markHandled` → `status='resolved'`) |
| US-5.C3: action resolvable without leaving the queue | Task 3 (pure functions, no navigation required) |

### Placeholder scan

No TBD, TODO, or missing code found.

### Type consistency

- `AttentionQueueInput.openEscalations: readonly EscalationEvent[]` — referenced in Task 1 tests as `openEscalations: [makeEscalation()]` ✓
- `AttentionQueueEntry.openEscalation: EscalationEvent | null` — singular, set by `getOldestEscalation` ✓
- `TimelineEvent` discriminated union — `type` field on each variant used as discriminant in tests ✓
- `nudgeMember`, `sendMessage`, `markHandled` — all exported, all referenced in Task 4 barrel ✓
- `'coordinator_message'` added to `NotificationType` in Task 3 before `sendMessage` uses it ✓
