import { randomUUID } from 'node:crypto';
import type { CheckIn, MemberId, SymptomSeverity } from '../domain/types';

export interface CheckInInput {
  readonly member_id: MemberId;
  readonly week: number;
  readonly cycle_date: Date | null;
  readonly top_symptom_severity: SymptomSeverity | null;
  readonly meds_taken: boolean;
  readonly lifestyle_chips: readonly string[];
  readonly mood: readonly [number, number];
}

export class InvalidMoodError extends Error {
  constructor(value: number) {
    super(`Mood values must be between 1 and 5, got: ${value}`);
    this.name = 'InvalidMoodError';
  }
}

export function createCheckIn(input: CheckInInput): CheckIn {
  for (const m of input.mood) {
    if (m < 1 || m > 5) throw new InvalidMoodError(m);
  }
  return {
    id: randomUUID(),
    member_id: input.member_id,
    week: input.week,
    cycle_date: input.cycle_date,
    top_symptom_severity: input.top_symptom_severity,
    meds_taken: input.meds_taken,
    lifestyle_chips: [...input.lifestyle_chips],
    mood: input.mood,
    created_at: new Date(),
  };
}
