import { randomUUID } from 'node:crypto';
import { deriveOutcomes, detectMilestones } from '../../src/engagement/outcome-service';
import type { CheckIn } from '../../src/domain/types';
import { asMemberId } from '../../src/domain/types';

const memberId = asMemberId('member-001');

function makeCheckIn(week: number, overrides: Partial<Omit<CheckIn, 'id' | 'member_id' | 'week' | 'created_at'>> = {}): CheckIn {
  return {
    id: randomUUID(), member_id: memberId, week,
    cycle_date: null, top_symptom_severity: null, meds_taken: true,
    lifestyle_chips: [], mood: [3, 3], created_at: new Date(), ...overrides,
  };
}

describe('deriveOutcomes — minimum check-ins', () => {
  it('returns empty array for 0 check-ins', () => {
    expect(deriveOutcomes([])).toHaveLength(0);
  });

  it('returns empty array for 1 check-in', () => {
    expect(deriveOutcomes([makeCheckIn(1)])).toHaveLength(0);
  });

  it('returns 3 outcomes for 2+ check-ins', () => {
    expect(deriveOutcomes([makeCheckIn(1), makeCheckIn(2)])).toHaveLength(3);
  });
});

describe('deriveOutcomes — symptom_severity', () => {
  it('derives symptom_severity outcome', () => {
    expect(deriveOutcomes([makeCheckIn(1), makeCheckIn(2)]).find(o => o.metric === 'symptom_severity')).toBeDefined();
  });

  it('severity value is 0 when all check-ins have null severity', () => {
    const o = deriveOutcomes([makeCheckIn(1), makeCheckIn(2)]).find(o => o.metric === 'symptom_severity')!;
    expect(o.value).toBe(0);
  });

  it('mild=1, moderate=2, marked=3 mapping averages correctly', () => {
    const checkIns = [
      makeCheckIn(1, { top_symptom_severity: 'mild' }),
      makeCheckIn(2, { top_symptom_severity: 'marked' }),
    ];
    const o = deriveOutcomes(checkIns).find(o => o.metric === 'symptom_severity')!;
    expect(o.value).toBe(2); // (1+3)/2
  });
});

describe('deriveOutcomes — mood', () => {
  it('derives mood outcome', () => {
    expect(deriveOutcomes([makeCheckIn(1), makeCheckIn(2)]).find(o => o.metric === 'mood')).toBeDefined();
  });

  it('mood value is the average of (mood[0]+mood[1])/2 across check-ins', () => {
    const checkIns = [
      makeCheckIn(1, { mood: [2, 4] }),
      makeCheckIn(2, { mood: [4, 4] }),
    ];
    const o = deriveOutcomes(checkIns).find(o => o.metric === 'mood')!;
    expect(o.value as number).toBeCloseTo(3.5, 5);
  });
});

describe('deriveOutcomes — cycle_regularity', () => {
  it('derives cycle_regularity outcome', () => {
    expect(deriveOutcomes([makeCheckIn(1), makeCheckIn(2)]).find(o => o.metric === 'cycle_regularity')).toBeDefined();
  });

  it('cycle_regularity is 1.0 when all check-ins have cycle_date', () => {
    const d = new Date();
    const o = deriveOutcomes([makeCheckIn(1, { cycle_date: d }), makeCheckIn(2, { cycle_date: d })]).find(o => o.metric === 'cycle_regularity')!;
    expect(o.value).toBe(1);
  });

  it('cycle_regularity is 0.5 when half have cycle_date', () => {
    const o = deriveOutcomes([makeCheckIn(1, { cycle_date: new Date() }), makeCheckIn(2)]).find(o => o.metric === 'cycle_regularity')!;
    expect(o.value).toBe(0.5);
  });

  it('cycle_regularity is 0 when none have cycle_date', () => {
    const o = deriveOutcomes([makeCheckIn(1), makeCheckIn(2)]).find(o => o.metric === 'cycle_regularity')!;
    expect(o.value).toBe(0);
  });
});

describe('detectMilestones — 4-week streak', () => {
  it('returns empty array for fewer than 4 check-ins', () => {
    expect(detectMilestones([makeCheckIn(1), makeCheckIn(2), makeCheckIn(3)])).toHaveLength(0);
  });

  it('detects a 4-week consecutive streak', () => {
    const checkIns = [makeCheckIn(1), makeCheckIn(2), makeCheckIn(3), makeCheckIn(4)];
    expect(detectMilestones(checkIns).some(m => m.value === '4_week_streak')).toBe(true);
  });

  it('does not fire for 4 non-consecutive check-ins', () => {
    const checkIns = [makeCheckIn(1), makeCheckIn(2), makeCheckIn(4), makeCheckIn(5)];
    expect(detectMilestones(checkIns).some(m => m.value === '4_week_streak')).toBe(false);
  });

  it('all milestone outcomes have metric=milestone', () => {
    const checkIns = [makeCheckIn(1), makeCheckIn(2), makeCheckIn(3), makeCheckIn(4)];
    detectMilestones(checkIns).forEach(m => expect(m.metric).toBe('milestone'));
  });
});

describe('detectMilestones — symptom improvement', () => {
  it('detects symptom improvement from marked to mild', () => {
    const checkIns = [
      makeCheckIn(1, { top_symptom_severity: 'marked' }),
      makeCheckIn(2, { top_symptom_severity: 'mild' }),
    ];
    expect(detectMilestones(checkIns).some(m => m.value === 'symptom_improved')).toBe(true);
  });

  it('does not fire when severity is unchanged', () => {
    const checkIns = [
      makeCheckIn(1, { top_symptom_severity: 'moderate' }),
      makeCheckIn(2, { top_symptom_severity: 'moderate' }),
    ];
    expect(detectMilestones(checkIns).some(m => m.value === 'symptom_improved')).toBe(false);
  });

  it('does not fire when severity worsened', () => {
    const checkIns = [
      makeCheckIn(1, { top_symptom_severity: 'mild' }),
      makeCheckIn(2, { top_symptom_severity: 'marked' }),
    ];
    expect(detectMilestones(checkIns).some(m => m.value === 'symptom_improved')).toBe(false);
  });
});
