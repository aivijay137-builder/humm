# Part 1 — Spine C + Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ModuleLibrary schema + loader, structured intake processing (ConditionProfile + Consent + red-flag check), and the deterministic plan-assembly pipeline (module selector → CarePlan draft with Evidence-linked Recommendations).

**Architecture:** Three focused modules — `module-library` (types + loader from seed JSON), `intake` (ConditionProfile factory + red-flag rules), and `plan-assembly` (module selector + assembler). All are pure TypeScript with no external API calls; the AI rationale-personalisation hook (US-1.C2 full) slots in above the assembler in a later part. Every module depends only on Part 0 domain types and is otherwise independent of the others.

**Tech Stack:** TypeScript 5.x · Node 20 · Jest 29 (ts-jest) · `node:fs` for seed loading · no new npm dependencies

---

## File map

| File | Responsibility |
|---|---|
| `src/domain/types.ts` | MODIFY: add `asConditionProfileId()` helper (line 10) |
| `src/module-library/schema.ts` | `LibraryModule` (seed JSON shape) · `ValidatedModule` (domain shape) · `toEvidence` · `toValidatedModule` |
| `src/module-library/loader.ts` | `loadModuleLibraryFromJson` · `loadModuleLibraryFromFile` · `InvalidModuleLibraryError` |
| `src/module-library/index.ts` | Barrel (created in Task 2 after loader exists) |
| `src/intake/red-flag.ts` | `checkIntakeRedFlags` · `IntakeSymptom` · `IntakeRedFlagInput/Result` |
| `src/intake/intake-service.ts` | `processIntake` · `IntakeInput` · `IntakeResult` — orchestrates consent + profile + red-flag |
| `src/intake/index.ts` | Barrel (created in Task 4 after both intake files exist) |
| `src/plan-assembly/module-selector.ts` | `selectModules` — evaluates `include_when` OR rules |
| `src/plan-assembly/assembler.ts` | `assemblePlan` — maps selected modules → `CarePlan(draft)` + `Recommendation[]` |
| `src/plan-assembly/index.ts` | Barrel (created in Task 6 after both assembly files exist) |
| `src/index.ts` | MODIFY: re-export all new modules |
| `tests/module-library/schema.test.ts` | `toEvidence` + `toValidatedModule` unit tests |
| `tests/module-library/loader.test.ts` | `loadModuleLibraryFromJson` + `loadModuleLibraryFromFile` tests |
| `tests/intake/red-flag.test.ts` | `checkIntakeRedFlags` unit tests |
| `tests/intake/intake-service.test.ts` | `processIntake` integration tests |
| `tests/plan-assembly/module-selector.test.ts` | `selectModules` unit tests |
| `tests/plan-assembly/assembler.test.ts` | `assemblePlan` unit + integration tests |

---

## Task 1: ModuleLibrary schema types

**Files:**
- Modify: `src/domain/types.ts`
- Create: `src/module-library/schema.ts`
- Test: `tests/module-library/schema.test.ts`

The seed JSON uses `"level"` where the domain uses `"evidence_level"`, and carries a `"validated"` field the domain doesn't need. This task defines both shapes and the mapping functions.

- [ ] **Step 1: Write the failing tests**

Create `tests/module-library/schema.test.ts`:

```typescript
import {
  toEvidence,
  toValidatedModule,
  type LibraryEvidenceRaw,
  type LibraryModule,
} from '../../src/module-library/schema';

const rawEvidence: LibraryEvidenceRaw = {
  claim: 'Patient education improves outcomes.',
  rationale: 'Guideline recommendation.',
  level: 'guideline',
  source: '2023 PCOS Guideline',
  confidence: 'illustrative',
  reviewed_by: null,
  last_reviewed: null,
  validated: false,
};

const rawModule: LibraryModule = {
  id: 'understand',
  phase: 1,
  kind: 'self',
  icon: 'book-open',
  title: 'Understand your PCOS',
  action: 'Read a 3-minute primer.',
  cadence: 'Once this week',
  goals_served: ['all'],
  always: true,
  this_week: false,
  evidence: rawEvidence,
};

describe('toEvidence', () => {
  it('maps level to evidence_level', () => {
    expect(toEvidence(rawEvidence).evidence_level).toBe('guideline');
  });

  it('does not include a raw "level" field on the output', () => {
    const e = toEvidence(rawEvidence) as Record<string, unknown>;
    expect('level' in e).toBe(false);
  });

  it('maps null last_reviewed to null', () => {
    expect(toEvidence(rawEvidence).last_reviewed).toBeNull();
  });

  it('maps an ISO string last_reviewed to a Date', () => {
    const e = toEvidence({ ...rawEvidence, last_reviewed: '2024-01-15T00:00:00.000Z' });
    expect(e.last_reviewed).toBeInstanceOf(Date);
    expect(e.last_reviewed?.getFullYear()).toBe(2024);
  });

  it('passes through claim, rationale, source, confidence, reviewed_by', () => {
    const e = toEvidence(rawEvidence);
    expect(e.claim).toBe('Patient education improves outcomes.');
    expect(e.rationale).toBe('Guideline recommendation.');
    expect(e.source).toBe('2023 PCOS Guideline');
    expect(e.confidence).toBe('illustrative');
    expect(e.reviewed_by).toBeNull();
  });

  it('does not include the seed "validated" field on the output', () => {
    const e = toEvidence(rawEvidence) as Record<string, unknown>;
    expect('validated' in e).toBe(false);
  });
});

describe('toValidatedModule', () => {
  it('preserves scalar fields unchanged', () => {
    const m = toValidatedModule(rawModule);
    expect(m.id).toBe('understand');
    expect(m.phase).toBe(1);
    expect(m.kind).toBe('self');
    expect(m.title).toBe('Understand your PCOS');
    expect(m.always).toBe(true);
    expect(m.this_week).toBe(false);
  });

  it('converts evidence via toEvidence (level → evidence_level)', () => {
    expect(toValidatedModule(rawModule).evidence.evidence_level).toBe('guideline');
  });

  it('preserves include_when when present', () => {
    const withWhen: LibraryModule = {
      ...rawModule,
      always: false,
      include_when: { symptoms: ['skinhair'], primary_goal: ['skin'] },
    };
    const m = toValidatedModule(withWhen);
    expect(m.include_when?.symptoms).toEqual(['skinhair']);
    expect(m.include_when?.primary_goal).toEqual(['skin']);
  });

  it('include_when is undefined when omitted from seed', () => {
    expect(toValidatedModule(rawModule).include_when).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — must FAIL**

Run: `npx jest tests/module-library/schema.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../../src/module-library/schema'`

- [ ] **Step 3: Add `asConditionProfileId` to `src/domain/types.ts`**

After line 9 (`export function asRecommendationId...`), insert:

```typescript
export function asConditionProfileId(s: string): ConditionProfileId { return s as ConditionProfileId; }
```

- [ ] **Step 4: Create `src/module-library/schema.ts`**

```typescript
import type { Evidence, EvidenceLevel, EvidenceConfidence } from '../domain/types';

export type ModuleKind = 'self' | 'referral' | 'safety';

export interface ModuleIncludeWhen {
  readonly symptoms?: readonly string[];
  readonly primary_goal?: readonly string[];
  readonly conditions?: readonly string[];
}

export interface LibraryEvidenceRaw {
  readonly claim: string;
  readonly rationale: string;
  readonly level: EvidenceLevel;
  readonly source: string;
  readonly confidence: EvidenceConfidence;
  readonly reviewed_by: string | null;
  readonly last_reviewed: string | null;
  readonly validated: boolean;
}

export interface LibraryModule {
  readonly id: string;
  readonly phase: 1 | 2 | 3;
  readonly kind: ModuleKind;
  readonly icon: string;
  readonly title: string;
  readonly action: string;
  readonly cadence: string;
  readonly goals_served: readonly string[];
  readonly always: boolean;
  readonly this_week: boolean;
  readonly include_when?: ModuleIncludeWhen;
  readonly evidence: LibraryEvidenceRaw;
}

export interface LibrarySeed {
  readonly _meta: Readonly<Record<string, unknown>>;
  readonly modules: readonly LibraryModule[];
}

export interface ValidatedModule {
  readonly id: string;
  readonly phase: 1 | 2 | 3;
  readonly kind: ModuleKind;
  readonly icon: string;
  readonly title: string;
  readonly action: string;
  readonly cadence: string;
  readonly goals_served: readonly string[];
  readonly always: boolean;
  readonly this_week: boolean;
  readonly include_when?: ModuleIncludeWhen;
  readonly evidence: Evidence;
}

export function toEvidence(raw: LibraryEvidenceRaw): Evidence {
  return {
    claim: raw.claim,
    rationale: raw.rationale,
    evidence_level: raw.level,
    source: raw.source,
    confidence: raw.confidence,
    reviewed_by: raw.reviewed_by,
    last_reviewed: raw.last_reviewed ? new Date(raw.last_reviewed) : null,
  };
}

export function toValidatedModule(raw: LibraryModule): ValidatedModule {
  return {
    id: raw.id,
    phase: raw.phase,
    kind: raw.kind,
    icon: raw.icon,
    title: raw.title,
    action: raw.action,
    cadence: raw.cadence,
    goals_served: raw.goals_served,
    always: raw.always,
    this_week: raw.this_week,
    ...(raw.include_when !== undefined ? { include_when: raw.include_when } : {}),
    evidence: toEvidence(raw.evidence),
  };
}
```

- [ ] **Step 5: Run — must PASS**

Run: `npx jest tests/module-library/schema.test.ts --no-coverage`
Expected: all green

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 7: Commit**

```bash
git add src/domain/types.ts src/module-library/schema.ts tests/module-library/schema.test.ts
git commit -m "feat(part1): ModuleLibrary schema types + toEvidence/toValidatedModule + asConditionProfileId"
```

---

## Task 2: ModuleLibrary loader

**Files:**
- Create: `src/module-library/loader.ts`
- Create: `src/module-library/index.ts`
- Test: `tests/module-library/loader.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/module-library/loader.test.ts`:

```typescript
import * as path from 'node:path';
import {
  loadModuleLibraryFromJson,
  loadModuleLibraryFromFile,
  InvalidModuleLibraryError,
} from '../../src/module-library/loader';

const SEED_PATH = path.join(process.cwd(), 'module-library.seed.json');

const minimalSeedJson = JSON.stringify({
  _meta: {},
  modules: [
    {
      id: 'test-module',
      phase: 1,
      kind: 'self',
      icon: 'test',
      title: 'Test module',
      action: 'Do the thing.',
      cadence: 'Daily',
      goals_served: ['all'],
      always: true,
      this_week: false,
      evidence: {
        claim: 'A claim.',
        rationale: 'A rationale.',
        level: 'guideline',
        source: 'Test source',
        confidence: 'illustrative',
        reviewed_by: null,
        last_reviewed: null,
        validated: false,
      },
    },
  ],
});

describe('loadModuleLibraryFromJson', () => {
  it('returns a ValidatedModule array from valid JSON', () => {
    const modules = loadModuleLibraryFromJson(minimalSeedJson);
    expect(modules).toHaveLength(1);
    expect(modules[0]?.id).toBe('test-module');
  });

  it('maps evidence.level to evidence.evidence_level', () => {
    const modules = loadModuleLibraryFromJson(minimalSeedJson);
    expect(modules[0]?.evidence.evidence_level).toBe('guideline');
  });

  it('throws InvalidModuleLibraryError on unparseable JSON', () => {
    expect(() => loadModuleLibraryFromJson('not json {')).toThrow(InvalidModuleLibraryError);
  });

  it('throws InvalidModuleLibraryError when modules key is missing', () => {
    expect(() =>
      loadModuleLibraryFromJson(JSON.stringify({ _meta: {} })),
    ).toThrow(InvalidModuleLibraryError);
  });

  it('throws InvalidModuleLibraryError when modules is not an array', () => {
    expect(() =>
      loadModuleLibraryFromJson(JSON.stringify({ _meta: {}, modules: 'bad' })),
    ).toThrow(InvalidModuleLibraryError);
  });
});

describe('loadModuleLibraryFromFile', () => {
  it('loads the seed file and returns 14 modules', () => {
    const modules = loadModuleLibraryFromFile(SEED_PATH);
    expect(modules).toHaveLength(14);
  });

  it('all modules have valid evidence_level values', () => {
    const validLevels = ['guideline', 'good', 'referral', 'safety'];
    const modules = loadModuleLibraryFromFile(SEED_PATH);
    modules.forEach(m => {
      expect(validLevels).toContain(m.evidence.evidence_level);
    });
  });

  it('all modules have non-empty claim and source', () => {
    const modules = loadModuleLibraryFromFile(SEED_PATH);
    modules.forEach(m => {
      expect(m.evidence.claim.length).toBeGreaterThan(0);
      expect(m.evidence.source.length).toBeGreaterThan(0);
    });
  });

  it('at least one module has always=true', () => {
    const modules = loadModuleLibraryFromFile(SEED_PATH);
    expect(modules.some(m => m.always)).toBe(true);
  });

  it('throws InvalidModuleLibraryError for a non-existent path', () => {
    expect(() => loadModuleLibraryFromFile('/no/such/file.json')).toThrow(
      InvalidModuleLibraryError,
    );
  });
});
```

- [ ] **Step 2: Run — must FAIL**

Run: `npx jest tests/module-library/loader.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../../src/module-library/loader'`

- [ ] **Step 3: Create `src/module-library/loader.ts`**

```typescript
import { readFileSync } from 'node:fs';
import type { LibrarySeed, ValidatedModule } from './schema';
import { toValidatedModule } from './schema';

export class InvalidModuleLibraryError extends Error {
  constructor(message: string) {
    super(`Invalid module library: ${message}`);
    this.name = 'InvalidModuleLibraryError';
  }
}

export function loadModuleLibraryFromJson(json: string): ValidatedModule[] {
  let seed: LibrarySeed;
  try {
    seed = JSON.parse(json) as LibrarySeed;
  } catch {
    throw new InvalidModuleLibraryError('JSON parse failed');
  }
  if (!Array.isArray(seed.modules)) {
    throw new InvalidModuleLibraryError('modules must be an array');
  }
  return seed.modules.map(toValidatedModule);
}

export function loadModuleLibraryFromFile(filePath: string): ValidatedModule[] {
  let json: string;
  try {
    json = readFileSync(filePath, 'utf-8');
  } catch {
    throw new InvalidModuleLibraryError(`could not read file: ${filePath}`);
  }
  return loadModuleLibraryFromJson(json);
}
```

- [ ] **Step 4: Create `src/module-library/index.ts`**

```typescript
export * from './schema';
export * from './loader';
```

- [ ] **Step 5: Run — must PASS**

Run: `npx jest tests/module-library/loader.test.ts --no-coverage`
Expected: all green

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 7: Commit**

```bash
git add src/module-library/loader.ts src/module-library/index.ts tests/module-library/loader.test.ts
git commit -m "feat(part1): ModuleLibrary loader — loadFromJson/File + InvalidModuleLibraryError + tests"
```

---

## Task 3: Intake red-flag rules

**Files:**
- Create: `src/intake/red-flag.ts`
- Test: `tests/intake/red-flag.test.ts`

Spec US-1.C1 + US-4.C1: deterministic rule — any symptom with `marked` severity on intake creates an `EscalationEvent(severity=high, status=open)`. Not-diagnosed is flagged informational (no escalation on its own).

- [ ] **Step 1: Write the failing tests**

Create `tests/intake/red-flag.test.ts`:

```typescript
import { checkIntakeRedFlags, type IntakeRedFlagInput } from '../../src/intake/red-flag';
import { asMemberId } from '../../src/domain/types';

const memberId = asMemberId('member-001');

const mildInput: IntakeRedFlagInput = {
  member_id: memberId,
  symptoms: [
    { symptom: 'irregular_cycle', severity: 'mild' },
    { symptom: 'weight', severity: 'moderate' },
  ],
  not_diagnosed: false,
};

describe('checkIntakeRedFlags — no red flag', () => {
  it('returns null escalation when all symptoms are mild or moderate', () => {
    expect(checkIntakeRedFlags(mildInput).escalation).toBeNull();
  });

  it('returns not_diagnosed_flagged=false when diagnosed', () => {
    expect(checkIntakeRedFlags(mildInput).not_diagnosed_flagged).toBe(false);
  });

  it('empty symptoms array produces no escalation', () => {
    const input: IntakeRedFlagInput = { ...mildInput, symptoms: [] };
    expect(checkIntakeRedFlags(input).escalation).toBeNull();
  });
});

describe('checkIntakeRedFlags — marked severity', () => {
  const markedInput: IntakeRedFlagInput = {
    ...mildInput,
    symptoms: [{ symptom: 'mood', severity: 'marked' }],
  };

  it('creates an EscalationEvent when any symptom is marked', () => {
    expect(checkIntakeRedFlags(markedInput).escalation).not.toBeNull();
  });

  it('escalation severity is high', () => {
    expect(checkIntakeRedFlags(markedInput).escalation?.severity).toBe('high');
  });

  it('escalation status is open', () => {
    expect(checkIntakeRedFlags(markedInput).escalation?.status).toBe('open');
  });

  it('escalation trigger names the marked symptom', () => {
    expect(checkIntakeRedFlags(markedInput).escalation?.trigger).toContain('mood');
  });

  it('escalation trigger names all marked symptoms when multiple', () => {
    const input: IntakeRedFlagInput = {
      ...mildInput,
      symptoms: [
        { symptom: 'mood', severity: 'marked' },
        { symptom: 'pain', severity: 'marked' },
        { symptom: 'weight', severity: 'mild' },
      ],
    };
    const { escalation } = checkIntakeRedFlags(input);
    expect(escalation?.trigger).toContain('mood');
    expect(escalation?.trigger).toContain('pain');
  });

  it('escalation has a non-empty id', () => {
    expect(checkIntakeRedFlags(markedInput).escalation?.id).toBeTruthy();
  });

  it('escalation member_id matches input', () => {
    expect(checkIntakeRedFlags(markedInput).escalation?.member_id).toBe(memberId);
  });

  it('escalation acknowledged_at is null', () => {
    expect(checkIntakeRedFlags(markedInput).escalation?.acknowledged_at).toBeNull();
  });

  it('mix of marked and non-marked still escalates', () => {
    const input: IntakeRedFlagInput = {
      ...mildInput,
      symptoms: [
        { symptom: 'weight', severity: 'mild' },
        { symptom: 'mood', severity: 'marked' },
      ],
    };
    expect(checkIntakeRedFlags(input).escalation).not.toBeNull();
  });
});

describe('checkIntakeRedFlags — not_diagnosed', () => {
  it('sets not_diagnosed_flagged=true when not_diagnosed=true', () => {
    const input: IntakeRedFlagInput = { ...mildInput, not_diagnosed: true };
    expect(checkIntakeRedFlags(input).not_diagnosed_flagged).toBe(true);
  });

  it('not_diagnosed alone does not create an escalation', () => {
    const input: IntakeRedFlagInput = { ...mildInput, not_diagnosed: true };
    expect(checkIntakeRedFlags(input).escalation).toBeNull();
  });
});
```

- [ ] **Step 2: Run — must FAIL**

Run: `npx jest tests/intake/red-flag.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../../src/intake/red-flag'`

- [ ] **Step 3: Create `src/intake/red-flag.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import type { EscalationEvent, MemberId, SymptomSeverity } from '../domain/types';

export interface IntakeSymptom {
  readonly symptom: string;
  readonly severity: SymptomSeverity;
}

export interface IntakeRedFlagInput {
  readonly member_id: MemberId;
  readonly symptoms: readonly IntakeSymptom[];
  readonly not_diagnosed: boolean;
}

export interface IntakeRedFlagResult {
  readonly escalation: EscalationEvent | null;
  readonly not_diagnosed_flagged: boolean;
}

export function checkIntakeRedFlags(input: IntakeRedFlagInput): IntakeRedFlagResult {
  const markedSymptoms = input.symptoms.filter(s => s.severity === 'marked');

  let escalation: EscalationEvent | null = null;
  if (markedSymptoms.length > 0) {
    const symptomList = markedSymptoms.map(s => s.symptom).join(', ');
    escalation = {
      id: randomUUID(),
      member_id: input.member_id,
      trigger: `marked severity on intake: ${symptomList}`,
      severity: 'high',
      status: 'open',
      created_at: new Date(),
      acknowledged_at: null,
    };
  }

  return {
    escalation,
    not_diagnosed_flagged: input.not_diagnosed,
  };
}
```

- [ ] **Step 4: Run — must PASS**

Run: `npx jest tests/intake/red-flag.test.ts --no-coverage`
Expected: all green

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 6: Commit**

```bash
git add src/intake/red-flag.ts tests/intake/red-flag.test.ts
git commit -m "feat(part1): intake red-flag rules — marked severity → EscalationEvent(high)"
```

---

## Task 4: Intake service

**Files:**
- Create: `src/intake/intake-service.ts`
- Create: `src/intake/index.ts`
- Test: `tests/intake/intake-service.test.ts`

Spec US-1.C1: orchestrates consent gate → ConditionProfile creation → red-flag check, with full audit trail. Consent must be asserted before any health data is written. Free text is captured as a flag only — never passed to assembly.

- [ ] **Step 1: Write the failing tests**

Create `tests/intake/intake-service.test.ts`:

```typescript
import { processIntake, type IntakeInput } from '../../src/intake/intake-service';
import { createInMemoryAuditLog } from '../../src/domain/audit';
import { InsufficientConsentError } from '../../src/domain/consent';
import { asMemberId } from '../../src/domain/types';

const memberId = asMemberId('member-001');

const baseInput: IntakeInput = {
  member_id: memberId,
  symptoms: [
    { symptom: 'irregular_cycle', severity: 'mild' },
    { symptom: 'weight', severity: 'moderate' },
  ],
  primary_goal: 'cycle',
  conditions: [],
  diagnosed: true,
  diagnosis_date: null,
  consent_scopes: ['health_data', 'care_plan'],
  has_free_text: false,
};

describe('processIntake — ConditionProfile', () => {
  it('profile.member_id matches input', () => {
    const { profile } = processIntake(baseInput, createInMemoryAuditLog());
    expect(profile.member_id).toBe(memberId);
  });

  it('profile.symptoms contains symptom names only (not severities)', () => {
    const { profile } = processIntake(baseInput, createInMemoryAuditLog());
    expect(profile.symptoms).toEqual(['irregular_cycle', 'weight']);
  });

  it('profile.primary_goal set correctly', () => {
    const { profile } = processIntake(baseInput, createInMemoryAuditLog());
    expect(profile.primary_goal).toBe('cycle');
  });

  it('profile.conditions set correctly', () => {
    const input: IntakeInput = { ...baseInput, conditions: ['Insulin resistance'] };
    const { profile } = processIntake(input, createInMemoryAuditLog());
    expect(profile.conditions).toEqual(['Insulin resistance']);
  });

  it('profile.diagnosed reflects input', () => {
    const { profile } = processIntake(baseInput, createInMemoryAuditLog());
    expect(profile.diagnosed).toBe(true);
  });

  it('profile.free_text_flagged=true when has_free_text=true', () => {
    const input: IntakeInput = { ...baseInput, has_free_text: true };
    expect(processIntake(input, createInMemoryAuditLog()).profile.free_text_flagged).toBe(true);
  });

  it('profile.free_text_flagged=false when has_free_text=false', () => {
    expect(processIntake(baseInput, createInMemoryAuditLog()).profile.free_text_flagged).toBe(false);
  });

  it('profile.id is a non-empty string', () => {
    expect(processIntake(baseInput, createInMemoryAuditLog()).profile.id).toBeTruthy();
  });
});

describe('processIntake — Consent', () => {
  it('returned consent has the given scopes', () => {
    const { consent } = processIntake(baseInput, createInMemoryAuditLog());
    expect(consent.scopes).toContain('health_data');
    expect(consent.scopes).toContain('care_plan');
  });

  it('throws InsufficientConsentError when health_data scope is absent', () => {
    const input: IntakeInput = { ...baseInput, consent_scopes: ['notifications'] };
    expect(() => processIntake(input, createInMemoryAuditLog())).toThrow(InsufficientConsentError);
  });

  it('throws InsufficientConsentError when care_plan scope is absent', () => {
    const input: IntakeInput = { ...baseInput, consent_scopes: ['health_data'] };
    expect(() => processIntake(input, createInMemoryAuditLog())).toThrow(InsufficientConsentError);
  });
});

describe('processIntake — Audit log', () => {
  it('appends consent.granted', () => {
    const log = createInMemoryAuditLog();
    processIntake(baseInput, log);
    expect(log.entries().some(e => e.action === 'consent.granted')).toBe(true);
  });

  it('appends health_data.accessed', () => {
    const log = createInMemoryAuditLog();
    processIntake(baseInput, log);
    expect(log.entries().some(e => e.action === 'health_data.accessed')).toBe(true);
  });

  it('consent.granted appears before health_data.accessed', () => {
    const log = createInMemoryAuditLog();
    processIntake(baseInput, log);
    const entries = log.entries();
    const ci = entries.findIndex(e => e.action === 'consent.granted');
    const hi = entries.findIndex(e => e.action === 'health_data.accessed');
    expect(ci).toBeLessThan(hi);
  });
});

describe('processIntake — Red flag', () => {
  it('escalation is null for mild/moderate symptoms', () => {
    expect(processIntake(baseInput, createInMemoryAuditLog()).escalation).toBeNull();
  });

  it('returns EscalationEvent when a symptom is marked', () => {
    const input: IntakeInput = {
      ...baseInput,
      symptoms: [{ symptom: 'mood', severity: 'marked' }],
    };
    const { escalation } = processIntake(input, createInMemoryAuditLog());
    expect(escalation).not.toBeNull();
    expect(escalation?.severity).toBe('high');
  });

  it('appends escalation.created to audit when red flag fires', () => {
    const log = createInMemoryAuditLog();
    const input: IntakeInput = {
      ...baseInput,
      symptoms: [{ symptom: 'mood', severity: 'marked' }],
    };
    processIntake(input, log);
    expect(log.entries().some(e => e.action === 'escalation.created')).toBe(true);
  });

  it('does not append escalation.created when no red flag', () => {
    const log = createInMemoryAuditLog();
    processIntake(baseInput, log);
    expect(log.entries().some(e => e.action === 'escalation.created')).toBe(false);
  });
});

describe('processIntake — not_diagnosed', () => {
  it('not_diagnosed_flagged=true when diagnosed=false', () => {
    const input: IntakeInput = { ...baseInput, diagnosed: false };
    expect(processIntake(input, createInMemoryAuditLog()).not_diagnosed_flagged).toBe(true);
  });
});
```

- [ ] **Step 2: Run — must FAIL**

Run: `npx jest tests/intake/intake-service.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../../src/intake/intake-service'`

- [ ] **Step 3: Create `src/intake/intake-service.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import type {
  MemberId,
  ConditionProfile,
  ConsentRecord,
  ConsentScope,
  EscalationEvent,
} from '../domain/types';
import { asConditionProfileId } from '../domain/types';
import { createConsent, assertConsent, REQUIRED_SCOPES } from '../domain/consent';
import type { AuditLog } from '../domain/audit';
import { checkIntakeRedFlags, type IntakeSymptom } from './red-flag';

export interface IntakeInput {
  readonly member_id: MemberId;
  readonly symptoms: readonly IntakeSymptom[];
  readonly primary_goal: string;
  readonly conditions: readonly string[];
  readonly diagnosed: boolean;
  readonly diagnosis_date: Date | null;
  readonly consent_scopes: readonly ConsentScope[];
  readonly has_free_text: boolean;
}

export interface IntakeResult {
  readonly profile: ConditionProfile;
  readonly consent: ConsentRecord;
  readonly escalation: EscalationEvent | null;
  readonly not_diagnosed_flagged: boolean;
}

export function processIntake(input: IntakeInput, auditLog: AuditLog): IntakeResult {
  const consent = createConsent(input.member_id, input.consent_scopes);
  assertConsent(consent, REQUIRED_SCOPES);

  auditLog.append({
    actor_id: input.member_id,
    action: 'consent.granted',
    subject_id: consent.id,
    subject_type: 'ConsentRecord',
    metadata: { scopes: [...input.consent_scopes] },
  });

  const profile: ConditionProfile = {
    id: asConditionProfileId(randomUUID()),
    member_id: input.member_id,
    symptoms: input.symptoms.map(s => s.symptom),
    primary_goal: input.primary_goal,
    conditions: [...input.conditions],
    diagnosed: input.diagnosed,
    diagnosis_date: input.diagnosis_date,
    free_text_flagged: input.has_free_text,
  };

  auditLog.append({
    actor_id: input.member_id,
    action: 'health_data.accessed',
    subject_id: profile.id,
    subject_type: 'ConditionProfile',
    metadata: { event: 'created' },
  });

  const { escalation, not_diagnosed_flagged } = checkIntakeRedFlags({
    member_id: input.member_id,
    symptoms: input.symptoms,
    not_diagnosed: !input.diagnosed,
  });

  if (escalation !== null) {
    auditLog.append({
      actor_id: 'system',
      action: 'escalation.created',
      subject_id: escalation.id,
      subject_type: 'EscalationEvent',
      metadata: { trigger: escalation.trigger, severity: escalation.severity },
    });
  }

  return { profile, consent, escalation, not_diagnosed_flagged };
}
```

- [ ] **Step 4: Create `src/intake/index.ts`**

```typescript
export * from './red-flag';
export * from './intake-service';
```

- [ ] **Step 5: Run — must PASS**

Run: `npx jest tests/intake/intake-service.test.ts --no-coverage`
Expected: all green

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 7: Commit**

```bash
git add src/intake/intake-service.ts src/intake/index.ts tests/intake/intake-service.test.ts
git commit -m "feat(part1): intake service — ConditionProfile + Consent gate + red-flag orchestration"
```

---

## Task 5: Module selector

**Files:**
- Create: `src/plan-assembly/module-selector.ts`
- Test: `tests/plan-assembly/module-selector.test.ts`

Spec US-1.C2 + seed metadata: "Include a module if `always=true`, OR if ANY trigger in `include_when` matches the member's intake (`symptoms[]`, `primary_goal`, `conditions[]`)." OR semantics across all three axes.

- [ ] **Step 1: Write the failing tests**

Create `tests/plan-assembly/module-selector.test.ts`:

```typescript
import * as path from 'node:path';
import { selectModules } from '../../src/plan-assembly/module-selector';
import { loadModuleLibraryFromFile } from '../../src/module-library/loader';
import type { ValidatedModule } from '../../src/module-library/schema';
import type { ConditionProfile } from '../../src/domain/types';
import { asConditionProfileId, asMemberId } from '../../src/domain/types';

const baseEvidence = {
  claim: 'A claim.',
  rationale: 'A rationale.',
  evidence_level: 'guideline' as const,
  source: 'Test',
  confidence: 'illustrative' as const,
  reviewed_by: null,
  last_reviewed: null,
};

function makeModule(overrides: Partial<ValidatedModule> & { id: string }): ValidatedModule {
  return {
    phase: 1,
    kind: 'self',
    icon: 'icon',
    title: 'Title',
    action: 'Action.',
    cadence: 'Daily',
    goals_served: ['all'],
    always: false,
    this_week: false,
    evidence: baseEvidence,
    ...overrides,
  };
}

const baseProfile: ConditionProfile = {
  id: asConditionProfileId('profile-001'),
  member_id: asMemberId('member-001'),
  symptoms: ['weight', 'irregular_cycle'],
  primary_goal: 'metabolic',
  conditions: ['Insulin resistance'],
  diagnosed: true,
  diagnosis_date: null,
  free_text_flagged: false,
};

describe('selectModules — always=true', () => {
  it('includes always=true modules regardless of include_when', () => {
    const m = makeModule({ id: 'always-mod', always: true });
    expect(selectModules([m], baseProfile)).toContain(m);
  });

  it('includes always=true with no include_when', () => {
    const m = makeModule({ id: 'always-no-when', always: true });
    expect(selectModules([m], baseProfile)).toContain(m);
  });
});

describe('selectModules — always=false, no include_when', () => {
  it('excludes module with always=false and no include_when', () => {
    const m = makeModule({ id: 'no-when', always: false });
    expect(selectModules([m], baseProfile)).not.toContain(m);
  });
});

describe('selectModules — symptom matching', () => {
  it('includes module when profile.symptoms contains a symptom from include_when.symptoms', () => {
    const m = makeModule({ id: 'symptom-match', always: false, include_when: { symptoms: ['weight'] } });
    expect(selectModules([m], baseProfile)).toContain(m);
  });

  it('excludes module when no profile symptom matches', () => {
    const m = makeModule({ id: 'symptom-miss', always: false, include_when: { symptoms: ['skinhair'] } });
    expect(selectModules([m], baseProfile)).not.toContain(m);
  });
});

describe('selectModules — primary_goal matching', () => {
  it('includes module when profile.primary_goal matches include_when.primary_goal', () => {
    const m = makeModule({ id: 'goal-match', always: false, include_when: { primary_goal: ['metabolic'] } });
    expect(selectModules([m], baseProfile)).toContain(m);
  });

  it('excludes module when primary_goal does not match', () => {
    const m = makeModule({ id: 'goal-miss', always: false, include_when: { primary_goal: ['fertility'] } });
    expect(selectModules([m], baseProfile)).not.toContain(m);
  });
});

describe('selectModules — condition matching', () => {
  it('includes module when profile.conditions contains a match', () => {
    const m = makeModule({ id: 'cond-match', always: false, include_when: { conditions: ['Insulin resistance'] } });
    expect(selectModules([m], baseProfile)).toContain(m);
  });

  it('excludes module when profile.conditions has no match', () => {
    const m = makeModule({ id: 'cond-miss', always: false, include_when: { conditions: ['Type-2 diabetes'] } });
    expect(selectModules([m], baseProfile)).not.toContain(m);
  });
});

describe('selectModules — OR semantics across axes', () => {
  it('includes module matching symptoms even when goal axis does not match', () => {
    const m = makeModule({
      id: 'or-test',
      always: false,
      include_when: { symptoms: ['weight'], primary_goal: ['fertility'] },
    });
    expect(selectModules([m], baseProfile)).toContain(m);
  });
});

describe('selectModules — against real seed', () => {
  it('all always=true seed modules are selected for any profile', () => {
    const seedPath = path.join(process.cwd(), 'module-library.seed.json');
    const allModules = loadModuleLibraryFromFile(seedPath);
    const alwaysCount = allModules.filter(m => m.always).length;
    const selected = selectModules(allModules, baseProfile);
    expect(selected.filter(m => m.always)).toHaveLength(alwaysCount);
  });
});
```

- [ ] **Step 2: Run — must FAIL**

Run: `npx jest tests/plan-assembly/module-selector.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../../src/plan-assembly/module-selector'`

- [ ] **Step 3: Create `src/plan-assembly/module-selector.ts`**

```typescript
import type { ConditionProfile } from '../domain/types';
import type { ValidatedModule } from '../module-library/schema';

export function selectModules(
  modules: ValidatedModule[],
  profile: ConditionProfile,
): ValidatedModule[] {
  return modules.filter(m => {
    if (m.always) return true;
    const iw = m.include_when;
    if (iw === undefined) return false;

    const symptomMatch = iw.symptoms?.some(s => profile.symptoms.includes(s)) ?? false;
    const goalMatch = iw.primary_goal?.includes(profile.primary_goal) ?? false;
    const conditionMatch = iw.conditions?.some(c => profile.conditions.includes(c)) ?? false;

    return symptomMatch || goalMatch || conditionMatch;
  });
}
```

- [ ] **Step 4: Run — must PASS**

Run: `npx jest tests/plan-assembly/module-selector.test.ts --no-coverage`
Expected: all green

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 6: Commit**

```bash
git add src/plan-assembly/module-selector.ts tests/plan-assembly/module-selector.test.ts
git commit -m "feat(part1): module selector — always/include_when OR rules engine"
```

---

## Task 6: Plan assembler

**Files:**
- Create: `src/plan-assembly/assembler.ts`
- Create: `src/plan-assembly/index.ts`
- Test: `tests/plan-assembly/assembler.test.ts`

Spec US-1.C2: maps selected modules → `CarePlan(status=draft, version=1)` + `Recommendation[]→Evidence`. Invariant: every rec must pass `assertRecommendationHasEvidence` before joining the plan (blocks any incomplete evidence). Recommendations sorted by phase (1→2→3). Audit-logs `care_plan.created`.

- [ ] **Step 1: Write the failing tests**

Create `tests/plan-assembly/assembler.test.ts`:

```typescript
import * as path from 'node:path';
import { assemblePlan, type AssemblyInput } from '../../src/plan-assembly/assembler';
import { loadModuleLibraryFromFile } from '../../src/module-library/loader';
import { createInMemoryAuditLog } from '../../src/domain/audit';
import { IncompleteEvidenceError } from '../../src/domain/evidence';
import type { ValidatedModule } from '../../src/module-library/schema';
import type { Member, ConditionProfile } from '../../src/domain/types';
import { asConditionProfileId, asMemberId } from '../../src/domain/types';

const memberId = asMemberId('member-001');
const member: Member = { id: memberId, email: 'priya@example.com', created_at: new Date('2026-01-01') };
const profile: ConditionProfile = {
  id: asConditionProfileId('profile-001'),
  member_id: memberId,
  symptoms: ['weight'],
  primary_goal: 'metabolic',
  conditions: [],
  diagnosed: true,
  diagnosis_date: null,
  free_text_flagged: false,
};
const input: AssemblyInput = { member, profile };

const validEvidence = {
  claim: 'A claim.',
  rationale: 'A rationale.',
  evidence_level: 'guideline' as const,
  source: 'Source',
  confidence: 'illustrative' as const,
  reviewed_by: null,
  last_reviewed: null,
};

function makeModule(id: string, phase: 1 | 2 | 3 = 1, always = true): ValidatedModule {
  return {
    id, phase, kind: 'self', icon: 'icon',
    title: `Module ${id}`, action: 'Do it.', cadence: 'Daily',
    goals_served: ['all'], always, this_week: false, evidence: validEvidence,
  };
}

const twoModules = [makeModule('mod-a', 1), makeModule('mod-b', 2)];

describe('assemblePlan — CarePlan shape', () => {
  it('status is draft', () => {
    expect(assemblePlan(input, twoModules, createInMemoryAuditLog()).carePlan.status).toBe('draft');
  });

  it('version is 1', () => {
    expect(assemblePlan(input, twoModules, createInMemoryAuditLog()).carePlan.version).toBe(1);
  });

  it('phase is 1', () => {
    expect(assemblePlan(input, twoModules, createInMemoryAuditLog()).carePlan.phase).toBe(1);
  });

  it('member_id matches input', () => {
    expect(assemblePlan(input, twoModules, createInMemoryAuditLog()).carePlan.member_id).toBe(memberId);
  });

  it('approver_id is null', () => {
    expect(assemblePlan(input, twoModules, createInMemoryAuditLog()).carePlan.approver_id).toBeNull();
  });

  it('id is a non-empty string', () => {
    expect(assemblePlan(input, twoModules, createInMemoryAuditLog()).carePlan.id).toBeTruthy();
  });
});

describe('assemblePlan — Recommendations', () => {
  it('creates one Recommendation per selected module', () => {
    const { carePlan } = assemblePlan(input, twoModules, createInMemoryAuditLog());
    expect(carePlan.recommendations).toHaveLength(2);
  });

  it('Recommendation.module_id matches source module', () => {
    const { carePlan } = assemblePlan(input, [makeModule('mod-x')], createInMemoryAuditLog());
    expect(carePlan.recommendations[0]?.module_id).toBe('mod-x');
  });

  it('Recommendation copies title, action, cadence from module', () => {
    const mod = makeModule('mod-y');
    const { carePlan } = assemblePlan(input, [mod], createInMemoryAuditLog());
    const rec = carePlan.recommendations[0]!;
    expect(rec.title).toBe(mod.title);
    expect(rec.action).toBe(mod.action);
    expect(rec.cadence).toBe(mod.cadence);
  });

  it('Recommendation.evidence comes from the module', () => {
    const { carePlan } = assemblePlan(input, [makeModule('mod-z')], createInMemoryAuditLog());
    expect(carePlan.recommendations[0]?.evidence.evidence_level).toBe('guideline');
  });

  it('recommendations are sorted by phase ascending', () => {
    const modules = [makeModule('p3', 3), makeModule('p1', 1), makeModule('p2', 2)];
    const { carePlan } = assemblePlan(input, modules, createInMemoryAuditLog());
    expect(carePlan.recommendations.map(r => r.phase)).toEqual([1, 2, 3]);
  });
});

describe('assemblePlan — excluded_module_ids', () => {
  it('excluded_module_ids is empty when all modules are always=true', () => {
    expect(assemblePlan(input, twoModules, createInMemoryAuditLog()).excluded_module_ids).toHaveLength(0);
  });

  it('excluded_module_ids contains non-selected module ids', () => {
    const nonMatch = makeModule('no-match', 1, false); // always=false, no include_when → excluded
    const { excluded_module_ids } = assemblePlan(input, [...twoModules, nonMatch], createInMemoryAuditLog());
    expect(excluded_module_ids).toContain('no-match');
  });
});

describe('assemblePlan — Evidence contract', () => {
  it('throws IncompleteEvidenceError when a module has empty claim', () => {
    const badModule: ValidatedModule = { ...makeModule('bad'), evidence: { ...validEvidence, claim: '' } };
    expect(() => assemblePlan(input, [badModule], createInMemoryAuditLog())).toThrow(IncompleteEvidenceError);
  });
});

describe('assemblePlan — Audit log', () => {
  it('appends care_plan.created', () => {
    const log = createInMemoryAuditLog();
    assemblePlan(input, twoModules, log);
    expect(log.entries().some(e => e.action === 'care_plan.created')).toBe(true);
  });

  it('care_plan.created metadata.member_id matches input', () => {
    const log = createInMemoryAuditLog();
    assemblePlan(input, twoModules, log);
    const entry = log.entries().find(e => e.action === 'care_plan.created')!;
    expect(entry.metadata['member_id']).toBe(memberId);
  });
});

describe('assemblePlan — with real seed', () => {
  it('assembles a draft plan from the full seed without throwing', () => {
    const modules = loadModuleLibraryFromFile(path.join(process.cwd(), 'module-library.seed.json'));
    const { carePlan } = assemblePlan(input, modules, createInMemoryAuditLog());
    expect(carePlan.status).toBe('draft');
    expect(carePlan.recommendations.length).toBeGreaterThan(0);
  });

  it('all recommendations in the seed-backed plan have non-empty evidence', () => {
    const modules = loadModuleLibraryFromFile(path.join(process.cwd(), 'module-library.seed.json'));
    const { carePlan } = assemblePlan(input, modules, createInMemoryAuditLog());
    carePlan.recommendations.forEach(rec => {
      expect(rec.evidence.claim.length).toBeGreaterThan(0);
      expect(rec.evidence.source.length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Run — must FAIL**

Run: `npx jest tests/plan-assembly/assembler.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../../src/plan-assembly/assembler'`

- [ ] **Step 3: Create `src/plan-assembly/assembler.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import type { CarePlan, Member, ConditionProfile, Recommendation } from '../domain/types';
import { asCarePlanId, asRecommendationId } from '../domain/types';
import { assertRecommendationHasEvidence } from '../domain/evidence';
import type { AuditLog } from '../domain/audit';
import type { ValidatedModule } from '../module-library/schema';
import { selectModules } from './module-selector';

export interface AssemblyInput {
  readonly member: Member;
  readonly profile: ConditionProfile;
}

export interface AssemblyResult {
  readonly carePlan: CarePlan;
  readonly excluded_module_ids: readonly string[];
}

export function assemblePlan(
  input: AssemblyInput,
  allModules: ValidatedModule[],
  auditLog: AuditLog,
): AssemblyResult {
  const selected = selectModules(allModules, input.profile);
  const selectedIds = new Set(selected.map(m => m.id));
  const excluded = allModules.filter(m => !selectedIds.has(m.id)).map(m => m.id);

  const sorted = [...selected].sort((a, b) => a.phase - b.phase);

  const recommendations: Recommendation[] = sorted.map(m => {
    const rec: Recommendation = {
      id: asRecommendationId(randomUUID()),
      module_id: m.id,
      title: m.title,
      action: m.action,
      cadence: m.cadence,
      phase: m.phase,
      evidence: m.evidence,
    };
    assertRecommendationHasEvidence(rec);
    return rec;
  });

  const now = new Date();
  const carePlan: CarePlan = {
    id: asCarePlanId(randomUUID()),
    member_id: input.member.id,
    version: 1,
    status: 'draft',
    approver_id: null,
    approved_at: null,
    rejection_reason: null,
    phase: 1,
    recommendations,
    created_at: now,
    updated_at: now,
  };

  auditLog.append({
    actor_id: 'system',
    action: 'care_plan.created',
    subject_id: carePlan.id,
    subject_type: 'CarePlan',
    metadata: {
      member_id: input.member.id,
      recommendation_count: recommendations.length,
      excluded_count: excluded.length,
    },
  });

  return { carePlan, excluded_module_ids: excluded };
}
```

- [ ] **Step 4: Create `src/plan-assembly/index.ts`**

```typescript
export * from './module-selector';
export * from './assembler';
```

- [ ] **Step 5: Run — must PASS**

Run: `npx jest tests/plan-assembly/assembler.test.ts --no-coverage`
Expected: all green

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 7: Commit**

```bash
git add src/plan-assembly/assembler.ts src/plan-assembly/index.ts tests/plan-assembly/assembler.test.ts
git commit -m "feat(part1): plan assembler — modules → CarePlan(draft) + Recommendations + Evidence guard"
```

---

## Task 7: Barrel exports + full suite

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace `src/index.ts` with**

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
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected:
```
Test Suites: 8 passed, 8 total
Tests:       XX passed, XX total
Snapshots:   0 total
Failures:    0
```

If any test fails, fix before proceeding.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(part1): barrel export — Part 1 Spine C + Intake complete"
```

- [ ] **Step 5: Print git log**

Run: `git log --oneline`

Expected (newest first):
```
<sha>  feat(part1): barrel export — Part 1 Spine C + Intake complete
<sha>  feat(part1): plan assembler — modules → CarePlan(draft) + Recommendations + Evidence guard
<sha>  feat(part1): module selector — always/include_when OR rules engine
<sha>  feat(part1): intake service — ConditionProfile + Consent gate + red-flag orchestration
<sha>  feat(part1): intake red-flag rules — marked severity → EscalationEvent(high)
<sha>  feat(part1): ModuleLibrary loader — loadFromJson/File + InvalidModuleLibraryError + tests
<sha>  feat(part1): ModuleLibrary schema types + toEvidence/toValidatedModule + asConditionProfileId
```

---

## Self-review

### Spec coverage

| Spec requirement | Task |
|---|---|
| US-1.C1 — writes ConditionProfile | Task 4 `intake-service.ts` |
| US-1.C1 — consent recorded before health data | Task 4: `assertConsent` runs first, audit fires before profile written |
| US-1.C1 — red-flag fires on marked severity | Task 3 `red-flag.ts` |
| US-1.C1 — free-text flagged for human, not fed to assembly | `has_free_text → free_text_flagged` in Task 4; assembler reads ConditionProfile.symptoms only |
| US-1.C1 — not-diagnosed flagged | `not_diagnosed_flagged` in Tasks 3 + 4 |
| US-1.C2 — ModuleLibrary schema | Task 1 `schema.ts` |
| US-1.C2 — rules engine selects/excludes modules | Task 5 `module-selector.ts` |
| US-1.C2 — output = CarePlan(draft) + Recommendation[]→Evidence | Task 6 `assembler.ts` |
| US-1.C2 — 100% of recs have Evidence | `assertRecommendationHasEvidence` called per rec in Task 6 |
| US-1.C2 — library-constrained (AI never invents) | assembler only maps from `allModules` passed in |
| 0.3 — CarePlan enters draft on creation | `status: 'draft'` in Task 6 |
| 0.5 — audit: consent.granted | Task 4 |
| 0.5 — audit: health_data.accessed | Task 4 |
| 0.5 — audit: escalation.created | Task 4 |
| 0.3 — audit: care_plan.created | Task 6 |

**Intentional gap:** US-1.C2 says "AI sequences into a 90-day phased plan and phrases rationale." The assembler sorts by phase deterministically; AI rationale personalisation is a thin wrapper that slots above `assemblePlan` in a later part. The contract (CarePlan draft) is correct now.

### Placeholder scan

No TBDs, no "implement later," no steps without code. Every test file has actual assertions; every implementation file has actual code.

### Type consistency

- `IntakeSymptom` defined in `red-flag.ts`, imported by `intake-service.ts` — consistent.
- `asConditionProfileId` added to `types.ts` in Task 1 Step 3, used in `intake-service.ts` Task 4 Step 3 — consistent.
- `ValidatedModule` defined in `schema.ts`, used identically in `loader.ts`, `module-selector.ts`, `assembler.ts` — consistent.
- `AssemblyInput` uses `Member` and `ConditionProfile` from `domain/types.ts` — consistent across Task 6 impl and tests.
- `selectModules(ValidatedModule[], ConditionProfile)` signature in Task 5 matches call in Task 6 assembler — consistent.
- `assertRecommendationHasEvidence(rec: Recommendation)` imported from `domain/evidence.ts` — consistent with Part 0.
- `metadata['member_id']` access in assembler test uses bracket notation to satisfy `noUncheckedIndexedAccess` — consistent with tsconfig.
