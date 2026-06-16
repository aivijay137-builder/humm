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
    checkIns.reduce((sum, c) => sum + severityToNumber(c.top_symptom_severity), 0) / checkIns.length;

  const avgMood =
    checkIns.reduce((sum, c) => sum + (c.mood[0] + c.mood[1]) / 2, 0) / checkIns.length;

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
      id: randomUUID(), member_id: memberId, metric: 'milestone', value: '4_week_streak', ts: now,
    });
  }

  if (checkIns.length >= 2) {
    const sorted = [...checkIns].sort((a, b) => a.week - b.week);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    if (severityToNumber(last.top_symptom_severity) < severityToNumber(first.top_symptom_severity)) {
      milestones.push({
        id: randomUUID(), member_id: memberId, metric: 'milestone', value: 'symptom_improved', ts: now,
      });
    }
  }

  return milestones;
}
