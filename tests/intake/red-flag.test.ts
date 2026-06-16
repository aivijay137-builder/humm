import { checkIntakeRedFlags, type IntakeRedFlagInput } from '../../src/intake/red-flag';
import { asMemberId } from '../../src/domain/types';

const memberId = asMemberId('member-001');

const mildInput: IntakeRedFlagInput = {
  member_id: memberId,
  symptoms: [
    { symptom: 'irregular_cycle', severity: 'mild' },
    { symptom: 'weight', severity: 'moderate' },
  ],
  not_diagnosed: false,
};

describe('checkIntakeRedFlags — no red flag', () => {
  it('returns null escalation when all symptoms are mild or moderate', () => {
    expect(checkIntakeRedFlags(mildInput).escalation).toBeNull();
  });

  it('returns not_diagnosed_flagged=false when diagnosed', () => {
    expect(checkIntakeRedFlags(mildInput).not_diagnosed_flagged).toBe(false);
  });

  it('empty symptoms array produces no escalation', () => {
    const input: IntakeRedFlagInput = { ...mildInput, symptoms: [] };
    expect(checkIntakeRedFlags(input).escalation).toBeNull();
  });
});

describe('checkIntakeRedFlags — marked severity', () => {
  const markedInput: IntakeRedFlagInput = {
    ...mildInput,
    symptoms: [{ symptom: 'mood', severity: 'marked' }],
  };

  it('creates an EscalationEvent when any symptom is marked', () => {
    expect(checkIntakeRedFlags(markedInput).escalation).not.toBeNull();
  });

  it('escalation severity is high', () => {
    expect(checkIntakeRedFlags(markedInput).escalation?.severity).toBe('high');
  });

  it('escalation status is open', () => {
    expect(checkIntakeRedFlags(markedInput).escalation?.status).toBe('open');
  });

  it('escalation trigger names the marked symptom', () => {
    expect(checkIntakeRedFlags(markedInput).escalation?.trigger).toContain('mood');
  });

  it('escalation trigger names all marked symptoms when multiple', () => {
    const input: IntakeRedFlagInput = {
      ...mildInput,
      symptoms: [
        { symptom: 'mood', severity: 'marked' },
        { symptom: 'pain', severity: 'marked' },
        { symptom: 'weight', severity: 'mild' },
      ],
    };
    const { escalation } = checkIntakeRedFlags(input);
    expect(escalation?.trigger).toContain('mood');
    expect(escalation?.trigger).toContain('pain');
  });

  it('escalation has a non-empty id', () => {
    expect(checkIntakeRedFlags(markedInput).escalation?.id).toBeTruthy();
  });

  it('escalation member_id matches input', () => {
    expect(checkIntakeRedFlags(markedInput).escalation?.member_id).toBe(memberId);
  });

  it('escalation acknowledged_at is null', () => {
    expect(checkIntakeRedFlags(markedInput).escalation?.acknowledged_at).toBeNull();
  });

  it('mix of marked and non-marked still escalates', () => {
    const input: IntakeRedFlagInput = {
      ...mildInput,
      symptoms: [
        { symptom: 'weight', severity: 'mild' },
        { symptom: 'mood', severity: 'marked' },
      ],
    };
    expect(checkIntakeRedFlags(input).escalation).not.toBeNull();
  });
});

describe('checkIntakeRedFlags — not_diagnosed', () => {
  it('sets not_diagnosed_flagged=true when not_diagnosed=true', () => {
    const input: IntakeRedFlagInput = { ...mildInput, not_diagnosed: true };
    expect(checkIntakeRedFlags(input).not_diagnosed_flagged).toBe(true);
  });

  it('not_diagnosed alone does not create an escalation', () => {
    const input: IntakeRedFlagInput = { ...mildInput, not_diagnosed: true };
    expect(checkIntakeRedFlags(input).escalation).toBeNull();
  });
});
