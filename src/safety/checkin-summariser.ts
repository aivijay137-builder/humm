import { CheckIn, EscalationEvent, MemberId } from '../domain/types';

export type CheckInSeverityLevel = 'none' | 'low' | 'medium' | 'high';

export interface CheckInSummary {
  readonly check_in_id: string;
  readonly member_id: MemberId;
  readonly week: number;
  readonly severity_level: CheckInSeverityLevel;
  readonly flags: readonly string[];
  readonly has_escalation: boolean;
  readonly generated_at: Date;
}

export function summariseCheckIn(
  checkIn: CheckIn,
  escalations: readonly EscalationEvent[],
): CheckInSummary {
  const flags: string[] = [];

  // mild severity is subclinical — no flag warranted
  if (checkIn.top_symptom_severity === 'marked') {
    flags.push('marked_symptom');
  } else if (checkIn.top_symptom_severity === 'moderate') {
    flags.push('moderate_symptom');
  }

  const avgMood = (checkIn.mood[0] + checkIn.mood[1]) / 2;
  if (avgMood <= 2.0) flags.push('low_mood');

  if (!checkIn.meds_taken) flags.push('lapsed_meds');

  const has_escalation = escalations.length > 0;

  let severity_level: CheckInSeverityLevel = 'none';
  if (escalations.some(e => e.severity === 'high')) {
    severity_level = 'high';
  } else if (escalations.some(e => e.severity === 'medium')) {
    severity_level = 'medium';
  } else if (escalations.length > 0 || flags.length > 0) {
    severity_level = 'low';
  }

  return {
    check_in_id: checkIn.id,
    member_id: checkIn.member_id,
    week: checkIn.week,
    severity_level,
    flags: [...flags],
    has_escalation,
    generated_at: new Date(),
  };
}
