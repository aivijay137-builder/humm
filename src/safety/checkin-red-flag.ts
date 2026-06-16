import { randomUUID } from 'node:crypto';
import { CheckIn, EscalationEvent, MemberId, SymptomSeverity } from '../domain/types';

export interface CheckInRedFlagInput {
  readonly member_id: MemberId;
  readonly checkIn: CheckIn;
  readonly previousCheckIn: CheckIn | null;
}

export interface CheckInRedFlagResult {
  readonly escalations: readonly EscalationEvent[];
}

function severityToNumber(s: SymptomSeverity | null): number {
  if (s === null) return 0;
  if (s === 'mild') return 1;
  if (s === 'moderate') return 2;
  return 3;
}

export function checkCheckInRedFlags(input: CheckInRedFlagInput): CheckInRedFlagResult {
  const escalations: EscalationEvent[] = [];
  const { checkIn, member_id, previousCheckIn } = input;
  const now = new Date();

  if (checkIn.top_symptom_severity === 'marked') {
    escalations.push({
      id: randomUUID(),
      member_id,
      trigger: 'marked symptom severity on check-in',
      severity: 'high',
      status: 'open',
      created_at: now,
      acknowledged_at: null,
    });
  }

  const avgMood = (checkIn.mood[0] + checkIn.mood[1]) / 2;
  if (avgMood <= 2.0) {
    escalations.push({
      id: randomUUID(),
      member_id,
      trigger: `low mood score on check-in: ${avgMood}`,
      severity: 'medium',
      status: 'open',
      created_at: now,
      acknowledged_at: null,
    });
  }

  if (previousCheckIn !== null) {
    const prevSev = severityToNumber(previousCheckIn.top_symptom_severity);
    const currSev = severityToNumber(checkIn.top_symptom_severity);
    if (currSev - prevSev >= 2) {
      escalations.push({
        id: randomUUID(),
        member_id,
        trigger: `sharp symptom change on check-in: ${previousCheckIn.top_symptom_severity ?? 'none'} -> ${checkIn.top_symptom_severity ?? 'none'}`,
        severity: 'medium',
        status: 'open',
        created_at: now,
        acknowledged_at: null,
      });
    }
  }

  return { escalations };
}
