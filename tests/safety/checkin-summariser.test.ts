import { summariseCheckIn } from '../../src/safety/checkin-summariser';
import { asMemberId, CheckIn, EscalationEvent, EscalationSeverity } from '../../src/domain/types';
import { randomUUID } from 'node:crypto';

const memberId = asMemberId('m-001');

function makeCheckIn(overrides: Partial<CheckIn> = {}): CheckIn {
  return {
    id: 'ci-001',
    member_id: memberId,
    week: 3,
    cycle_date: null,
    top_symptom_severity: null,
    meds_taken: true,
    lifestyle_chips: [],
    mood: [3, 3],
    created_at: new Date(),
    ...overrides,
  };
}

function makeEscalation(severity: EscalationSeverity): EscalationEvent {
  return {
    id: randomUUID(),
    member_id: memberId,
    trigger: 'test trigger',
    severity,
    status: 'open',
    created_at: new Date(),
    acknowledged_at: null,
  };
}

describe('summariseCheckIn', () => {
  it('severity_level=none with no flags and no escalations', () => {
    const summary = summariseCheckIn(makeCheckIn(), []);
    expect(summary.severity_level).toBe('none');
    expect(summary.flags).toHaveLength(0);
    expect(summary.has_escalation).toBe(false);
  });

  it('copies check_in_id, member_id, week from the check-in', () => {
    const ci = makeCheckIn({ id: 'ci-42', week: 7 });
    const summary = summariseCheckIn(ci, []);
    expect(summary.check_in_id).toBe('ci-42');
    expect(summary.member_id).toBe(memberId);
    expect(summary.week).toBe(7);
  });

  it('severity_level=high when a high escalation is present', () => {
    const summary = summariseCheckIn(makeCheckIn(), [makeEscalation('high')]);
    expect(summary.severity_level).toBe('high');
    expect(summary.has_escalation).toBe(true);
  });

  it('severity_level=medium when only a medium escalation is present', () => {
    const summary = summariseCheckIn(makeCheckIn(), [makeEscalation('medium')]);
    expect(summary.severity_level).toBe('medium');
  });

  it('high takes precedence over medium when both escalations are present', () => {
    const summary = summariseCheckIn(makeCheckIn(), [
      makeEscalation('medium'),
      makeEscalation('high'),
    ]);
    expect(summary.severity_level).toBe('high');
  });

  it('severity_level=low when only flags present, no escalations', () => {
    const ci = makeCheckIn({ meds_taken: false });
    const summary = summariseCheckIn(ci, []);
    expect(summary.severity_level).toBe('low');
    expect(summary.flags).toContain('lapsed_meds');
  });

  it('includes marked_symptom flag for marked severity', () => {
    const summary = summariseCheckIn(makeCheckIn({ top_symptom_severity: 'marked' }), []);
    expect(summary.flags).toContain('marked_symptom');
  });

  it('includes moderate_symptom flag for moderate severity', () => {
    const summary = summariseCheckIn(makeCheckIn({ top_symptom_severity: 'moderate' }), []);
    expect(summary.flags).toContain('moderate_symptom');
  });

  it('includes low_mood flag when avg mood <= 2.0', () => {
    const summary = summariseCheckIn(makeCheckIn({ mood: [2, 2] }), []);
    expect(summary.flags).toContain('low_mood');
  });

  it('does not include low_mood flag when avg mood > 2.0', () => {
    const summary = summariseCheckIn(makeCheckIn({ mood: [3, 3] }), []);
    expect(summary.flags).not.toContain('low_mood');
  });

  it('includes lapsed_meds flag when meds_taken=false', () => {
    const summary = summariseCheckIn(makeCheckIn({ meds_taken: false }), []);
    expect(summary.flags).toContain('lapsed_meds');
  });

  it('does not include lapsed_meds when meds_taken=true', () => {
    const summary = summariseCheckIn(makeCheckIn({ meds_taken: true }), []);
    expect(summary.flags).not.toContain('lapsed_meds');
  });

  it('has_escalation=false for empty escalation list', () => {
    const summary = summariseCheckIn(makeCheckIn(), []);
    expect(summary.has_escalation).toBe(false);
  });

  it('generated_at is a Date instance', () => {
    const summary = summariseCheckIn(makeCheckIn(), []);
    expect(summary.generated_at).toBeInstanceOf(Date);
  });
});
