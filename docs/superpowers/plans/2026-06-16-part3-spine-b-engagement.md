# Part 3 — Spine B Engagement Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the member-facing weekly engagement loop — action selection (US-2), nudge engine (US-2.C3), structured check-in (US-3.C1), and outcome/milestone detection (US-3.C2–C3).

**Architecture:** One new module `src/engagement/` with four focused files. `action-service.ts` generates and transitions weekly Actions from a published CarePlan. `nudge-service.ts` evaluates three rule-based triggers (check_in_due, lapse, milestone) and produces typed Notifications. `checkin-service.ts` is a validated factory for CheckIn records. `outcome-service.ts` derives trend Outcomes from ≥2 check-ins and detects milestone events. All functions are pure (no I/O, no external state) — callers own persistence.

**Tech Stack:** TypeScript 5.x · Node 20 · Jest 29 (ts-jest) · existing domain types from Part 0

---

## File map

| File | Responsibility |
|---|---|
| `src/engagement/action-service.ts` | `createWeeklyActions` · `selectPrimaryAction` · `completeAction` · `skipAction` |
| `src/engagement/nudge-service.ts` | `generateNudges` · `NudgeContext` · frequency-capped Notification production |
| `src/engagement/checkin-service.ts` | `createCheckIn` · `CheckInInput` · `InvalidMoodError` |
| `src/engagement/outcome-service.ts` | `deriveOutcomes` · `detectMilestones` |
| `src/engagement/index.ts` | Barrel (created in Task 4) |
| `src/index.ts` | MODIFY: re-export `src/engagement` |
| `tests/engagement/action-service.test.ts` | Weekly action creation + transitions |
| `tests/engagement/nudge-service.test.ts` | Nudge trigger logic |
| `tests/engagement/checkin-service.test.ts` | CheckIn factory + validation |
| `tests/engagement/outcome-service.test.ts` | Trend derivation + milestone detection |

### Key existing types (do NOT modify)

```typescript
// src/domain/types.ts
export type ActionStatus = 'pending' | 'complete' | 'skipped';
export interface Action {
  readonly id: string; readonly care_plan_id: CarePlanId;
  readonly recommendation_id: RecommendationId; readonly week: number;
  readonly status: ActionStatus; readonly is_primary: boolean;
  readonly completed_at: Date | null;
}
export type SymptomSeverity = 'mild' | 'moderate' | 'marked';
export interface CheckIn {
  readonly id: string; readonly member_id: MemberId; readonly week: number;
  readonly cycle_date: Date | null; readonly top_symptom_severity: SymptomSeverity | null;
  readonly meds_taken: boolean; readonly lifestyle_chips: readonly string[];
  readonly mood: readonly [number, number]; // values 1–5
  readonly created_at: Date;
}
export type OutcomeMetric = 'cycle_regularity' | 'symptom_severity' | 'mood' | 'milestone';
export interface Outcome {
  readonly id: string; readonly member_id: MemberId;
  readonly metric: OutcomeMetric; readonly value: number | string; readonly ts: Date;
}
export type NotificationType = 'plan_under_review' | 'plan_approved' | 'plan_rejected'
  | 'check_in_due' | 'lapse_nudge' | 'milestone' | 'escalation_created' | 'escalation_ack';
export interface Notification {
  readonly id: string; readonly recipient_id: string;
  readonly recipient_type: NotificationRecipientType; readonly type: NotificationType;
  readonly ts: Date; readonly read_at: Date | null;
}
export interface CarePlan {
  readonly id: CarePlanId; readonly member_id: MemberId; readonly version: number;
  readonly status: CarePlanStatus; readonly recommendations: readonly Recommendation[];
  // ... (approver_id, approved_at, rejection_reason, phase, created_at, updated_at)
}
export interface Recommendation {
  readonly id: RecommendationId; readonly module_id: string; readonly title: string;
  readonly action: string; readonly cadence: string; readonly phase: 1 | 2 | 3;
  readonly evidence: Evidence;
}
export function asCarePlanId(s: string): CarePlanId
export function asMemberId(s: string): MemberId
export function asRecommendationId(s: string): RecommendationId
```

---

## Task 1: Action service

**Files:**
- Create: `src/engagement/action-service.ts`
- Test: `tests/engagement/action-service.test.ts`

Spec US-2.C1 + US-2.C2: `createWeeklyActions` maps each Recommendation → one pending Action per week, marking exactly one as primary. Primary selection: first phase-1 recommendation; falls back to first overall if none are phase-1. `completeAction` / `skipAction` return immutable updated copies. `selectPrimaryAction` surfaces the single primary for UI display.

- [ ] **Step 1: Write the failing tests**

Create `tests/engagement/action-service.test.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import {
  createWeeklyActions,
  selectPrimaryAction,
  completeAction,
  skipAction,
} from '../../src/engagement/action-service';
import type { CarePlan, Recommendation } from '../../src/domain/types';
import { asCarePlanId, asMemberId, asRecommendationId } from '../../src/domain/types';

const validEvidence = {
  claim: 'A claim.', rationale: 'A rationale.',
  evidence_level: 'guideline' as const, source: 'Source',
  confidence: 'illustrative' as const, reviewed_by: null, last_reviewed: null,
};

function makeRec(id: string, phase: 1 | 2 | 3 = 1): Recommendation {
  return {
    id: asRecommendationId(id), module_id: id, title: `Rec ${id}`,
    action: 'Do it.', cadence: 'Daily', phase, evidence: validEvidence,
  };
}

function makeCarePlan(recs: Recommendation[]): CarePlan {
  const now = new Date();
  return {
    id: asCarePlanId(randomUUID()), member_id: asMemberId('member-001'),
    version: 1, status: 'published', approver_id: 'clinician-001',
    approved_at: now, rejection_reason: null, phase: 1,
    recommendations: recs, created_at: now, updated_at: now,
  };
}

describe('createWeeklyActions', () => {
  it('returns empty array for a plan with no recommendations', () => {
    expect(createWeeklyActions(makeCarePlan([]), 1)).toHaveLength(0);
  });

  it('creates one Action per Recommendation', () => {
    const plan = makeCarePlan([makeRec('a'), makeRec('b'), makeRec('c')]);
    expect(createWeeklyActions(plan, 1)).toHaveLength(3);
  });

  it('all actions have status pending', () => {
    const actions = createWeeklyActions(makeCarePlan([makeRec('a'), makeRec('b')]), 1);
    actions.forEach(a => expect(a.status).toBe('pending'));
  });

  it('all actions have the correct week', () => {
    const actions = createWeeklyActions(makeCarePlan([makeRec('a'), makeRec('b')]), 3);
    actions.forEach(a => expect(a.week).toBe(3));
  });

  it('all actions have completed_at null', () => {
    const actions = createWeeklyActions(makeCarePlan([makeRec('a')]), 1);
    expect(actions[0]?.completed_at).toBeNull();
  });

  it('action.care_plan_id matches the plan id', () => {
    const plan = makeCarePlan([makeRec('a')]);
    const [action] = createWeeklyActions(plan, 1);
    expect(action?.care_plan_id).toBe(plan.id);
  });

  it('action.recommendation_id matches the recommendation id', () => {
    const rec = makeRec('rec-001');
    const [action] = createWeeklyActions(makeCarePlan([rec]), 1);
    expect(action?.recommendation_id).toBe(rec.id);
  });

  it('marks the first phase-1 recommendation as primary', () => {
    const recs = [makeRec('p2a', 2), makeRec('p1a', 1), makeRec('p1b', 1)];
    const actions = createWeeklyActions(makeCarePlan(recs), 1);
    // p1a is first phase-1 rec (index 1)
    expect(actions[1]?.is_primary).toBe(true);
    expect(actions[0]?.is_primary).toBe(false);
    expect(actions[2]?.is_primary).toBe(false);
  });

  it('falls back to first recommendation when no phase-1 exists', () => {
    const recs = [makeRec('p2a', 2), makeRec('p2b', 2)];
    const actions = createWeeklyActions(makeCarePlan(recs), 1);
    expect(actions[0]?.is_primary).toBe(true);
    expect(actions[1]?.is_primary).toBe(false);
  });

  it('exactly one action is primary', () => {
    const recs = [makeRec('a', 1), makeRec('b', 1), makeRec('c', 2)];
    const actions = createWeeklyActions(makeCarePlan(recs), 1);
    expect(actions.filter(a => a.is_primary)).toHaveLength(1);
  });
});

describe('selectPrimaryAction', () => {
  it('returns the is_primary action', () => {
    const plan = makeCarePlan([makeRec('a', 2), makeRec('b', 1)]);
    const actions = createWeeklyActions(plan, 1);
    const primary = selectPrimaryAction(actions);
    expect(primary?.is_primary).toBe(true);
  });

  it('returns null for an empty array', () => {
    expect(selectPrimaryAction([])).toBeNull();
  });
});

describe('completeAction', () => {
  it('sets status to complete', () => {
    const plan = makeCarePlan([makeRec('a')]);
    const [action] = createWeeklyActions(plan, 1);
    expect(completeAction(action!).status).toBe('complete');
  });

  it('sets completed_at to a Date', () => {
    const plan = makeCarePlan([makeRec('a')]);
    const [action] = createWeeklyActions(plan, 1);
    expect(completeAction(action!).completed_at).toBeInstanceOf(Date);
  });

  it('does not mutate the original action', () => {
    const plan = makeCarePlan([makeRec('a')]);
    const [action] = createWeeklyActions(plan, 1);
    completeAction(action!);
    expect(action!.status).toBe('pending');
  });
});

describe('skipAction', () => {
  it('sets status to skipped', () => {
    const plan = makeCarePlan([makeRec('a')]);
    const [action] = createWeeklyActions(plan, 1);
    expect(skipAction(action!).status).toBe('skipped');
  });

  it('does not mutate the original action', () => {
    const plan = makeCarePlan([makeRec('a')]);
    const [action] = createWeeklyActions(plan, 1);
    skipAction(action!);
    expect(action!.status).toBe('pending');
  });
});
```

- [ ] **Step 2: Run — must FAIL**

Run: `npx jest tests/engagement/action-service.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../../src/engagement/action-service'`

- [ ] **Step 3: Create `src/engagement/action-service.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import type { Action, CarePlan } from '../domain/types';

export function createWeeklyActions(carePlan: CarePlan, week: number): Action[] {
  const recs = carePlan.recommendations;
  if (recs.length === 0) return [];

  const phase1Idx = recs.findIndex(r => r.phase === 1);
  const primaryIdx = phase1Idx >= 0 ? phase1Idx : 0;

  return recs.map((rec, idx) => ({
    id: randomUUID(),
    care_plan_id: carePlan.id,
    recommendation_id: rec.id,
    week,
    status: 'pending' as const,
    is_primary: idx === primaryIdx,
    completed_at: null,
  }));
}

export function selectPrimaryAction(actions: Action[]): Action | null {
  return actions.find(a => a.is_primary) ?? null;
}

export function completeAction(action: Action): Action {
  return { ...action, status: 'complete', completed_at: new Date() };
}

export function skipAction(action: Action): Action {
  return { ...action, status: 'skipped' };
}
```

- [ ] **Step 4: Run — must PASS**

Run: `npx jest tests/engagement/action-service.test.ts --no-coverage`
Expected: all green (16 tests)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 6: Commit**

```bash
git add src/engagement/action-service.ts tests/engagement/action-service.test.ts
git commit -m "feat(part3): action service — weekly action creation, primary selection, complete/skip"
```

---

## Task 2: Nudge service

**Files:**
- Create: `src/engagement/nudge-service.ts`
- Test: `tests/engagement/nudge-service.test.ts`

Spec US-2.C3: three rule-based triggers, all templated (no AI text), frequency-capped at one notification per type per call. Lapse = member missed last week's check-in (`current_week > last_checkin_week + 1`). Special case: `last_checkin_week=null` (never checked in) and `current_week > 1` → also a lapse.

- [ ] **Step 1: Write the failing tests**

Create `tests/engagement/nudge-service.test.ts`:

```typescript
import { generateNudges, type NudgeContext } from '../../src/engagement/nudge-service';
import { asMemberId } from '../../src/domain/types';

const memberId = asMemberId('member-001');

function ctx(overrides: Partial<NudgeContext>): NudgeContext {
  return {
    member_id: memberId,
    current_week: 2,
    last_checkin_week: 1,
    milestone_reached: false,
    ...overrides,
  };
}

describe('generateNudges — check_in_due', () => {
  it('always includes check_in_due', () => {
    const nudges = generateNudges(ctx({}));
    expect(nudges.some(n => n.type === 'check_in_due')).toBe(true);
  });

  it('check_in_due recipient_id matches member', () => {
    const [n] = generateNudges(ctx({})).filter(n => n.type === 'check_in_due');
    expect(n?.recipient_id).toBe(memberId);
  });

  it('check_in_due recipient_type is member', () => {
    const [n] = generateNudges(ctx({})).filter(n => n.type === 'check_in_due');
    expect(n?.recipient_type).toBe('member');
  });

  it('produces exactly one check_in_due per call', () => {
    expect(generateNudges(ctx({})).filter(n => n.type === 'check_in_due')).toHaveLength(1);
  });
});

describe('generateNudges — lapse_nudge', () => {
  it('includes lapse_nudge when current_week is 2 more than last_checkin_week', () => {
    expect(generateNudges(ctx({ current_week: 3, last_checkin_week: 1 }))
      .some(n => n.type === 'lapse_nudge')).toBe(true);
  });

  it('does not include lapse_nudge when current_week is exactly last_checkin_week + 1', () => {
    expect(generateNudges(ctx({ current_week: 2, last_checkin_week: 1 }))
      .some(n => n.type === 'lapse_nudge')).toBe(false);
  });

  it('includes lapse_nudge when last_checkin_week is null and current_week > 1', () => {
    expect(generateNudges(ctx({ current_week: 2, last_checkin_week: null }))
      .some(n => n.type === 'lapse_nudge')).toBe(true);
  });

  it('does not include lapse_nudge in week 1 with no prior check-ins', () => {
    expect(generateNudges(ctx({ current_week: 1, last_checkin_week: null }))
      .some(n => n.type === 'lapse_nudge')).toBe(false);
  });

  it('produces at most one lapse_nudge per call', () => {
    expect(generateNudges(ctx({ current_week: 5, last_checkin_week: 1 }))
      .filter(n => n.type === 'lapse_nudge')).toHaveLength(1);
  });
});

describe('generateNudges — milestone', () => {
  it('includes milestone notification when milestone_reached is true', () => {
    expect(generateNudges(ctx({ milestone_reached: true }))
      .some(n => n.type === 'milestone')).toBe(true);
  });

  it('does not include milestone when milestone_reached is false', () => {
    expect(generateNudges(ctx({ milestone_reached: false }))
      .some(n => n.type === 'milestone')).toBe(false);
  });

  it('produces exactly one milestone per call when reached', () => {
    expect(generateNudges(ctx({ milestone_reached: true }))
      .filter(n => n.type === 'milestone')).toHaveLength(1);
  });
});

describe('generateNudges — all three fire together', () => {
  it('can return all three types in one call', () => {
    const nudges = generateNudges(ctx({
      current_week: 3, last_checkin_week: 1, milestone_reached: true,
    }));
    const types = nudges.map(n => n.type);
    expect(types).toContain('check_in_due');
    expect(types).toContain('lapse_nudge');
    expect(types).toContain('milestone');
  });

  it('all notifications have read_at null', () => {
    const nudges = generateNudges(ctx({ milestone_reached: true }));
    nudges.forEach(n => expect(n.read_at).toBeNull());
  });
});
```

- [ ] **Step 2: Run — must FAIL**

Run: `npx jest tests/engagement/nudge-service.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../../src/engagement/nudge-service'`

- [ ] **Step 3: Create `src/engagement/nudge-service.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import type { MemberId, Notification } from '../domain/types';

export interface NudgeContext {
  readonly member_id: MemberId;
  readonly current_week: number;
  readonly last_checkin_week: number | null;
  readonly milestone_reached: boolean;
}

export function generateNudges(ctx: NudgeContext): Notification[] {
  const nudges: Notification[] = [];
  const now = new Date();

  nudges.push({
    id: randomUUID(),
    recipient_id: ctx.member_id,
    recipient_type: 'member',
    type: 'check_in_due',
    ts: now,
    read_at: null,
  });

  const lapsed =
    ctx.last_checkin_week === null
      ? ctx.current_week > 1
      : ctx.current_week > ctx.last_checkin_week + 1;

  if (lapsed) {
    nudges.push({
      id: randomUUID(),
      recipient_id: ctx.member_id,
      recipient_type: 'member',
      type: 'lapse_nudge',
      ts: now,
      read_at: null,
    });
  }

  if (ctx.milestone_reached) {
    nudges.push({
      id: randomUUID(),
      recipient_id: ctx.member_id,
      recipient_type: 'member',
      type: 'milestone',
      ts: now,
      read_at: null,
    });
  }

  return nudges;
}
```

- [ ] **Step 4: Run — must PASS**

Run: `npx jest tests/engagement/nudge-service.test.ts --no-coverage`
Expected: all green (13 tests)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 6: Commit**

```bash
git add src/engagement/nudge-service.ts tests/engagement/nudge-service.test.ts
git commit -m "feat(part3): nudge service — check_in_due / lapse / milestone rules engine"
```

---

## Task 3: CheckIn factory

**Files:**
- Create: `src/engagement/checkin-service.ts`
- Test: `tests/engagement/checkin-service.test.ts`

Spec US-3.C1: validated factory for CheckIn records. Mood values must be 1–5; any value outside this range throws `InvalidMoodError`. All other fields pass through directly. `lifestyle_chips` is defensively copied.

- [ ] **Step 1: Write the failing tests**

Create `tests/engagement/checkin-service.test.ts`:

```typescript
import { createCheckIn, InvalidMoodError, type CheckInInput } from '../../src/engagement/checkin-service';
import { asMemberId } from '../../src/domain/types';

const memberId = asMemberId('member-001');

const baseInput: CheckInInput = {
  member_id: memberId,
  week: 1,
  cycle_date: null,
  top_symptom_severity: 'mild',
  meds_taken: true,
  lifestyle_chips: ['walked', 'slept_well'],
  mood: [3, 4],
};

describe('createCheckIn — shape', () => {
  it('returns a CheckIn with a non-empty id', () => {
    expect(createCheckIn(baseInput).id).toBeTruthy();
  });

  it('copies member_id', () => {
    expect(createCheckIn(baseInput).member_id).toBe(memberId);
  });

  it('copies week', () => {
    expect(createCheckIn(baseInput).week).toBe(1);
  });

  it('copies cycle_date when provided', () => {
    const d = new Date('2026-01-15');
    const ci = createCheckIn({ ...baseInput, cycle_date: d });
    expect(ci.cycle_date).toBe(d);
  });

  it('preserves null cycle_date', () => {
    expect(createCheckIn(baseInput).cycle_date).toBeNull();
  });

  it('copies top_symptom_severity', () => {
    expect(createCheckIn(baseInput).top_symptom_severity).toBe('mild');
  });

  it('preserves null top_symptom_severity', () => {
    const ci = createCheckIn({ ...baseInput, top_symptom_severity: null });
    expect(ci.top_symptom_severity).toBeNull();
  });

  it('copies meds_taken', () => {
    expect(createCheckIn(baseInput).meds_taken).toBe(true);
  });

  it('copies lifestyle_chips', () => {
    expect(createCheckIn(baseInput).lifestyle_chips).toEqual(['walked', 'slept_well']);
  });

  it('copies mood tuple', () => {
    expect(createCheckIn(baseInput).mood).toEqual([3, 4]);
  });

  it('sets created_at to a Date', () => {
    expect(createCheckIn(baseInput).created_at).toBeInstanceOf(Date);
  });
});

describe('createCheckIn — mood validation', () => {
  it('throws InvalidMoodError when mood[0] is below 1', () => {
    expect(() => createCheckIn({ ...baseInput, mood: [0, 3] })).toThrow(InvalidMoodError);
  });

  it('throws InvalidMoodError when mood[0] is above 5', () => {
    expect(() => createCheckIn({ ...baseInput, mood: [6, 3] })).toThrow(InvalidMoodError);
  });

  it('throws InvalidMoodError when mood[1] is above 5', () => {
    expect(() => createCheckIn({ ...baseInput, mood: [3, 6] })).toThrow(InvalidMoodError);
  });

  it('throws InvalidMoodError when mood[1] is below 1', () => {
    expect(() => createCheckIn({ ...baseInput, mood: [3, 0] })).toThrow(InvalidMoodError);
  });

  it('accepts boundary values 1 and 5', () => {
    expect(() => createCheckIn({ ...baseInput, mood: [1, 5] })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run — must FAIL**

Run: `npx jest tests/engagement/checkin-service.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../../src/engagement/checkin-service'`

- [ ] **Step 3: Create `src/engagement/checkin-service.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import type { CheckIn, MemberId, SymptomSeverity } from '../domain/types';

export interface CheckInInput {
  readonly member_id: MemberId;
  readonly week: number;
  readonly cycle_date: Date | null;
  readonly top_symptom_severity: SymptomSeverity | null;
  readonly meds_taken: boolean;
  readonly lifestyle_chips: readonly string[];
  readonly mood: readonly [number, number];
}

export class InvalidMoodError extends Error {
  constructor(value: number) {
    super(`Mood values must be between 1 and 5, got: ${value}`);
    this.name = 'InvalidMoodError';
  }
}

export function createCheckIn(input: CheckInInput): CheckIn {
  for (const m of input.mood) {
    if (m < 1 || m > 5) throw new InvalidMoodError(m);
  }
  return {
    id: randomUUID(),
    member_id: input.member_id,
    week: input.week,
    cycle_date: input.cycle_date,
    top_symptom_severity: input.top_symptom_severity,
    meds_taken: input.meds_taken,
    lifestyle_chips: [...input.lifestyle_chips],
    mood: input.mood,
    created_at: new Date(),
  };
}
```

- [ ] **Step 4: Run — must PASS**

Run: `npx jest tests/engagement/checkin-service.test.ts --no-coverage`
Expected: all green (16 tests)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 6: Commit**

```bash
git add src/engagement/checkin-service.ts tests/engagement/checkin-service.test.ts
git commit -m "feat(part3): check-in factory — structured CheckIn with mood validation"
```

---

## Task 4: Outcome + milestone service

**Files:**
- Create: `src/engagement/outcome-service.ts`
- Create: `src/engagement/index.ts`
- Test: `tests/engagement/outcome-service.test.ts`

Spec US-3.C2 + US-3.C3:
- `deriveOutcomes`: requires ≥2 check-ins. Returns three Outcomes: `symptom_severity` (avg numeric severity: mild=1/moderate=2/marked=3/null=0), `mood` (avg of (mood[0]+mood[1])/2 across check-ins), `cycle_regularity` (fraction of check-ins with non-null cycle_date).
- `detectMilestones`: checks two rules — (1) 4-week consecutive streak (check-ins on weeks n, n+1, n+2, n+3), (2) symptom improvement (last sorted check-in's severity < first's). Returns `Outcome[]` with `metric='milestone'`.

- [ ] **Step 1: Write the failing tests**

Create `tests/engagement/outcome-service.test.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { deriveOutcomes, detectMilestones } from '../../src/engagement/outcome-service';
import type { CheckIn } from '../../src/domain/types';
import { asMemberId } from '../../src/domain/types';

const memberId = asMemberId('member-001');

function makeCheckIn(week: number, overrides: Partial<Omit<CheckIn, 'id' | 'member_id' | 'week' | 'created_at'>> = {}): CheckIn {
  return {
    id: randomUUID(),
    member_id: memberId,
    week,
    cycle_date: null,
    top_symptom_severity: null,
    meds_taken: true,
    lifestyle_chips: [],
    mood: [3, 3],
    created_at: new Date(),
    ...overrides,
  };
}

describe('deriveOutcomes — minimum check-ins', () => {
  it('returns empty array for 0 check-ins', () => {
    expect(deriveOutcomes([])).toHaveLength(0);
  });

  it('returns empty array for 1 check-in', () => {
    expect(deriveOutcomes([makeCheckIn(1)])).toHaveLength(0);
  });

  it('returns 3 outcomes for 2+ check-ins', () => {
    const checkIns = [makeCheckIn(1), makeCheckIn(2)];
    expect(deriveOutcomes(checkIns)).toHaveLength(3);
  });
});

describe('deriveOutcomes — symptom_severity', () => {
  it('derives symptom_severity outcome', () => {
    const checkIns = [makeCheckIn(1), makeCheckIn(2)];
    expect(deriveOutcomes(checkIns).find(o => o.metric === 'symptom_severity')).toBeDefined();
  });

  it('severity value is 0 when all check-ins have null severity', () => {
    const checkIns = [
      makeCheckIn(1, { top_symptom_severity: null }),
      makeCheckIn(2, { top_symptom_severity: null }),
    ];
    const o = deriveOutcomes(checkIns).find(o => o.metric === 'symptom_severity')!;
    expect(o.value).toBe(0);
  });

  it('mild=1, moderate=2, marked=3 mapping is correct', () => {
    const checkIns = [
      makeCheckIn(1, { top_symptom_severity: 'mild' }),    // 1
      makeCheckIn(2, { top_symptom_severity: 'marked' }),  // 3
    ];
    const o = deriveOutcomes(checkIns).find(o => o.metric === 'symptom_severity')!;
    expect(o.value).toBe(2); // (1+3)/2 = 2
  });
});

describe('deriveOutcomes — mood', () => {
  it('derives mood outcome', () => {
    const checkIns = [makeCheckIn(1), makeCheckIn(2)];
    expect(deriveOutcomes(checkIns).find(o => o.metric === 'mood')).toBeDefined();
  });

  it('mood value is the average of (mood[0]+mood[1])/2 across check-ins', () => {
    const checkIns = [
      makeCheckIn(1, { mood: [2, 4] }),  // avg = 3
      makeCheckIn(2, { mood: [4, 4] }),  // avg = 4
    ];
    const o = deriveOutcomes(checkIns).find(o => o.metric === 'mood')!;
    expect(o.value as number).toBeCloseTo(3.5, 5);
  });
});

describe('deriveOutcomes — cycle_regularity', () => {
  it('derives cycle_regularity outcome', () => {
    const checkIns = [makeCheckIn(1), makeCheckIn(2)];
    expect(deriveOutcomes(checkIns).find(o => o.metric === 'cycle_regularity')).toBeDefined();
  });

  it('cycle_regularity is 1.0 when all check-ins have cycle_date', () => {
    const d = new Date();
    const checkIns = [makeCheckIn(1, { cycle_date: d }), makeCheckIn(2, { cycle_date: d })];
    const o = deriveOutcomes(checkIns).find(o => o.metric === 'cycle_regularity')!;
    expect(o.value).toBe(1);
  });

  it('cycle_regularity is 0.5 when half have cycle_date', () => {
    const checkIns = [makeCheckIn(1, { cycle_date: new Date() }), makeCheckIn(2)];
    const o = deriveOutcomes(checkIns).find(o => o.metric === 'cycle_regularity')!;
    expect(o.value).toBe(0.5);
  });

  it('cycle_regularity is 0 when none have cycle_date', () => {
    const checkIns = [makeCheckIn(1), makeCheckIn(2)];
    const o = deriveOutcomes(checkIns).find(o => o.metric === 'cycle_regularity')!;
    expect(o.value).toBe(0);
  });
});

describe('detectMilestones — 4-week streak', () => {
  it('returns empty array for fewer than 4 check-ins', () => {
    expect(detectMilestones([makeCheckIn(1), makeCheckIn(2), makeCheckIn(3)])).toHaveLength(0);
  });

  it('detects a 4-week consecutive streak', () => {
    const checkIns = [makeCheckIn(1), makeCheckIn(2), makeCheckIn(3), makeCheckIn(4)];
    const milestones = detectMilestones(checkIns);
    expect(milestones.some(m => m.value === '4_week_streak')).toBe(true);
  });

  it('does not fire for 4 non-consecutive check-ins', () => {
    const checkIns = [makeCheckIn(1), makeCheckIn(2), makeCheckIn(4), makeCheckIn(5)];
    const milestones = detectMilestones(checkIns);
    expect(milestones.some(m => m.value === '4_week_streak')).toBe(false);
  });

  it('all milestone outcomes have metric=milestone', () => {
    const checkIns = [makeCheckIn(1), makeCheckIn(2), makeCheckIn(3), makeCheckIn(4)];
    detectMilestones(checkIns).forEach(m => expect(m.metric).toBe('milestone'));
  });
});

describe('detectMilestones — symptom improvement', () => {
  it('detects symptom improvement from marked to mild', () => {
    const checkIns = [
      makeCheckIn(1, { top_symptom_severity: 'marked' }),
      makeCheckIn(2, { top_symptom_severity: 'mild' }),
    ];
    expect(detectMilestones(checkIns).some(m => m.value === 'symptom_improved')).toBe(true);
  });

  it('does not fire when severity is unchanged', () => {
    const checkIns = [
      makeCheckIn(1, { top_symptom_severity: 'moderate' }),
      makeCheckIn(2, { top_symptom_severity: 'moderate' }),
    ];
    expect(detectMilestones(checkIns).some(m => m.value === 'symptom_improved')).toBe(false);
  });

  it('does not fire when severity worsened', () => {
    const checkIns = [
      makeCheckIn(1, { top_symptom_severity: 'mild' }),
      makeCheckIn(2, { top_symptom_severity: 'marked' }),
    ];
    expect(detectMilestones(checkIns).some(m => m.value === 'symptom_improved')).toBe(false);
  });
});
```

- [ ] **Step 2: Run — must FAIL**

Run: `npx jest tests/engagement/outcome-service.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../../src/engagement/outcome-service'`

- [ ] **Step 3: Create `src/engagement/outcome-service.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import type { CheckIn, Outcome } from '../domain/types';

function severityToNumber(s: string | null): number {
  if (s === 'mild') return 1;
  if (s === 'moderate') return 2;
  if (s === 'marked') return 3;
  return 0;
}

function hasConsecutiveStreak(checkIns: CheckIn[], streakLength: number): boolean {
  if (checkIns.length < streakLength) return false;
  const weeks = [...new Set(checkIns.map(c => c.week))].sort((a, b) => a - b);
  for (let i = 0; i <= weeks.length - streakLength; i++) {
    let consecutive = true;
    for (let j = 1; j < streakLength; j++) {
      if ((weeks[i + j] ?? 0) - (weeks[i + j - 1] ?? 0) !== 1) {
        consecutive = false;
        break;
      }
    }
    if (consecutive) return true;
  }
  return false;
}

export function deriveOutcomes(checkIns: CheckIn[]): Outcome[] {
  if (checkIns.length < 2) return [];

  const memberId = checkIns[0]!.member_id;
  const now = new Date();

  const avgSeverity =
    checkIns.reduce((sum, c) => sum + severityToNumber(c.top_symptom_severity), 0) /
    checkIns.length;

  const avgMood =
    checkIns.reduce((sum, c) => sum + (c.mood[0] + c.mood[1]) / 2, 0) /
    checkIns.length;

  const cycleRatio =
    checkIns.filter(c => c.cycle_date !== null).length / checkIns.length;

  return [
    { id: randomUUID(), member_id: memberId, metric: 'symptom_severity', value: avgSeverity, ts: now },
    { id: randomUUID(), member_id: memberId, metric: 'mood', value: avgMood, ts: now },
    { id: randomUUID(), member_id: memberId, metric: 'cycle_regularity', value: cycleRatio, ts: now },
  ];
}

export function detectMilestones(checkIns: CheckIn[]): Outcome[] {
  if (checkIns.length === 0) return [];

  const memberId = checkIns[0]!.member_id;
  const now = new Date();
  const milestones: Outcome[] = [];

  if (hasConsecutiveStreak(checkIns, 4)) {
    milestones.push({
      id: randomUUID(), member_id: memberId,
      metric: 'milestone', value: '4_week_streak', ts: now,
    });
  }

  if (checkIns.length >= 2) {
    const sorted = [...checkIns].sort((a, b) => a.week - b.week);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    if (severityToNumber(last.top_symptom_severity) < severityToNumber(first.top_symptom_severity)) {
      milestones.push({
        id: randomUUID(), member_id: memberId,
        metric: 'milestone', value: 'symptom_improved', ts: now,
      });
    }
  }

  return milestones;
}
```

- [ ] **Step 4: Create `src/engagement/index.ts`**

```typescript
export * from './action-service';
export * from './nudge-service';
export * from './checkin-service';
export * from './outcome-service';
```

- [ ] **Step 5: Run — must PASS**

Run: `npx jest tests/engagement/outcome-service.test.ts --no-coverage`
Expected: all green (15 tests)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 7: Commit**

```bash
git add src/engagement/outcome-service.ts src/engagement/index.ts tests/engagement/outcome-service.test.ts
git commit -m "feat(part3): outcome service — trend derivation (severity/mood/cycle) + 4-week streak + symptom-improved milestones"
```

---

## Task 5: Barrel exports + full suite

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Read `src/index.ts`, then replace with**

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
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: all suites pass, 0 failures (~259 tests total)

If any test fails, fix before proceeding.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(part3): barrel export — Part 3 Spine B engagement loop complete"
```

- [ ] **Step 5: Print git log**

Run: `git log --oneline -8`

Expected (newest first):
```
<sha>  feat(part3): barrel export — Part 3 Spine B engagement loop complete
<sha>  feat(part3): outcome service — trend derivation (severity/mood/cycle) + 4-week streak + symptom-improved milestones
<sha>  feat(part3): check-in factory — structured CheckIn with mood validation
<sha>  feat(part3): nudge service — check_in_due / lapse / milestone rules engine
<sha>  feat(part3): action service — weekly action creation, primary selection, complete/skip
<sha>  feat(part2): barrel export — Part 2 Spine A core complete
```

---

## Self-review

### Spec coverage

| Spec requirement | Task |
|---|---|
| US-2.C1 — single primary action surfaced per week | Task 1: `selectPrimaryAction` returns the `is_primary=true` action |
| US-2.C1 — rationale visible | Rationale lives on `Recommendation.evidence.rationale`; action links to recommendation via `recommendation_id` |
| US-2.C2 — completion updates Action.status | Task 1: `completeAction` returns status='complete' + completed_at |
| US-2.C2 — skip updates Action.status | Task 1: `skipAction` returns status='skipped' |
| US-2.C3 — check_in_due nudge fires every week | Task 2: always included in `generateNudges` output |
| US-2.C3 — lapse nudge within 24h of missed week | Task 2: lapse rule fires when current_week > last_checkin_week + 1 |
| US-2.C3 — frequency-capped | Task 2: at most one notification per type per `generateNudges` call |
| US-2.C3 — no AI text | Task 2: templated types only (check_in_due / lapse_nudge / milestone); no string generation |
| US-3.C1 — structured check-in < 60s | Task 3: all fields structured, factory validates mood and passes through |
| US-3.C1 — mood 2-item 1–5 | Task 3: `InvalidMoodError` thrown outside 1–5 range |
| US-3.C2 — trend renders from ≥2 check-ins | Task 4: `deriveOutcomes` returns empty for < 2 check-ins |
| US-3.C2 — cycle regularity trend | Task 4: `cycle_regularity` outcome |
| US-3.C2 — symptom severity trend | Task 4: `symptom_severity` outcome |
| US-3.C2 — mood trend | Task 4: `mood` outcome |
| US-3.C3 — 4-week streak milestone | Task 4: `detectMilestones` detects 4 consecutive weeks |
| US-3.C3 — trend improvement milestone | Task 4: `detectMilestones` detects symptom severity improvement |
| US-3.C3 — milestone fires once | Callers de-duplicate; `detectMilestones` is deterministic |

**Intentional gaps:**
- US-2.C1 "tap to mark done" → UI is Stitch-able; `completeAction` is the domain call
- US-3.C2 "no data → encouraging empty state" → UI concern; `deriveOutcomes([])` returns [] correctly
- US-3.C3 "contributes to north-star threshold" → north-star aggregation is cross-member analytics (Part 5 / out of scope for V1 domain model)

### Placeholder scan
No TBDs, no "implement later". Every step has complete code.

### Type consistency
- `Action.status: ActionStatus` ('pending'|'complete'|'skipped') — used with `as const` in `createWeeklyActions`, consistent in tests.
- `CheckIn.mood: readonly [number, number]` — `createCheckIn` preserves the tuple; `outcome-service` reads `c.mood[0]` and `c.mood[1]`.
- `Outcome.value: number | string` — `deriveOutcomes` emits numbers; `detectMilestones` emits strings ('4_week_streak', 'symptom_improved') — both valid per the type.
- `severityToNumber` defined once in `outcome-service.ts`, used by both `deriveOutcomes` and `detectMilestones` — no duplication.
- `NudgeContext.last_checkin_week: number | null` — null means "never checked in"; lapse logic handles both null and numeric correctly.
