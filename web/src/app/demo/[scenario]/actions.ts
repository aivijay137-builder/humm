'use server';

import { randomUUID } from 'node:crypto';
import { checkCheckInRedFlags } from '@humm/safety/checkin-red-flag';
import { summariseCheckIn } from '@humm/safety/checkin-summariser';
import { type SymptomSeverity } from '@humm/domain/types';
import { SCENARIOS } from '@/lib/scenarios';

export interface CheckInResult {
  escalations: number;
  severity_level: string;
  flags: readonly string[];
}

export async function handleCheckIn(formData: FormData): Promise<CheckInResult | null> {
  const scenarioId = formData.get('scenario') as string | null;
  if (!scenarioId) return null;
  const scenario = SCENARIOS[scenarioId];
  if (!scenario) return null;

  const mood1 = Math.min(5, Math.max(1, Number(formData.get('mood1') ?? 3)));
  const mood2 = Math.min(5, Math.max(1, Number(formData.get('mood2') ?? 3)));
  const severityRaw = formData.get('severity') as string | null;
  const severity: SymptomSeverity | null =
    severityRaw === 'mild' || severityRaw === 'moderate' || severityRaw === 'marked'
      ? severityRaw
      : null;
  const medsTaken = formData.get('meds') === 'on';

  const checkIn = {
    id: randomUUID(),
    member_id: scenario.member.id,
    week: scenario.currentWeek,
    cycle_date: null,
    top_symptom_severity: severity,
    meds_taken: medsTaken,
    lifestyle_chips: [] as string[],
    mood: [mood1, mood2] as [number, number],
    created_at: new Date(),
  } as const;

  const previousCheckIn = scenario.checkIns.at(0) ?? null;

  const { escalations } = checkCheckInRedFlags({
    member_id: scenario.member.id,
    checkIn,
    previousCheckIn,
  });

  const summary = summariseCheckIn(checkIn, escalations);

  return {
    escalations: escalations.length,
    severity_level: summary.severity_level,
    flags: summary.flags,
  };
}
