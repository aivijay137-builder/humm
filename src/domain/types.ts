// ─── Scalar IDs ──────────────────────────────────────────────────────────────
export type MemberId = string & { readonly _brand: 'MemberId' };
export type CarePlanId = string & { readonly _brand: 'CarePlanId' };
export type RecommendationId = string & { readonly _brand: 'RecommendationId' };
export type ConditionProfileId = string & { readonly _brand: 'ConditionProfileId' };

export function asMemberId(s: string): MemberId { return s as MemberId; }
export function asCarePlanId(s: string): CarePlanId { return s as CarePlanId; }
export function asRecommendationId(s: string): RecommendationId { return s as RecommendationId; }
export function asConditionProfileId(s: string): ConditionProfileId { return s as ConditionProfileId; }

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
  | 'escalation_ack'
  | 'coordinator_message'
  | 'plan_updated';

export interface Notification {
  readonly id: string;
  readonly recipient_id: string;
  readonly recipient_type: NotificationRecipientType;
  readonly type: NotificationType;
  readonly ts: Date;
  readonly read_at: Date | null;
}
