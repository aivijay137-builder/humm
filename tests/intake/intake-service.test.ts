import { processIntake, type IntakeInput } from '../../src/intake/intake-service';
import { createInMemoryAuditLog } from '../../src/domain/audit';
import { InsufficientConsentError } from '../../src/domain/consent';
import { asMemberId } from '../../src/domain/types';

const memberId = asMemberId('member-001');

const baseInput: IntakeInput = {
  member_id: memberId,
  symptoms: [
    { symptom: 'irregular_cycle', severity: 'mild' },
    { symptom: 'weight', severity: 'moderate' },
  ],
  primary_goal: 'cycle',
  conditions: [],
  diagnosed: true,
  diagnosis_date: null,
  consent_scopes: ['health_data', 'care_plan'],
  has_free_text: false,
};

describe('processIntake — ConditionProfile', () => {
  it('profile.member_id matches input', () => {
    const { profile } = processIntake(baseInput, createInMemoryAuditLog());
    expect(profile.member_id).toBe(memberId);
  });

  it('profile.symptoms contains symptom names only (not severities)', () => {
    const { profile } = processIntake(baseInput, createInMemoryAuditLog());
    expect(profile.symptoms).toEqual(['irregular_cycle', 'weight']);
  });

  it('profile.primary_goal set correctly', () => {
    const { profile } = processIntake(baseInput, createInMemoryAuditLog());
    expect(profile.primary_goal).toBe('cycle');
  });

  it('profile.conditions set correctly', () => {
    const input: IntakeInput = { ...baseInput, conditions: ['Insulin resistance'] };
    const { profile } = processIntake(input, createInMemoryAuditLog());
    expect(profile.conditions).toEqual(['Insulin resistance']);
  });

  it('profile.diagnosed reflects input', () => {
    const { profile } = processIntake(baseInput, createInMemoryAuditLog());
    expect(profile.diagnosed).toBe(true);
  });

  it('profile.free_text_flagged=true when has_free_text=true', () => {
    const input: IntakeInput = { ...baseInput, has_free_text: true };
    expect(processIntake(input, createInMemoryAuditLog()).profile.free_text_flagged).toBe(true);
  });

  it('profile.free_text_flagged=false when has_free_text=false', () => {
    expect(processIntake(baseInput, createInMemoryAuditLog()).profile.free_text_flagged).toBe(false);
  });

  it('profile.id is a non-empty string', () => {
    expect(processIntake(baseInput, createInMemoryAuditLog()).profile.id).toBeTruthy();
  });
});

describe('processIntake — Consent', () => {
  it('returned consent has the given scopes', () => {
    const { consent } = processIntake(baseInput, createInMemoryAuditLog());
    expect(consent.scopes).toContain('health_data');
    expect(consent.scopes).toContain('care_plan');
  });

  it('throws InsufficientConsentError when health_data scope is absent', () => {
    const input: IntakeInput = { ...baseInput, consent_scopes: ['notifications'] };
    expect(() => processIntake(input, createInMemoryAuditLog())).toThrow(InsufficientConsentError);
  });

  it('throws InsufficientConsentError when care_plan scope is absent', () => {
    const input: IntakeInput = { ...baseInput, consent_scopes: ['health_data'] };
    expect(() => processIntake(input, createInMemoryAuditLog())).toThrow(InsufficientConsentError);
  });
});

describe('processIntake — Audit log', () => {
  it('appends consent.granted', () => {
    const log = createInMemoryAuditLog();
    processIntake(baseInput, log);
    expect(log.entries().some(e => e.action === 'consent.granted')).toBe(true);
  });

  it('appends health_data.accessed', () => {
    const log = createInMemoryAuditLog();
    processIntake(baseInput, log);
    expect(log.entries().some(e => e.action === 'health_data.accessed')).toBe(true);
  });

  it('consent.granted appears before health_data.accessed', () => {
    const log = createInMemoryAuditLog();
    processIntake(baseInput, log);
    const entries = log.entries();
    const ci = entries.findIndex(e => e.action === 'consent.granted');
    const hi = entries.findIndex(e => e.action === 'health_data.accessed');
    expect(ci).toBeLessThan(hi);
  });
});

describe('processIntake — Red flag', () => {
  it('escalation is null for mild/moderate symptoms', () => {
    expect(processIntake(baseInput, createInMemoryAuditLog()).escalation).toBeNull();
  });

  it('returns EscalationEvent when a symptom is marked', () => {
    const input: IntakeInput = {
      ...baseInput,
      symptoms: [{ symptom: 'mood', severity: 'marked' }],
    };
    const { escalation } = processIntake(input, createInMemoryAuditLog());
    expect(escalation).not.toBeNull();
    expect(escalation?.severity).toBe('high');
  });

  it('appends escalation.created to audit when red flag fires', () => {
    const log = createInMemoryAuditLog();
    const input: IntakeInput = {
      ...baseInput,
      symptoms: [{ symptom: 'mood', severity: 'marked' }],
    };
    processIntake(input, log);
    expect(log.entries().some(e => e.action === 'escalation.created')).toBe(true);
  });

  it('does not append escalation.created when no red flag', () => {
    const log = createInMemoryAuditLog();
    processIntake(baseInput, log);
    expect(log.entries().some(e => e.action === 'escalation.created')).toBe(false);
  });
});

describe('processIntake — not_diagnosed', () => {
  it('not_diagnosed_flagged=true when diagnosed=false', () => {
    const input: IntakeInput = { ...baseInput, diagnosed: false };
    expect(processIntake(input, createInMemoryAuditLog()).not_diagnosed_flagged).toBe(true);
  });
});
