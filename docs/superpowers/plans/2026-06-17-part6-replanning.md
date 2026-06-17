# Part 6 — Re-planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement trigger evaluation, recommendation diffing, and change-summary notification for plan re-planning (US-7.C1–C3).

**Architecture:** Three focused files under `src/replanning/`; all pure functions. `createPlanDelta` reuses `assemblePlan` and overrides `version` via spread. `notifyDeltaPublished` guards on `status === 'approved'` before emitting a `'plan_updated'` notification. `NotificationType` is extended once (Task 3) to add that literal.

**Tech Stack:** TypeScript 5.x, Jest 29 + ts-jest, `node:crypto` randomUUID, `noUncheckedIndexedAccess` ON.

---

## File map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/replanning/trigger.ts` | `ReplanningTrigger`, `evaluateReplanningTrigger` |
| Create | `src/replanning/plan-delta.ts` | `RecommendationChange`, `createPlanDelta` |
| Create | `src/replanning/change-summary.ts` | `ChangeSummary`, `buildChangeSummary`, `notifyDeltaPublished`, `UnapprovedDeltaError` |
| Create | `src/replanning/index.ts` | barrel |
| Modify | `src/domain/types.ts` | add `'plan_updated'` to `NotificationType` |
| Modify | `src/index.ts` | add `export * from './replanning'` |
| Create | `tests/replanning/trigger.test.ts` | trigger tests |
| Create | `tests/replanning/plan-delta.test.ts` | delta tests |
| Create | `tests/replanning/change-summary.test.ts` | summary + notification tests |

---

### Task 1: Replanning trigger (`src/replanning/trigger.ts`)

**Files:**
- Create: `src/replanning/trigger.ts`
- Create: `tests/replanning/trigger.test.ts`

**Context:**

`evaluateReplanningTrigger` returns the first un-fired trigger whose condition is met, in priority order: `phase_30` → `phase_60` → `phase_90` → `milestone` → `lapse`. "Un-fired" means no entry in `existingTriggers` with the same `care_plan_id` AND `reason`. The caller persists the returned trigger and passes it in `existingTriggers` on the next call — that's how we avoid duplicates without statefulness here.

Phase conditions: `currentWeek >= 30/60/90`. Using `>=` (not `===`) so a missed week can still fire.

Lapse condition: `lastCheckIn === null && currentWeek > 1` OR `lastCheckIn !== null && currentWeek > lastCheckIn.week + 1`.

Boundary note: `currentWeek: 7, lastCheckIn.week: 6` → `7 > 6+1 = 7 > 7 = false` → no lapse.

Types needed from `'../domain/types'`: `CarePlanId`, `MemberId`, `CheckIn`, `Outcome` (imported as type).

- [ ] **Step 1: Write the failing tests**

Create `tests/replanning/trigger.test.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import {
  evaluateReplanningTrigger,
  type EvaluateReplanningTriggerInput,
  type ReplanningTrigger,
} from '../../src/replanning/trigger';
import {
  asMemberId,
  asCarePlanId,
  type CheckIn,
  type Outcome,
} from '../../src/domain/types';

const memberId = asMemberId('m1');
const cpId = asCarePlanId('cp1');

const base: EvaluateReplanningTriggerInput = {
  member_id: memberId,
  care_plan_id: cpId,
  currentWeek: 1,
  milestones: [],
  lastCheckIn: null,
  existingTriggers: [],
};

const recentCi: CheckIn = {
  id: 'ci1',
  member_id: memberId,
  week: 29,
  cycle_date: null,
  top_symptom_severity: null,
  meds_taken: true,
  lifestyle_chips: [],
  mood: [3, 3],
  created_at: new Date(),
};

const milestone: Outcome = {
  id: 'o1',
  member_id: memberId,
  metric: 'milestone',
  value: 'achieved',
  ts: new Date(),
};

function makeFiredTrigger(reason: ReplanningTrigger['reason']): ReplanningTrigger {
  return { care_plan_id: cpId, member_id: memberId, reason, triggered_at: new Date() };
}

describe('evaluateReplanningTrigger', () => {
  it('returns null when no condition met (week 1, no check-in)', () => {
    expect(evaluateReplanningTrigger(base)).toBeNull();
  });

  it('returns phase_30 at week 30', () => {
    expect(evaluateReplanningTrigger({ ...base, currentWeek: 30 })?.reason).toBe('phase_30');
  });

  it('returns phase_30 at week 45 (>= 30)', () => {
    expect(evaluateReplanningTrigger({ ...base, currentWeek: 45 })?.reason).toBe('phase_30');
  });

  it('returns phase_60 when phase_30 already triggered', () => {
    const result = evaluateReplanningTrigger({
      ...base,
      currentWeek: 60,
      existingTriggers: [makeFiredTrigger('phase_30')],
    });
    expect(result?.reason).toBe('phase_60');
  });

  it('returns phase_90 when phase_30 and phase_60 already triggered', () => {
    const result = evaluateReplanningTrigger({
      ...base,
      currentWeek: 90,
      existingTriggers: [makeFiredTrigger('phase_30'), makeFiredTrigger('phase_60')],
    });
    expect(result?.reason).toBe('phase_90');
  });

  it('returns null when all phase triggers already fired at week 90', () => {
    const result = evaluateReplanningTrigger({
      ...base,
      currentWeek: 90,
      lastCheckIn: recentCi,
      existingTriggers: [
        makeFiredTrigger('phase_30'),
        makeFiredTrigger('phase_60'),
        makeFiredTrigger('phase_90'),
      ],
    });
    expect(result).toBeNull();
  });

  it('returns null for phase_30 when already triggered and no other condition met', () => {
    const result = evaluateReplanningTrigger({
      ...base,
      currentWeek: 30,
      lastCheckIn: recentCi,  // week 29 → no lapse (30 > 30 = false)
      existingTriggers: [makeFiredTrigger('phase_30')],
    });
    expect(result).toBeNull();
  });

  it('returns milestone when milestones exist below week 30', () => {
    expect(
      evaluateReplanningTrigger({ ...base, currentWeek: 5, milestones: [milestone] })?.reason,
    ).toBe('milestone');
  });

  it('phase_30 takes priority over milestone at week 30', () => {
    expect(
      evaluateReplanningTrigger({ ...base, currentWeek: 30, milestones: [milestone] })?.reason,
    ).toBe('phase_30');
  });

  it('returns milestone when phase_30 already fired at week 30', () => {
    const result = evaluateReplanningTrigger({
      ...base,
      currentWeek: 30,
      lastCheckIn: recentCi,
      milestones: [milestone],
      existingTriggers: [makeFiredTrigger('phase_30')],
    });
    expect(result?.reason).toBe('milestone');
  });

  it('returns lapse when no check-in and currentWeek > 1', () => {
    expect(
      evaluateReplanningTrigger({ ...base, currentWeek: 3, lastCheckIn: null })?.reason,
    ).toBe('lapse');
  });

  it('returns lapse when lastCheckIn is stale (currentWeek > lastCheckIn.week + 1)', () => {
    const stale: CheckIn = { ...recentCi, week: 5 };
    expect(
      evaluateReplanningTrigger({ ...base, currentWeek: 7, lastCheckIn: stale })?.reason,
    ).toBe('lapse');
  });

  it('no lapse at boundary (currentWeek === lastCheckIn.week + 1)', () => {
    const ci: CheckIn = { ...recentCi, week: 6 };
    expect(evaluateReplanningTrigger({ ...base, currentWeek: 7, lastCheckIn: ci })).toBeNull();
  });

  it('does not fire lapse at week 1 even with no check-in', () => {
    expect(evaluateReplanningTrigger({ ...base, currentWeek: 1, lastCheckIn: null })).toBeNull();
  });

  it('populates trigger fields correctly', () => {
    const result = evaluateReplanningTrigger({ ...base, currentWeek: 30 });
    expect(result).toMatchObject({ care_plan_id: cpId, member_id: memberId, reason: 'phase_30' });
    expect(result!.triggered_at).toBeInstanceOf(Date);
  });

  it('does not cross-pollute triggers from a different care_plan_id', () => {
    const otherTrigger: ReplanningTrigger = {
      care_plan_id: asCarePlanId('other-cp'),
      member_id: memberId,
      reason: 'phase_30',
      triggered_at: new Date(),
    };
    const result = evaluateReplanningTrigger({
      ...base,
      currentWeek: 30,
      existingTriggers: [otherTrigger],
    });
    expect(result?.reason).toBe('phase_30');
  });
});
```

- [ ] **Step 2: Run tests — expect compile error (module not found)**

```
npx jest tests/replanning/trigger.test.ts --no-coverage
```

Expected: Cannot find module `'../../src/replanning/trigger'`

- [ ] **Step 3: Implement `src/replanning/trigger.ts`**

```typescript
import type { CarePlanId, CheckIn, MemberId, Outcome } from '../domain/types';

export type ReplanningReason = 'phase_30' | 'phase_60' | 'phase_90' | 'milestone' | 'lapse';

export interface ReplanningTrigger {
  readonly care_plan_id: CarePlanId;
  readonly member_id: MemberId;
  readonly reason: ReplanningReason;
  readonly triggered_at: Date;
}

export interface EvaluateReplanningTriggerInput {
  readonly member_id: MemberId;
  readonly care_plan_id: CarePlanId;
  readonly currentWeek: number;
  readonly milestones: readonly Outcome[];
  readonly lastCheckIn: CheckIn | null;
  readonly existingTriggers: readonly ReplanningTrigger[];
}

function alreadyFired(
  existingTriggers: readonly ReplanningTrigger[],
  care_plan_id: CarePlanId,
  reason: ReplanningReason,
): boolean {
  return existingTriggers.some(t => t.care_plan_id === care_plan_id && t.reason === reason);
}

function make(input: EvaluateReplanningTriggerInput, reason: ReplanningReason): ReplanningTrigger {
  return { care_plan_id: input.care_plan_id, member_id: input.member_id, reason, triggered_at: new Date() };
}

export function evaluateReplanningTrigger(
  input: EvaluateReplanningTriggerInput,
): ReplanningTrigger | null {
  const { currentWeek, milestones, lastCheckIn, existingTriggers, care_plan_id } = input;

  if (currentWeek >= 30 && !alreadyFired(existingTriggers, care_plan_id, 'phase_30')) {
    return make(input, 'phase_30');
  }
  if (currentWeek >= 60 && !alreadyFired(existingTriggers, care_plan_id, 'phase_60')) {
    return make(input, 'phase_60');
  }
  if (currentWeek >= 90 && !alreadyFired(existingTriggers, care_plan_id, 'phase_90')) {
    return make(input, 'phase_90');
  }
  if (milestones.length > 0 && !alreadyFired(existingTriggers, care_plan_id, 'milestone')) {
    return make(input, 'milestone');
  }
  const hasLapse =
    (lastCheckIn === null && currentWeek > 1) ||
    (lastCheckIn !== null && currentWeek > lastCheckIn.week + 1);
  if (hasLapse && !alreadyFired(existingTriggers, care_plan_id, 'lapse')) {
    return make(input, 'lapse');
  }
  return null;
}
```

- [ ] **Step 4: Run tests — expect all pass**

```
npx jest tests/replanning/trigger.test.ts --no-coverage
```

Expected: All 16 tests PASS.

- [ ] **Step 5: Full suite — no regressions**

```
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```
git add src/replanning/trigger.ts tests/replanning/trigger.test.ts
git commit -m "feat(replanning): add evaluateReplanningTrigger with 30/60/90/milestone/lapse detection"
```

---

### Task 2: Plan delta (`src/replanning/plan-delta.ts`)

**Files:**
- Create: `src/replanning/plan-delta.ts`
- Create: `tests/replanning/plan-delta.test.ts`

**Context:**

`createPlanDelta` calls `assemblePlan({ member, profile }, [...input.allModules], input.auditLog)` — note the spread because `assemblePlan` expects `ValidatedModule[]` (mutable) but our input stores `readonly ValidatedModule[]`. The result field is `carePlan` (not `plan`). `assemblePlan` hardcodes `version: 1`, so we override: `{ ...basePlan, version: existingPlan.version + 1 }`.

Diff algorithm: compare by `module_id`. New recs present in `newDraft` but absent in `existingPlan` → `'added'`. Recs in `existingPlan` but absent from `newDraft` → `'removed'`. Present in both → `'unchanged'`.

Key import facts:
- `assemblePlan` from `'../plan-assembly/assembler'`
- `AuditLog` / `createInMemoryAuditLog` from `'../domain/audit'`
- `ValidatedModule` from `'../module-library/schema'` — required fields: `id, phase (1|2|3), kind ('self'|'referral'|'safety'), icon, title, action, cadence, goals_served, always, this_week, evidence (Evidence)`

- [ ] **Step 1: Write the failing tests**

Create `tests/replanning/plan-delta.test.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { createPlanDelta, type PlanDeltaInput } from '../../src/replanning/plan-delta';
import {
  asMemberId,
  asCarePlanId,
  asRecommendationId,
  asConditionProfileId,
  type Member,
  type ConditionProfile,
  type CarePlan,
  type Recommendation,
} from '../../src/domain/types';
import { createInMemoryAuditLog } from '../../src/domain/audit';
import type { ValidatedModule } from '../../src/module-library/schema';

const auditLog = createInMemoryAuditLog();
const member: Member = { id: asMemberId('m1'), email: 'a@b.com', created_at: new Date() };
const profile: ConditionProfile = {
  id: asConditionProfileId('p1'),
  member_id: asMemberId('m1'),
  symptoms: [],
  primary_goal: 'general',
  conditions: [],
  diagnosed: false,
  diagnosis_date: null,
  free_text_flagged: false,
};

function makeModule(id: string): ValidatedModule {
  return {
    id,
    phase: 1,
    kind: 'self',
    icon: 'icon',
    title: `Title ${id}`,
    action: `Action ${id}`,
    cadence: 'weekly',
    goals_served: [],
    always: true,
    this_week: true,
    evidence: {
      claim: `Claim ${id}`,
      rationale: 'Rationale',
      evidence_level: 'good',
      source: 'Source',
      confidence: 'validated',
      reviewed_by: null,
      last_reviewed: null,
    },
  };
}

function makeRec(moduleId: string): Recommendation {
  return {
    id: asRecommendationId(randomUUID()),
    module_id: moduleId,
    title: `Title ${moduleId}`,
    action: `Action ${moduleId}`,
    cadence: 'weekly',
    phase: 1,
    evidence: {
      claim: `Claim ${moduleId}`,
      rationale: 'Rationale',
      evidence_level: 'good',
      source: 'Source',
      confidence: 'validated',
      reviewed_by: null,
      last_reviewed: null,
    },
  };
}

function makeCarePlan(version: number, recs: Recommendation[]): CarePlan {
  const now = new Date();
  return {
    id: asCarePlanId(randomUUID()),
    member_id: asMemberId('m1'),
    version,
    status: 'approved',
    approver_id: 'dr1',
    approved_at: now,
    rejection_reason: null,
    phase: 1,
    recommendations: recs,
    created_at: now,
    updated_at: now,
  };
}

describe('createPlanDelta', () => {
  it('increments version by 1', () => {
    const existing = makeCarePlan(1, [makeRec('mod-a')]);
    const { newDraft } = createPlanDelta({
      existingPlan: existing, member, profile,
      allModules: [makeModule('mod-a')], auditLog,
    });
    expect(newDraft.version).toBe(2);
  });

  it('increments from any base version', () => {
    const existing = makeCarePlan(5, [makeRec('mod-a')]);
    const { newDraft } = createPlanDelta({
      existingPlan: existing, member, profile,
      allModules: [makeModule('mod-a')], auditLog,
    });
    expect(newDraft.version).toBe(6);
  });

  it('new draft is in draft status', () => {
    const existing = makeCarePlan(1, [makeRec('mod-a')]);
    const { newDraft } = createPlanDelta({
      existingPlan: existing, member, profile,
      allModules: [makeModule('mod-a')], auditLog,
    });
    expect(newDraft.status).toBe('draft');
  });

  it('new draft belongs to member', () => {
    const existing = makeCarePlan(1, [makeRec('mod-a')]);
    const { newDraft } = createPlanDelta({
      existingPlan: existing, member, profile,
      allModules: [makeModule('mod-a')], auditLog,
    });
    expect(newDraft.member_id).toBe(member.id);
  });

  it('marks modules present in both plans as unchanged', () => {
    const existing = makeCarePlan(1, [makeRec('mod-a'), makeRec('mod-b')]);
    const { changes } = createPlanDelta({
      existingPlan: existing, member, profile,
      allModules: [makeModule('mod-a'), makeModule('mod-b')], auditLog,
    });
    expect(changes.every(c => c.type === 'unchanged')).toBe(true);
    expect(changes.map(c => c.recommendation.module_id).sort()).toEqual(['mod-a', 'mod-b']);
  });

  it('marks new module as added', () => {
    const existing = makeCarePlan(1, [makeRec('mod-a')]);
    const { changes } = createPlanDelta({
      existingPlan: existing, member, profile,
      allModules: [makeModule('mod-a'), makeModule('mod-c')], auditLog,
    });
    const added = changes.filter(c => c.type === 'added');
    expect(added).toHaveLength(1);
    expect(added[0]!.recommendation.module_id).toBe('mod-c');
  });

  it('marks module absent from new assembly as removed', () => {
    const existing = makeCarePlan(1, [makeRec('mod-a'), makeRec('mod-b')]);
    const { changes } = createPlanDelta({
      existingPlan: existing, member, profile,
      allModules: [makeModule('mod-a')],  // mod-b dropped from library
      auditLog,
    });
    const removed = changes.filter(c => c.type === 'removed');
    expect(removed).toHaveLength(1);
    expect(removed[0]!.recommendation.module_id).toBe('mod-b');
  });

  it('handles simultaneous add, remove, and unchanged', () => {
    const existing = makeCarePlan(1, [makeRec('mod-a'), makeRec('mod-b')]);
    const { changes } = createPlanDelta({
      existingPlan: existing, member, profile,
      allModules: [makeModule('mod-a'), makeModule('mod-c')], auditLog,
    });
    const byType = (t: string) => changes.filter(c => c.type === t);
    expect(byType('unchanged')).toHaveLength(1);
    expect(byType('added')).toHaveLength(1);
    expect(byType('removed')).toHaveLength(1);
  });

  it('returns empty changes when both plans have no modules', () => {
    const existing = makeCarePlan(1, []);
    const { changes } = createPlanDelta({
      existingPlan: existing, member, profile,
      allModules: [], auditLog,
    });
    expect(changes).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — expect compile error**

```
npx jest tests/replanning/plan-delta.test.ts --no-coverage
```

Expected: Cannot find module `'../../src/replanning/plan-delta'`

- [ ] **Step 3: Implement `src/replanning/plan-delta.ts`**

```typescript
import type { CarePlan, ConditionProfile, Member, Recommendation } from '../domain/types';
import type { AuditLog } from '../domain/audit';
import type { ValidatedModule } from '../module-library/schema';
import { assemblePlan } from '../plan-assembly/assembler';

export type RecommendationChangeType = 'added' | 'removed' | 'unchanged';

export interface RecommendationChange {
  readonly type: RecommendationChangeType;
  readonly recommendation: Recommendation;
}

export interface PlanDeltaInput {
  readonly existingPlan: CarePlan;
  readonly member: Member;
  readonly profile: ConditionProfile;
  readonly allModules: readonly ValidatedModule[];
  readonly auditLog: AuditLog;
}

export interface PlanDeltaResult {
  readonly newDraft: CarePlan;
  readonly changes: readonly RecommendationChange[];
}

export function createPlanDelta(input: PlanDeltaInput): PlanDeltaResult {
  const { existingPlan, member, profile, allModules, auditLog } = input;

  const { carePlan: basePlan } = assemblePlan(
    { member, profile },
    [...allModules],
    auditLog,
  );

  const newDraft: CarePlan = { ...basePlan, version: existingPlan.version + 1 };

  const existingModuleIds = new Set(existingPlan.recommendations.map(r => r.module_id));
  const newModuleIds = new Set(newDraft.recommendations.map(r => r.module_id));

  const changes: RecommendationChange[] = [];

  for (const rec of newDraft.recommendations) {
    changes.push({ type: existingModuleIds.has(rec.module_id) ? 'unchanged' : 'added', recommendation: rec });
  }

  for (const rec of existingPlan.recommendations) {
    if (!newModuleIds.has(rec.module_id)) {
      changes.push({ type: 'removed', recommendation: rec });
    }
  }

  return { newDraft, changes };
}
```

- [ ] **Step 4: Run tests — expect all pass**

```
npx jest tests/replanning/plan-delta.test.ts --no-coverage
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Full suite — no regressions**

```
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```
git add src/replanning/plan-delta.ts tests/replanning/plan-delta.test.ts
git commit -m "feat(replanning): add createPlanDelta — assembles new draft and diffs by module_id"
```

---

### Task 3: Domain type extension + change summary (`src/replanning/change-summary.ts`)

**Files:**
- Modify: `src/domain/types.ts` — add `'plan_updated'` to `NotificationType`
- Create: `src/replanning/change-summary.ts`
- Create: `tests/replanning/change-summary.test.ts`

**Context:**

`buildChangeSummary(existingPlan, newPlan, changes)` is a pure aggregation — no I/O. It counts `added`, `removed`, `unchanged` from the changes array and packages them with the plan version pair.

`notifyDeltaPublished(existingPlan, approvedDraft)` guards: if `approvedDraft.status !== 'approved'`, throws `UnapprovedDeltaError`. Otherwise emits a `Notification` of type `'plan_updated'` to the member. Recipient `id` is `existingPlan.member_id` (the owner, not the new plan's ID).

`UnapprovedDeltaError` extends `Error` and sets `this.name = 'UnapprovedDeltaError'` so `toThrow(UnapprovedDeltaError)` works in tests.

`ChangeSummary.care_plan_id` is the new plan's ID (the result of re-planning).

- [ ] **Step 1: Add `'plan_updated'` to `NotificationType` in `src/domain/types.ts`**

Find this block in `src/domain/types.ts` (around line 156):

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

Replace with:

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
  | 'coordinator_message'
  | 'plan_updated';
```

- [ ] **Step 2: Run full suite — no regressions from type change**

```
npx jest --no-coverage
```

Expected: All tests pass (type-only change, no runtime impact).

- [ ] **Step 3: Write the failing tests**

Create `tests/replanning/change-summary.test.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import {
  buildChangeSummary,
  notifyDeltaPublished,
  UnapprovedDeltaError,
} from '../../src/replanning/change-summary';
import type { RecommendationChange } from '../../src/replanning/plan-delta';
import {
  asMemberId,
  asCarePlanId,
  asRecommendationId,
  type CarePlan,
  type Recommendation,
} from '../../src/domain/types';

function makeRec(moduleId: string): Recommendation {
  return {
    id: asRecommendationId(randomUUID()),
    module_id: moduleId,
    title: `Title ${moduleId}`,
    action: `Action ${moduleId}`,
    cadence: 'weekly',
    phase: 1,
    evidence: {
      claim: `Claim ${moduleId}`,
      rationale: 'Rationale',
      evidence_level: 'good',
      source: 'Source',
      confidence: 'validated',
      reviewed_by: null,
      last_reviewed: null,
    },
  };
}

function makeCarePlan(version: number, status: CarePlan['status'] = 'approved'): CarePlan {
  const now = new Date();
  return {
    id: asCarePlanId(randomUUID()),
    member_id: asMemberId('m1'),
    version,
    status,
    approver_id: status === 'approved' ? 'dr1' : null,
    approved_at: status === 'approved' ? now : null,
    rejection_reason: null,
    phase: 1,
    recommendations: [],
    created_at: now,
    updated_at: now,
  };
}

function ch(type: RecommendationChange['type'], moduleId: string): RecommendationChange {
  return { type, recommendation: makeRec(moduleId) };
}

describe('buildChangeSummary', () => {
  it('counts added, removed, unchanged correctly', () => {
    const existing = makeCarePlan(1);
    const newPlan = makeCarePlan(2);
    const changes = [ch('added', 'c'), ch('removed', 'b'), ch('unchanged', 'a')];

    const summary = buildChangeSummary(existing, newPlan, changes);

    expect(summary.added_count).toBe(1);
    expect(summary.removed_count).toBe(1);
    expect(summary.unchanged_count).toBe(1);
  });

  it('captures version_from and version_to', () => {
    const summary = buildChangeSummary(makeCarePlan(3), makeCarePlan(4), []);
    expect(summary.version_from).toBe(3);
    expect(summary.version_to).toBe(4);
  });

  it('care_plan_id is the new plan id', () => {
    const existing = makeCarePlan(1);
    const newPlan = makeCarePlan(2);
    const summary = buildChangeSummary(existing, newPlan, []);
    expect(summary.care_plan_id).toBe(newPlan.id);
  });

  it('preserves changes array reference', () => {
    const changes = [ch('added', 'x')];
    const summary = buildChangeSummary(makeCarePlan(1), makeCarePlan(2), changes);
    expect(summary.changes).toBe(changes);
  });

  it('handles all-unchanged', () => {
    const changes = [ch('unchanged', 'a'), ch('unchanged', 'b')];
    const summary = buildChangeSummary(makeCarePlan(1), makeCarePlan(2), changes);
    expect(summary.added_count).toBe(0);
    expect(summary.removed_count).toBe(0);
    expect(summary.unchanged_count).toBe(2);
  });

  it('handles empty changes', () => {
    const summary = buildChangeSummary(makeCarePlan(1), makeCarePlan(2), []);
    expect(summary.added_count).toBe(0);
    expect(summary.removed_count).toBe(0);
    expect(summary.unchanged_count).toBe(0);
  });
});

describe('notifyDeltaPublished', () => {
  it('returns plan_updated notification for approved draft', () => {
    const existing = makeCarePlan(1);
    const approved = makeCarePlan(2, 'approved');
    const { notification } = notifyDeltaPublished(existing, approved);

    expect(notification.type).toBe('plan_updated');
    expect(notification.recipient_type).toBe('member');
    expect(notification.recipient_id).toBe(existing.member_id);
    expect(notification.read_at).toBeNull();
    expect(notification.ts).toBeInstanceOf(Date);
  });

  it('notification id is a non-empty string', () => {
    const { notification } = notifyDeltaPublished(makeCarePlan(1), makeCarePlan(2, 'approved'));
    expect(typeof notification.id).toBe('string');
    expect(notification.id.length).toBeGreaterThan(0);
  });

  it('throws UnapprovedDeltaError for draft status', () => {
    const existing = makeCarePlan(1);
    const draft = makeCarePlan(2, 'draft');
    expect(() => notifyDeltaPublished(existing, draft)).toThrow(UnapprovedDeltaError);
  });

  it('throws UnapprovedDeltaError for pending_review status', () => {
    const existing = makeCarePlan(1);
    const pending = makeCarePlan(2, 'pending_review');
    expect(() => notifyDeltaPublished(existing, pending)).toThrow(UnapprovedDeltaError);
  });

  it('error message includes care_plan_id and status', () => {
    const existing = makeCarePlan(1);
    const draft = makeCarePlan(2, 'draft');
    expect(() => notifyDeltaPublished(existing, draft)).toThrow(/draft/);
  });
});
```

- [ ] **Step 4: Run tests — expect compile error**

```
npx jest tests/replanning/change-summary.test.ts --no-coverage
```

Expected: Cannot find module `'../../src/replanning/change-summary'`

- [ ] **Step 5: Implement `src/replanning/change-summary.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import type { CarePlan, CarePlanId, CarePlanStatus, Notification } from '../domain/types';
import type { RecommendationChange } from './plan-delta';

export interface ChangeSummary {
  readonly care_plan_id: CarePlanId;
  readonly version_from: number;
  readonly version_to: number;
  readonly added_count: number;
  readonly removed_count: number;
  readonly unchanged_count: number;
  readonly changes: readonly RecommendationChange[];
}

export interface DeltaPublishResult {
  readonly notification: Notification;
}

export class UnapprovedDeltaError extends Error {
  constructor(care_plan_id: CarePlanId, status: CarePlanStatus) {
    super(`CarePlan ${care_plan_id} is not approved (status: ${status})`);
    this.name = 'UnapprovedDeltaError';
  }
}

export function buildChangeSummary(
  existingPlan: CarePlan,
  newPlan: CarePlan,
  changes: readonly RecommendationChange[],
): ChangeSummary {
  return {
    care_plan_id: newPlan.id,
    version_from: existingPlan.version,
    version_to: newPlan.version,
    added_count: changes.filter(c => c.type === 'added').length,
    removed_count: changes.filter(c => c.type === 'removed').length,
    unchanged_count: changes.filter(c => c.type === 'unchanged').length,
    changes,
  };
}

export function notifyDeltaPublished(
  existingPlan: CarePlan,
  approvedDraft: CarePlan,
): DeltaPublishResult {
  if (approvedDraft.status !== 'approved') {
    throw new UnapprovedDeltaError(approvedDraft.id, approvedDraft.status);
  }
  const notification: Notification = {
    id: randomUUID(),
    recipient_id: existingPlan.member_id,
    recipient_type: 'member',
    type: 'plan_updated',
    ts: new Date(),
    read_at: null,
  };
  return { notification };
}
```

- [ ] **Step 6: Run tests — expect all pass**

```
npx jest tests/replanning/change-summary.test.ts --no-coverage
```

Expected: All 11 tests PASS.

- [ ] **Step 7: Full suite — no regressions**

```
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```
git add src/domain/types.ts src/replanning/change-summary.ts tests/replanning/change-summary.test.ts
git commit -m "feat(replanning): add buildChangeSummary, notifyDeltaPublished, plan_updated notification type"
```

---

### Task 4: Barrel exports

**Files:**
- Create: `src/replanning/index.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create `src/replanning/index.ts`**

```typescript
export * from './trigger';
export * from './plan-delta';
export * from './change-summary';
```

- [ ] **Step 2: Add replanning to `src/index.ts`**

Open `src/index.ts`. After the last line (`export * from './coordinator/inline-actions';`), append:

```typescript
export * from './replanning';
```

So the file ends with:
```typescript
export * from './coordinator/attention-queue';
export * from './coordinator/member-timeline';
export * from './coordinator/inline-actions';
export * from './replanning';
```

- [ ] **Step 3: Full suite — no regressions**

```
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 4: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```
git add src/replanning/index.ts src/index.ts
git commit -m "feat(replanning): add barrel exports for replanning module"
```

---

## Self-review checklist

**Spec coverage:**
- US-7.C1 `evaluateReplanningTrigger` with 30/60/90/milestone/lapse — ✅ Task 1
- No duplicate triggers per reason per care plan — ✅ `alreadyFired` guard in Task 1
- US-7.C2 `createPlanDelta` using `assemblePlan`, version = existingPlan.version + 1 — ✅ Task 2
- Diff by module_id with added/removed/unchanged — ✅ Task 2
- US-7.C3 `buildChangeSummary` + `notifyDeltaPublished` — ✅ Task 3
- `'plan_updated'` notification type — ✅ Task 3 (domain types modified)
- Barrel exports — ✅ Task 4

**Type consistency:**
- `assemblePlan` takes `AssemblyInput { member: Member, profile: ConditionProfile }` and returns `AssemblyResult { carePlan: CarePlan, ... }` — ✅ Task 2 uses `{ member, profile }` and destructures `carePlan`
- `allModules: ValidatedModule[]` (mutable) — ✅ Task 2 spreads `[...allModules]` when calling
- `AuditLog.append(entry: Omit<AuditEntry, 'id' | 'ts'>)` — only called inside `assemblePlan`, not directly in plan-delta — ✅
- `RecommendationChange` imported from `'./plan-delta'` in `change-summary.ts` — ✅ Task 3

**noUncheckedIndexedAccess safety:**
- No array index access `[0]` in any implementation — ✅ uses `Set`, `for...of`, `filter`, `some`

**No placeholders:** Every step has complete code. ✅
