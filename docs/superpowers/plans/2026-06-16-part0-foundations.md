# Part 0 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the spine that every other Part will build on — domain types, CarePlan state machine, Evidence contract, Consent model, and Audit log — with tests, no runtime features.

**Architecture:** Pure TypeScript domain model with no persistence or UI. All state transitions return new values (no mutation). The audit log and consent records are in-memory scaffolds; the interfaces they expose are what the rest of the codebase will depend on, so the concrete implementation can be swapped out later without touching callers.

**Tech Stack:** TypeScript 5.x · Node 20 · Jest 29 (ts-jest) · no framework

---

## File map

| File | Responsibility |
|---|---|
| `package.json` | Node project manifest; dev dependencies |
| `tsconfig.json` | Strict TypeScript config |
| `jest.config.ts` | Jest + ts-jest wiring |
| `src/domain/types.ts` | All canonical entity interfaces (Member, CarePlan, Evidence, …) |
| `src/domain/state-machine.ts` | CarePlan valid transitions + `transition()` enforcer |
| `src/domain/evidence.ts` | Evidence validator + `assertEvidencePresent()` |
| `src/domain/consent.ts` | Consent record factory + scope checker |
| `src/domain/audit.ts` | `AuditLog` interface + in-memory implementation |
| `src/index.ts` | Barrel re-export of the public domain API |
| `tests/state-machine.test.ts` | State machine tests |
| `tests/evidence.test.ts` | Evidence contract tests |
| `tests/consent.test.ts` | Consent scope tests |
| `tests/audit.test.ts` | Audit log tests |

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "humm-domain",
  "version": "0.1.0",
  "description": "Her Health Hub — domain model and business logic",
  "private": true,
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "@types/node": "^20.14.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.4",
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*", "tests/**/*", "jest.config.ts"]
}
```

- [ ] **Step 3: Create `jest.config.ts`**

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
};

export default config;
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`

Expected: `node_modules/` created; no errors.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npm run typecheck`

Expected: No errors (no src files yet — that's fine; it should exit 0 or report "no input files" only).

---

## Task 2: Domain types

**Files:**
- Create: `src/domain/types.ts`

- [ ] **Step 1: Write `src/domain/types.ts`**

```typescript
// ─── Scalar IDs ──────────────────────────────────────────────────────────────
export type MemberId = string & { readonly _brand: 'MemberId' };
export type CarePlanId = string & { readonly _brand: 'CarePlanId' };
export type RecommendationId = string & { readonly _brand: 'RecommendationId' };
export type ConditionProfileId = string & { readonly _brand: 'ConditionProfileId' };

export function asMemberId(s: string): MemberId { return s as MemberId; }
export function asCarePlanId(s: string): CarePlanId { return s as CarePlanId; }
export function asRecommendationId(s: string): RecommendationId { return s as RecommendationId; }

// ─── Evidence (0.4 trust spine) ───────────────────────────────────────────────
export type EvidenceLevel = 'guideline' | 'good' | 'referral' | 'safety';
export type EvidenceConfidence = 'illustrative' | 'validated';

export interface Evidence {
  readonly claim: string;
  readonly rationale: string;
  readonly evidence_level: EvidenceLevel;
  readonly source: string;
  readonly confidence: EvidenceConfidence;
  readonly reviewed_by: string | null;
  readonly last_reviewed: Date | null;
}

// ─── Recommendation ───────────────────────────────────────────────────────────
export interface Recommendation {
  readonly id: RecommendationId;
  readonly module_id: string;
  readonly title: string;
  readonly action: string;
  readonly cadence: string;
  readonly phase: 1 | 2 | 3;
  readonly evidence: Evidence;
}

// ─── CarePlan state machine types (0.3) ───────────────────────────────────────
export type CarePlanStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'published'
  | 'changes_requested'
  | 'rejected'
  | 'archived';

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

// ─── Action (weekly task) ─────────────────────────────────────────────────────
export type ActionStatus = 'pending' | 'complete' | 'skipped';

export interface Action {
  readonly id: string;
  readonly care_plan_id: CarePlanId;
  readonly recommendation_id: RecommendationId;
  readonly week: number;
  readonly status: ActionStatus;
  readonly is_primary: boolean;
  readonly completed_at: Date | null;
}

// ─── CheckIn ──────────────────────────────────────────────────────────────────
export type SymptomSeverity = 'mild' | 'moderate' | 'marked';

export interface CheckIn {
  readonly id: string;
  readonly member_id: MemberId;
  readonly week: number;
  readonly cycle_date: Date | null;
  readonly top_symptom_severity: SymptomSeverity | null;
  readonly meds_taken: boolean;
  readonly lifestyle_chips: readonly string[];
  readonly mood: readonly [number, number]; // 2-item; values 1–5
  readonly created_at: Date;
}

// ─── Outcome ──────────────────────────────────────────────────────────────────
export type OutcomeMetric =
  | 'cycle_regularity'
  | 'symptom_severity'
  | 'mood'
  | 'milestone';

export interface Outcome {
  readonly id: string;
  readonly member_id: MemberId;
  readonly metric: OutcomeMetric;
  readonly value: number | string;
  readonly ts: Date;
}

// ─── Consent (DPDP — 0.5) ────────────────────────────────────────────────────
export type ConsentScope =
  | 'health_data'
  | 'care_plan'
  | 'notifications'
  | 'coordinator_access'
  | 'clinician_access'
  | 'employer_aggregate';   // aggregate-only, k-anon — V2

export interface ConsentRecord {
  readonly id: string;
  readonly member_id: MemberId;
  readonly scopes: readonly ConsentScope[];
  readonly granted_at: Date;
  readonly version: string;
}

// ─── ConditionProfile ─────────────────────────────────────────────────────────
export interface ConditionProfile {
  readonly id: ConditionProfileId;
  readonly member_id: MemberId;
  readonly symptoms: readonly string[];
  readonly primary_goal: string;
  readonly conditions: readonly string[];
  readonly diagnosed: boolean;
  readonly diagnosis_date: Date | null;
  readonly free_text_flagged: boolean; // free text → human only, never fed to assembly
}

// ─── EscalationEvent (Spine A safety) ────────────────────────────────────────
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

// ─── Member ───────────────────────────────────────────────────────────────────
export interface Member {
  readonly id: MemberId;
  readonly email: string;
  readonly created_at: Date;
}

// ─── Notification ─────────────────────────────────────────────────────────────
export type NotificationRecipientType = 'member' | 'clinician' | 'coordinator';
export type NotificationType =
  | 'plan_under_review'
  | 'plan_approved'
  | 'plan_rejected'
  | 'check_in_due'
  | 'lapse_nudge'
  | 'milestone'
  | 'escalation_created'
  | 'escalation_ack';

export interface Notification {
  readonly id: string;
  readonly recipient_id: string;
  readonly recipient_type: NotificationRecipientType;
  readonly type: NotificationType;
  readonly ts: Date;
  readonly read_at: Date | null;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/domain/types.ts tsconfig.json package.json jest.config.ts package-lock.json
git commit -m "feat(part0): scaffold project + canonical domain types"
```

---

## Task 3: CarePlan state machine

**Files:**
- Create: `src/domain/state-machine.ts`
- Create: `tests/state-machine.test.ts`

The state machine from spec 0.3:
```
draft → pending_review → approved → published
              │└→ changes_requested → draft (re-draft)
              └→ rejected
published → (re-plan trigger) → draft
any state → archived
```

- [ ] **Step 1: Write the failing tests first**

Create `tests/state-machine.test.ts`:

```typescript
import {
  canTransition,
  transition,
  InvalidTransitionError,
  VALID_TRANSITIONS,
} from '../src/domain/state-machine';
import type { CarePlanStatus } from '../src/domain/types';

describe('CarePlan state machine', () => {
  describe('canTransition', () => {
    const valid: Array<[CarePlanStatus, CarePlanStatus]> = [
      ['draft', 'pending_review'],
      ['draft', 'archived'],
      ['pending_review', 'approved'],
      ['pending_review', 'changes_requested'],
      ['pending_review', 'rejected'],
      ['pending_review', 'archived'],
      ['changes_requested', 'draft'],
      ['changes_requested', 'archived'],
      ['approved', 'published'],
      ['approved', 'archived'],
      ['published', 'draft'],
      ['published', 'archived'],
      ['rejected', 'archived'],
    ];

    test.each(valid)('%s → %s is allowed', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });

    const invalid: Array<[CarePlanStatus, CarePlanStatus]> = [
      ['draft', 'approved'],
      ['draft', 'published'],
      ['draft', 'rejected'],
      ['pending_review', 'published'],
      ['approved', 'draft'],
      ['approved', 'changes_requested'],
      ['published', 'approved'],
      ['rejected', 'draft'],
      ['archived', 'draft'],
      ['archived', 'pending_review'],
    ];

    test.each(invalid)('%s → %s is rejected', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    });
  });

  describe('transition()', () => {
    it('returns the new status on a valid transition', () => {
      expect(transition('draft', 'pending_review')).toBe('pending_review');
    });

    it('throws InvalidTransitionError on an invalid transition', () => {
      expect(() => transition('draft', 'published')).toThrow(InvalidTransitionError);
    });

    it('error message names from and to states', () => {
      expect(() => transition('archived', 'draft')).toThrow(
        'Invalid CarePlan transition: archived → draft',
      );
    });
  });

  describe('terminal state', () => {
    it('archived has no valid outgoing transitions', () => {
      const targets: CarePlanStatus[] = [
        'draft', 'pending_review', 'approved', 'published',
        'changes_requested', 'rejected', 'archived',
      ];
      targets.forEach(to => {
        expect(canTransition('archived', to)).toBe(false);
      });
    });
  });

  describe('VALID_TRANSITIONS table', () => {
    it('lists all statuses as keys', () => {
      const statuses: CarePlanStatus[] = [
        'draft', 'pending_review', 'approved', 'published',
        'changes_requested', 'rejected', 'archived',
      ];
      statuses.forEach(s => expect(s in VALID_TRANSITIONS).toBe(true));
    });
  });
});
```

- [ ] **Step 2: Run — must fail (module not found)**

Run: `npx jest tests/state-machine.test.ts --no-coverage`

Expected: FAIL — "Cannot find module '../src/domain/state-machine'"

- [ ] **Step 3: Write `src/domain/state-machine.ts`**

```typescript
import type { CarePlanStatus } from './types';

export const VALID_TRANSITIONS: Readonly<Record<CarePlanStatus, readonly CarePlanStatus[]>> = {
  draft:             ['pending_review', 'archived'],
  pending_review:    ['approved', 'changes_requested', 'rejected', 'archived'],
  changes_requested: ['draft', 'archived'],
  approved:          ['published', 'archived'],
  published:         ['draft', 'archived'],
  rejected:          ['archived'],
  archived:          [],
};

export class InvalidTransitionError extends Error {
  constructor(from: CarePlanStatus, to: CarePlanStatus) {
    super(`Invalid CarePlan transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: CarePlanStatus, to: CarePlanStatus): boolean {
  return (VALID_TRANSITIONS[from] as readonly string[]).includes(to);
}

export function transition(from: CarePlanStatus, to: CarePlanStatus): CarePlanStatus {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
  return to;
}
```

- [ ] **Step 4: Run — must pass**

Run: `npx jest tests/state-machine.test.ts --no-coverage`

Expected: PASS — all tests green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/domain/state-machine.ts tests/state-machine.test.ts
git commit -m "feat(part0): CarePlan state machine + tests"
```

---

## Task 4: Evidence contract

**Files:**
- Create: `src/domain/evidence.ts`
- Create: `tests/evidence.test.ts`

Rules from 0.4: (1) AI drafts, humans approve. (2) No Recommendation publishes without linked Evidence. (3) AI assembles only from ModuleLibrary. (4) Library is clinician-validated.

This task encodes rule (2) as a runtime guard that the rest of the system calls before any publish transition.

- [ ] **Step 1: Write the failing tests first**

Create `tests/evidence.test.ts`:

```typescript
import {
  validateEvidence,
  assertRecommendationHasEvidence,
  MissingEvidenceError,
  IncompleteEvidenceError,
} from '../src/domain/evidence';
import type { Evidence, Recommendation } from '../src/domain/types';
import { asRecommendationId } from '../src/domain/types';

const validEvidence: Evidence = {
  claim: 'Patient education improves PCOS care.',
  rationale: 'The guideline recommends high-quality patient education.',
  evidence_level: 'guideline',
  source: '2023 Intl. Evidence-Based PCOS Guideline',
  confidence: 'illustrative',
  reviewed_by: null,
  last_reviewed: null,
};

const minimalRec: Omit<Recommendation, 'evidence'> = {
  id: asRecommendationId('rec-001'),
  module_id: 'understand',
  title: 'Understand your PCOS',
  action: 'Read a 3-minute primer.',
  cadence: 'Once this week',
  phase: 1,
};

describe('validateEvidence', () => {
  it('returns true for a complete evidence object', () => {
    expect(validateEvidence(validEvidence)).toBe(true);
  });

  it('returns false when claim is empty', () => {
    expect(validateEvidence({ ...validEvidence, claim: '' })).toBe(false);
  });

  it('returns false when rationale is empty', () => {
    expect(validateEvidence({ ...validEvidence, rationale: '' })).toBe(false);
  });

  it('returns false when source is empty', () => {
    expect(validateEvidence({ ...validEvidence, source: '' })).toBe(false);
  });

  it('accepts all four evidence levels', () => {
    const levels = ['guideline', 'good', 'referral', 'safety'] as const;
    levels.forEach(level => {
      expect(validateEvidence({ ...validEvidence, evidence_level: level })).toBe(true);
    });
  });
});

describe('assertRecommendationHasEvidence', () => {
  it('does not throw for a recommendation with valid evidence', () => {
    const rec: Recommendation = { ...minimalRec, evidence: validEvidence };
    expect(() => assertRecommendationHasEvidence(rec)).not.toThrow();
  });

  it('throws IncompleteEvidenceError when evidence fields are empty', () => {
    const rec: Recommendation = {
      ...minimalRec,
      evidence: { ...validEvidence, claim: '' },
    };
    expect(() => assertRecommendationHasEvidence(rec)).toThrow(IncompleteEvidenceError);
  });

  it('error message includes the recommendation id', () => {
    const rec: Recommendation = {
      ...minimalRec,
      evidence: { ...validEvidence, claim: '' },
    };
    expect(() => assertRecommendationHasEvidence(rec)).toThrow('rec-001');
  });
});

describe('MissingEvidenceError', () => {
  it('is an instance of Error', () => {
    const err = new MissingEvidenceError('rec-xyz');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('MissingEvidenceError');
    expect(err.message).toContain('rec-xyz');
  });
});

describe('Evidence level invariant', () => {
  it('a recommendation whose evidence_level is safety is still valid', () => {
    const rec: Recommendation = {
      ...minimalRec,
      evidence: { ...validEvidence, evidence_level: 'safety' },
    };
    expect(() => assertRecommendationHasEvidence(rec)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run — must fail**

Run: `npx jest tests/evidence.test.ts --no-coverage`

Expected: FAIL — "Cannot find module '../src/domain/evidence'"

- [ ] **Step 3: Write `src/domain/evidence.ts`**

```typescript
import type { Evidence, Recommendation } from './types';

export class MissingEvidenceError extends Error {
  constructor(recommendationId: string) {
    super(`Recommendation "${recommendationId}" cannot publish without linked Evidence`);
    this.name = 'MissingEvidenceError';
  }
}

export class IncompleteEvidenceError extends Error {
  constructor(recommendationId: string, field: string) {
    super(`Evidence for recommendation "${recommendationId}" is incomplete: ${field} is empty`);
    this.name = 'IncompleteEvidenceError';
  }
}

export function validateEvidence(e: Evidence): boolean {
  return (
    e.claim.trim().length > 0 &&
    e.rationale.trim().length > 0 &&
    e.source.trim().length > 0 &&
    ['guideline', 'good', 'referral', 'safety'].includes(e.evidence_level)
  );
}

export function assertRecommendationHasEvidence(rec: Recommendation): void {
  const { evidence: e, id } = rec;
  if (e.claim.trim().length === 0) throw new IncompleteEvidenceError(id, 'claim');
  if (e.rationale.trim().length === 0) throw new IncompleteEvidenceError(id, 'rationale');
  if (e.source.trim().length === 0) throw new IncompleteEvidenceError(id, 'source');
  if (!['guideline', 'good', 'referral', 'safety'].includes(e.evidence_level)) {
    throw new IncompleteEvidenceError(id, 'evidence_level');
  }
}
```

- [ ] **Step 4: Run — must pass**

Run: `npx jest tests/evidence.test.ts --no-coverage`

Expected: PASS — all green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/evidence.ts tests/evidence.test.ts
git commit -m "feat(part0): Evidence contract + assertRecommendationHasEvidence + tests"
```

---

## Task 5: Consent scaffolding

**Files:**
- Create: `src/domain/consent.ts`
- Create: `tests/consent.test.ts`

Spec 0.5: "explicit consent scopes, data minimisation … audit log on all health-data access." This task creates the Consent record factory, the scope guard, and defines the minimum required scopes.

- [ ] **Step 1: Write the failing tests first**

Create `tests/consent.test.ts`:

```typescript
import {
  createConsent,
  hasConsent,
  assertConsent,
  InsufficientConsentError,
  REQUIRED_SCOPES,
  CONSENT_VERSION,
} from '../src/domain/consent';
import type { ConsentScope } from '../src/domain/types';
import { asMemberId } from '../src/domain/types';

const memberId = asMemberId('member-001');

describe('createConsent', () => {
  it('returns a ConsentRecord with the given member and scopes', () => {
    const rec = createConsent(memberId, ['health_data', 'care_plan']);
    expect(rec.member_id).toBe(memberId);
    expect(rec.scopes).toEqual(['health_data', 'care_plan']);
  });

  it('sets version to CONSENT_VERSION', () => {
    const rec = createConsent(memberId, ['health_data']);
    expect(rec.version).toBe(CONSENT_VERSION);
  });

  it('sets granted_at to approximately now', () => {
    const before = Date.now();
    const rec = createConsent(memberId, ['health_data']);
    const after = Date.now();
    expect(rec.granted_at.getTime()).toBeGreaterThanOrEqual(before);
    expect(rec.granted_at.getTime()).toBeLessThanOrEqual(after);
  });

  it('generates a non-empty id', () => {
    const rec = createConsent(memberId, ['health_data']);
    expect(rec.id).toBeTruthy();
    expect(typeof rec.id).toBe('string');
  });

  it('produces unique ids for two calls', () => {
    const a = createConsent(memberId, ['health_data']);
    const b = createConsent(memberId, ['health_data']);
    expect(a.id).not.toBe(b.id);
  });
});

describe('hasConsent', () => {
  it('returns true when record has all required scopes', () => {
    const rec = createConsent(memberId, ['health_data', 'care_plan', 'notifications']);
    expect(hasConsent(rec, ['health_data', 'care_plan'])).toBe(true);
  });

  it('returns false when a required scope is missing', () => {
    const rec = createConsent(memberId, ['health_data']);
    expect(hasConsent(rec, ['health_data', 'care_plan'])).toBe(false);
  });

  it('returns true for an empty required list', () => {
    const rec = createConsent(memberId, []);
    expect(hasConsent(rec, [])).toBe(true);
  });
});

describe('assertConsent', () => {
  it('does not throw when all scopes are present', () => {
    const rec = createConsent(memberId, ['health_data', 'care_plan']);
    expect(() => assertConsent(rec, ['health_data', 'care_plan'])).not.toThrow();
  });

  it('throws InsufficientConsentError listing missing scopes', () => {
    const rec = createConsent(memberId, ['health_data']);
    expect(() => assertConsent(rec, ['health_data', 'care_plan'])).toThrow(InsufficientConsentError);
  });

  it('error message names each missing scope', () => {
    const rec = createConsent(memberId, []);
    expect(() =>
      assertConsent(rec, ['health_data', 'clinician_access']),
    ).toThrow('health_data');
  });
});

describe('REQUIRED_SCOPES', () => {
  it('includes health_data and care_plan at minimum', () => {
    const required: ConsentScope[] = ['health_data', 'care_plan'];
    required.forEach(s => expect(REQUIRED_SCOPES).toContain(s));
  });
});
```

- [ ] **Step 2: Run — must fail**

Run: `npx jest tests/consent.test.ts --no-coverage`

Expected: FAIL — "Cannot find module '../src/domain/consent'"

- [ ] **Step 3: Write `src/domain/consent.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import type { ConsentRecord, ConsentScope, MemberId } from './types';

export const CONSENT_VERSION = '1.0.0';

export const REQUIRED_SCOPES: readonly ConsentScope[] = ['health_data', 'care_plan'];

export class InsufficientConsentError extends Error {
  readonly missing: ConsentScope[];
  constructor(missing: ConsentScope[]) {
    super(`Insufficient consent — missing scopes: ${missing.join(', ')}`);
    this.name = 'InsufficientConsentError';
    this.missing = missing;
  }
}

export function createConsent(
  memberId: MemberId,
  scopes: readonly ConsentScope[],
): ConsentRecord {
  return {
    id: randomUUID(),
    member_id: memberId,
    scopes,
    granted_at: new Date(),
    version: CONSENT_VERSION,
  };
}

export function hasConsent(
  record: ConsentRecord,
  requiredScopes: readonly ConsentScope[],
): boolean {
  return requiredScopes.every(s => record.scopes.includes(s));
}

export function assertConsent(
  record: ConsentRecord,
  requiredScopes: readonly ConsentScope[],
): void {
  const missing = requiredScopes.filter(s => !record.scopes.includes(s));
  if (missing.length > 0) throw new InsufficientConsentError(missing);
}
```

- [ ] **Step 4: Run — must pass**

Run: `npx jest tests/consent.test.ts --no-coverage`

Expected: PASS — all green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/consent.ts tests/consent.test.ts
git commit -m "feat(part0): Consent record factory + scope guard + tests"
```

---

## Task 6: Audit log scaffolding

**Files:**
- Create: `src/domain/audit.ts`
- Create: `tests/audit.test.ts`

Spec 0.5: "audit log on all health-data access." Invariant 0.3: "every [CarePlan] transition is audit-logged." This task defines the `AuditLog` interface and the in-memory implementation that will be used in tests and later wired to a persistence layer.

- [ ] **Step 1: Write the failing tests first**

Create `tests/audit.test.ts`:

```typescript
import {
  createInMemoryAuditLog,
  type AuditLog,
  type AuditAction,
} from '../src/domain/audit';

describe('AuditLog (in-memory)', () => {
  let log: AuditLog;

  beforeEach(() => {
    log = createInMemoryAuditLog();
  });

  describe('append', () => {
    it('returns an entry with a non-empty id', () => {
      const entry = log.append({
        actor_id: 'clinician-1',
        action: 'care_plan.transitioned',
        subject_id: 'plan-001',
        subject_type: 'CarePlan',
        metadata: { from: 'draft', to: 'pending_review' },
      });
      expect(entry.id).toBeTruthy();
    });

    it('sets ts to approximately now', () => {
      const before = Date.now();
      const entry = log.append({
        actor_id: 'system',
        action: 'care_plan.created',
        subject_id: 'plan-001',
        subject_type: 'CarePlan',
        metadata: {},
      });
      const after = Date.now();
      expect(entry.ts.getTime()).toBeGreaterThanOrEqual(before);
      expect(entry.ts.getTime()).toBeLessThanOrEqual(after);
    });

    it('generates unique ids across entries', () => {
      const a = log.append({
        actor_id: 'system', action: 'care_plan.created',
        subject_id: 'plan-001', subject_type: 'CarePlan', metadata: {},
      });
      const b = log.append({
        actor_id: 'system', action: 'care_plan.created',
        subject_id: 'plan-002', subject_type: 'CarePlan', metadata: {},
      });
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('entries()', () => {
    it('returns an empty array on a fresh log', () => {
      expect(log.entries()).toEqual([]);
    });

    it('returns all appended entries in insertion order', () => {
      log.append({ actor_id: 'a', action: 'care_plan.created', subject_id: '1', subject_type: 'CarePlan', metadata: {} });
      log.append({ actor_id: 'b', action: 'care_plan.transitioned', subject_id: '1', subject_type: 'CarePlan', metadata: {} });
      const entries = log.entries();
      expect(entries).toHaveLength(2);
      expect(entries[0]?.action).toBe('care_plan.created');
      expect(entries[1]?.action).toBe('care_plan.transitioned');
    });

    it('returns a defensive copy — mutating the result does not affect the log', () => {
      log.append({ actor_id: 'a', action: 'care_plan.created', subject_id: '1', subject_type: 'CarePlan', metadata: {} });
      const first = log.entries();
      first.pop();
      expect(log.entries()).toHaveLength(1);
    });
  });

  describe('filtering helpers', () => {
    it('can filter entries by subject_id using standard array methods', () => {
      log.append({ actor_id: 'a', action: 'care_plan.created', subject_id: 'plan-1', subject_type: 'CarePlan', metadata: {} });
      log.append({ actor_id: 'b', action: 'health_data.accessed', subject_id: 'member-1', subject_type: 'Member', metadata: {} });

      const planEntries = log.entries().filter(e => e.subject_id === 'plan-1');
      expect(planEntries).toHaveLength(1);
      expect(planEntries[0]?.action).toBe('care_plan.created');
    });
  });

  describe('AuditAction type coverage', () => {
    const allActions: AuditAction[] = [
      'care_plan.created',
      'care_plan.transitioned',
      'care_plan.approved',
      'care_plan.published',
      'health_data.accessed',
      'consent.granted',
      'escalation.created',
      'escalation.acknowledged',
    ];

    it.each(allActions)('action "%s" can be recorded', (action) => {
      expect(() =>
        log.append({ actor_id: 'system', action, subject_id: 'x', subject_type: 'x', metadata: {} }),
      ).not.toThrow();
    });
  });
});
```

- [ ] **Step 2: Run — must fail**

Run: `npx jest tests/audit.test.ts --no-coverage`

Expected: FAIL — "Cannot find module '../src/domain/audit'"

- [ ] **Step 3: Write `src/domain/audit.ts`**

```typescript
import { randomUUID } from 'node:crypto';

export type AuditAction =
  | 'care_plan.created'
  | 'care_plan.transitioned'
  | 'care_plan.approved'
  | 'care_plan.published'
  | 'health_data.accessed'
  | 'consent.granted'
  | 'escalation.created'
  | 'escalation.acknowledged';

export interface AuditEntry {
  readonly id: string;
  readonly ts: Date;
  readonly actor_id: string;
  readonly action: AuditAction;
  readonly subject_id: string;
  readonly subject_type: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface AuditLog {
  append(entry: Omit<AuditEntry, 'id' | 'ts'>): AuditEntry;
  entries(): AuditEntry[];
}

export function createInMemoryAuditLog(): AuditLog {
  const store: AuditEntry[] = [];

  return {
    append(entry) {
      const full: AuditEntry = {
        ...entry,
        id: randomUUID(),
        ts: new Date(),
      };
      store.push(full);
      return full;
    },
    entries() {
      return [...store];
    },
  };
}
```

- [ ] **Step 4: Run — must pass**

Run: `npx jest tests/audit.test.ts --no-coverage`

Expected: PASS — all green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/audit.ts tests/audit.test.ts
git commit -m "feat(part0): AuditLog interface + in-memory implementation + tests"
```

---

## Task 7: Barrel export + full test run

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Write `src/index.ts`**

```typescript
export * from './domain/types';
export * from './domain/state-machine';
export * from './domain/evidence';
export * from './domain/consent';
export * from './domain/audit';
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected:
```
Test Suites: 4 passed, 4 total
Tests:       XX passed, XX total
```
All green, zero failures.

- [ ] **Step 3: Final typecheck**

Run: `npm run typecheck`

Expected: exits 0.

- [ ] **Step 4: Final commit**

```bash
git add src/index.ts
git commit -m "feat(part0): barrel export — Part 0 foundations complete"
```

---

## Self-review

### Spec coverage

| Spec section | Covered by |
|---|---|
| 0.2 Canonical data model — all entities | Task 2 `types.ts` |
| 0.3 CarePlan state machine | Task 3 `state-machine.ts` + tests |
| 0.3 "every transition is audit-logged" | `AuditAction` includes all transitions; callers wire it in Part 1 |
| 0.4 Evidence contract — struct | `Evidence` interface in `types.ts` |
| 0.4 "No Recommendation publishes without Evidence" | `assertRecommendationHasEvidence` in Task 4 |
| 0.4 EvidenceLevel enum | `EvidenceLevel` type in `types.ts` |
| 0.5 Consent scopes | `ConsentScope` type + `createConsent` + `assertConsent` in Task 5 |
| 0.5 Audit log on health-data access | `health_data.accessed` AuditAction + `AuditLog` interface in Task 6 |

**No gaps found.** Part 0 is purely scaffolding; no assembly engine, no AI calls, no UI — those belong to Parts 1+.

### Placeholder scan

No TBDs, no "implement later", no placeholder steps. Every step has complete code.

### Type consistency

- `MemberId`, `CarePlanId`, `RecommendationId` defined once in `types.ts`, imported everywhere.
- `VALID_TRANSITIONS` uses `CarePlanStatus` from `types.ts` throughout.
- `createConsent` returns `ConsentRecord` (type from `types.ts`); `assertConsent` accepts same.
- `AuditLog.append` accepts `Omit<AuditEntry, 'id' | 'ts'>` — consistent across definition and tests.
