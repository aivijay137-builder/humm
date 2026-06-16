import { checkCheckInRedFlags } from '../../src/safety/checkin-red-flag';
import { asMemberId, CheckIn } from '../../src/domain/types';
import { randomUUID } from 'node:crypto';

const memberId = asMemberId('m-001');

function makeCheckIn(overrides: Partial<CheckIn> = {}): CheckIn {
  return {
    id: randomUUID(),
    member_id: memberId,
    week: 1,
    cycle_date: null,
    top_symptom_severity: null,
    meds_taken: true,
    lifestyle_chips: [],
    mood: [3, 3],
    created_at: new Date(),
    ...overrides,
  };
}

describe('checkCheckInRedFlags', () => {
  it('returns no escalations for a normal check-in', () => {
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: makeCheckIn({ top_symptom_severity: 'mild', mood: [3, 3] }),
      previousCheckIn: null,
    });
    expect(result.escalations).toHaveLength(0);
  });

  it('fires high escalation for marked severity (Rule 1)', () => {
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: makeCheckIn({ top_symptom_severity: 'marked' }),
      previousCheckIn: null,
    });
    expect(result.escalations).toHaveLength(1);
    expect(result.escalations[0]!.severity).toBe('high');
    expect(result.escalations[0]!.status).toBe('open');
    expect(result.escalations[0]!.trigger).toContain('marked symptom severity');
    expect(result.escalations[0]!.acknowledged_at).toBeNull();
  });

  it('fires medium escalation for low mood avg <= 2.0 (Rule 2)', () => {
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: makeCheckIn({ mood: [2, 2] }),
      previousCheckIn: null,
    });
    expect(result.escalations).toHaveLength(1);
    expect(result.escalations[0]!.severity).toBe('medium');
    expect(result.escalations[0]!.trigger).toContain('low mood');
  });

  it('fires medium escalation when avg mood is exactly 2.0 boundary (Rule 2)', () => {
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: makeCheckIn({ mood: [3, 1] }),
      previousCheckIn: null,
    });
    expect(result.escalations).toHaveLength(1);
    expect(result.escalations[0]!.severity).toBe('medium');
  });

  it('does not fire Rule 2 when avg mood > 2.0', () => {
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: makeCheckIn({ mood: [3, 2] }),
      previousCheckIn: null,
    });
    expect(result.escalations).toHaveLength(0);
  });

  it('fires medium escalation for sharp symptom change of 2 levels (Rule 3)', () => {
    const prev = makeCheckIn({ top_symptom_severity: null, week: 1 });
    const curr = makeCheckIn({ top_symptom_severity: 'moderate', week: 2 });
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: curr,
      previousCheckIn: prev,
    });
    expect(result.escalations).toHaveLength(1);
    expect(result.escalations[0]!.severity).toBe('medium');
    expect(result.escalations[0]!.trigger).toContain('sharp symptom change');
  });

  it('does not fire Rule 3 when severity increases by only 1 level', () => {
    const prev = makeCheckIn({ top_symptom_severity: 'mild', week: 1 });
    const curr = makeCheckIn({ top_symptom_severity: 'moderate', week: 2 });
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: curr,
      previousCheckIn: prev,
    });
    expect(result.escalations).toHaveLength(0);
  });

  it('fires both Rule 1 (high) and Rule 3 (medium) when null to marked', () => {
    const prev = makeCheckIn({ top_symptom_severity: null, week: 1 });
    const curr = makeCheckIn({ top_symptom_severity: 'marked', week: 2 });
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: curr,
      previousCheckIn: prev,
    });
    expect(result.escalations).toHaveLength(2);
    const severities = result.escalations.map(e => e.severity).sort();
    expect(severities).toEqual(['high', 'medium']);
  });

  it('does not fire Rule 3 without previousCheckIn', () => {
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: makeCheckIn({ top_symptom_severity: 'marked' }),
      previousCheckIn: null,
    });
    expect(result.escalations).toHaveLength(1);
    expect(result.escalations[0]!.severity).toBe('high');
  });

  it('sets member_id on every escalation', () => {
    const result = checkCheckInRedFlags({
      member_id: memberId,
      checkIn: makeCheckIn({ top_symptom_severity: 'marked', mood: [1, 1] }),
      previousCheckIn: null,
    });
    for (const e of result.escalations) {
      expect(e.member_id).toBe(memberId);
    }
  });
});
