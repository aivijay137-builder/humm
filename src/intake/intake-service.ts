import { randomUUID } from 'node:crypto';
import type {
  MemberId,
  ConditionProfile,
  ConsentRecord,
  ConsentScope,
  EscalationEvent,
} from '../domain/types';
import { asConditionProfileId } from '../domain/types';
import { createConsent, assertConsent, REQUIRED_SCOPES } from '../domain/consent';
import type { AuditLog } from '../domain/audit';
import { checkIntakeRedFlags, type IntakeSymptom } from './red-flag';

export interface IntakeInput {
  readonly member_id: MemberId;
  readonly symptoms: readonly IntakeSymptom[];
  readonly primary_goal: string;
  readonly conditions: readonly string[];
  readonly diagnosed: boolean;
  readonly diagnosis_date: Date | null;
  readonly consent_scopes: readonly ConsentScope[];
  readonly has_free_text: boolean;
}

export interface IntakeResult {
  readonly profile: ConditionProfile;
  readonly consent: ConsentRecord;
  readonly escalation: EscalationEvent | null;
  readonly not_diagnosed_flagged: boolean;
}

export function processIntake(input: IntakeInput, auditLog: AuditLog): IntakeResult {
  const consent = createConsent(input.member_id, input.consent_scopes);
  assertConsent(consent, REQUIRED_SCOPES);

  auditLog.append({
    actor_id: input.member_id,
    action: 'consent.granted',
    subject_id: consent.id,
    subject_type: 'ConsentRecord',
    metadata: { scopes: [...input.consent_scopes] },
  });

  const profile: ConditionProfile = {
    id: asConditionProfileId(randomUUID()),
    member_id: input.member_id,
    symptoms: input.symptoms.map(s => s.symptom),
    primary_goal: input.primary_goal,
    conditions: [...input.conditions],
    diagnosed: input.diagnosed,
    diagnosis_date: input.diagnosis_date,
    free_text_flagged: input.has_free_text,
  };

  auditLog.append({
    actor_id: input.member_id,
    action: 'health_data.accessed',
    subject_id: profile.id,
    subject_type: 'ConditionProfile',
    metadata: { event: 'created' },
  });

  const { escalation, not_diagnosed_flagged } = checkIntakeRedFlags({
    member_id: input.member_id,
    symptoms: input.symptoms,
    not_diagnosed: !input.diagnosed,
  });

  if (escalation !== null) {
    auditLog.append({
      actor_id: 'system',
      action: 'escalation.created',
      subject_id: escalation.id,
      subject_type: 'EscalationEvent',
      metadata: { trigger: escalation.trigger, severity: escalation.severity },
    });
  }

  return { profile, consent, escalation, not_diagnosed_flagged };
}
