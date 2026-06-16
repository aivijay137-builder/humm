import { CarePlan, CheckIn, EscalationEvent, MemberId, Outcome } from '../domain/types';

export type AttentionCategory = 'escalation' | 'lapse' | 'milestone' | 'plan_due';

export interface AttentionQueueInput {
  readonly member_id: MemberId;
  readonly openEscalations: readonly EscalationEvent[];
  readonly checkIns: readonly CheckIn[];
  readonly carePlan: CarePlan | null;
  readonly currentWeek: number;
  readonly milestones: readonly Outcome[];
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

function categorize(input: AttentionQueueInput, lastCheckIn: CheckIn | null): AttentionCategory | null {
  if (input.openEscalations.length > 0) return 'escalation';
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
    const lastCheckIn = getLastCheckIn(member.checkIns);
    const category = categorize(member, lastCheckIn);
    if (category === null) continue;

    entries.push({
      member_id: member.member_id,
      category,
      priority: categoryPriority(category),
      openEscalation: getOldestEscalation(member.openEscalations),
      lastCheckIn,
      carePlan: member.carePlan,
    });
  }

  return entries.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.category === 'escalation' && b.category === 'escalation') {
      const aTs = a.openEscalation!.created_at.getTime();
      const bTs = b.openEscalation!.created_at.getTime();
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
