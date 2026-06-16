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
    // assemblePlan requires mutable array; spread prevents mutation of input
    [...allModules],
    auditLog,
  );

  const newDraft: CarePlan = { ...basePlan, version: existingPlan.version + 1, status: 'draft' };

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
