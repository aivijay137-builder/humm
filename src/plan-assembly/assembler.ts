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
