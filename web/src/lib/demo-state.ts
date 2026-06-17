import { assemblePlan } from '@humm/plan-assembly/assembler';
import { createInMemoryAuditLog } from '@humm/domain/audit';
import {
  buildAttentionQueue,
  type AttentionQueueInput,
} from '@humm/coordinator/attention-queue';
import { evaluateReplanningTrigger } from '@humm/replanning/trigger';
import { allModules } from './modules';
import { SCENARIOS } from './scenarios';

const auditLog = createInMemoryAuditLog();

const mayaPlan = assemblePlan(
  { member: SCENARIOS.maya!.member, profile: SCENARIOS.maya!.profile },
  [...allModules],
  auditLog,
);
const aishaPlan = assemblePlan(
  { member: SCENARIOS.aisha!.member, profile: SCENARIOS.aisha!.profile },
  [...allModules],
  auditLog,
);
const priyaPlan = assemblePlan(
  { member: SCENARIOS.priya!.member, profile: SCENARIOS.priya!.profile },
  [...allModules],
  auditLog,
);

export const assembledPlans = {
  maya: mayaPlan,
  aisha: aishaPlan,
  priya: priyaPlan,
} as const;

export const iconByModuleId: Record<string, string> = Object.fromEntries(
  allModules.map(m => [m.id, m.icon]),
);

const queueInputs: AttentionQueueInput[] = [
  {
    member_id: SCENARIOS.maya!.member.id,
    openEscalations: SCENARIOS.maya!.escalations,
    checkIns: SCENARIOS.maya!.checkIns,
    carePlan: mayaPlan.carePlan,
    currentWeek: SCENARIOS.maya!.currentWeek,
    milestones: SCENARIOS.maya!.milestones,
  },
  {
    member_id: SCENARIOS.aisha!.member.id,
    openEscalations: SCENARIOS.aisha!.escalations,
    checkIns: SCENARIOS.aisha!.checkIns,
    carePlan: aishaPlan.carePlan,
    currentWeek: SCENARIOS.aisha!.currentWeek,
    milestones: SCENARIOS.aisha!.milestones,
  },
  {
    member_id: SCENARIOS.priya!.member.id,
    openEscalations: SCENARIOS.priya!.escalations,
    checkIns: SCENARIOS.priya!.checkIns,
    carePlan: priyaPlan.carePlan,
    currentWeek: SCENARIOS.priya!.currentWeek,
    milestones: SCENARIOS.priya!.milestones,
  },
];

export const attentionQueue = buildAttentionQueue(queueInputs);

export const replanningTrigger = evaluateReplanningTrigger({
  member_id: SCENARIOS.priya!.member.id,
  care_plan_id: priyaPlan.carePlan.id,
  currentWeek: SCENARIOS.priya!.currentWeek,
  milestones: SCENARIOS.priya!.milestones,
  lastCheckIn: SCENARIOS.priya!.checkIns.at(0) ?? null,
  existingTriggers: [],
});
