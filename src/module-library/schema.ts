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
