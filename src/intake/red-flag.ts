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
