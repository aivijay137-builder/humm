import {
  evaluateReplanningTrigger,
  type EvaluateReplanningTriggerInput,
  type ReplanningTrigger,
} from '../../src/replanning/trigger';
import {
  asMemberId,
  asCarePlanId,
  type CheckIn,
  type Outcome,
} from '../../src/domain/types';

const memberId = asMemberId('m1');
const cpId = asCarePlanId('cp1');

const base: EvaluateReplanningTriggerInput = {
  member_id: memberId,
  care_plan_id: cpId,
  currentWeek: 1,
  milestones: [],
  lastCheckIn: null,
  existingTriggers: [],
};

const recentCi: CheckIn = {
  id: 'ci1',
  member_id: memberId,
  week: 29,
  cycle_date: null,
  top_symptom_severity: null,
  meds_taken: true,
  lifestyle_chips: [],
  mood: [3, 3],
  created_at: new Date(),
};

const milestone: Outcome = {
  id: 'o1',
  member_id: memberId,
  metric: 'milestone',
  value: 'achieved',
  ts: new Date(),
};

function makeFiredTrigger(reason: ReplanningTrigger['reason']): ReplanningTrigger {
  return { care_plan_id: cpId, member_id: memberId, reason, triggered_at: new Date() };
}

describe('evaluateReplanningTrigger', () => {
  it('returns null when no condition met (week 1, no check-in)', () => {
    expect(evaluateReplanningTrigger(base)).toBeNull();
  });

  it('returns phase_30 at week 30', () => {
    expect(evaluateReplanningTrigger({ ...base, currentWeek: 30 })?.reason).toBe('phase_30');
  });

  it('returns phase_30 at week 45 (>= 30)', () => {
    expect(evaluateReplanningTrigger({ ...base, currentWeek: 45 })?.reason).toBe('phase_30');
  });

  it('returns phase_60 when phase_30 already triggered', () => {
    const result = evaluateReplanningTrigger({
      ...base,
      currentWeek: 60,
      existingTriggers: [makeFiredTrigger('phase_30')],
    });
    expect(result?.reason).toBe('phase_60');
  });

  it('returns phase_90 when phase_30 and phase_60 already triggered', () => {
    const result = evaluateReplanningTrigger({
      ...base,
      currentWeek: 90,
      existingTriggers: [makeFiredTrigger('phase_30'), makeFiredTrigger('phase_60')],
    });
    expect(result?.reason).toBe('phase_90');
  });

  it('returns null when all triggers already fired', () => {
    const result = evaluateReplanningTrigger({
      ...base,
      currentWeek: 90,
      milestones: [milestone],
      lastCheckIn: recentCi,
      existingTriggers: [
        makeFiredTrigger('phase_30'),
        makeFiredTrigger('phase_60'),
        makeFiredTrigger('phase_90'),
        makeFiredTrigger('milestone'),
        makeFiredTrigger('lapse'),
      ],
    });
    expect(result).toBeNull();
  });

  it('returns null for phase_30 when already triggered and no other condition met', () => {
    const result = evaluateReplanningTrigger({
      ...base,
      currentWeek: 30,
      lastCheckIn: recentCi,
      existingTriggers: [makeFiredTrigger('phase_30')],
    });
    expect(result).toBeNull();
  });

  it('returns milestone when milestones exist below week 30', () => {
    expect(
      evaluateReplanningTrigger({ ...base, currentWeek: 5, milestones: [milestone] })?.reason,
    ).toBe('milestone');
  });

  it('phase_30 takes priority over milestone at week 30', () => {
    expect(
      evaluateReplanningTrigger({ ...base, currentWeek: 30, milestones: [milestone] })?.reason,
    ).toBe('phase_30');
  });

  it('returns milestone when phase_30 already fired at week 30', () => {
    const result = evaluateReplanningTrigger({
      ...base,
      currentWeek: 30,
      lastCheckIn: recentCi,
      milestones: [milestone],
      existingTriggers: [makeFiredTrigger('phase_30')],
    });
    expect(result?.reason).toBe('milestone');
  });

  it('returns lapse when no check-in and currentWeek > 1', () => {
    expect(
      evaluateReplanningTrigger({ ...base, currentWeek: 3, lastCheckIn: null })?.reason,
    ).toBe('lapse');
  });

  it('returns lapse when lastCheckIn is stale (currentWeek > lastCheckIn.week + 1)', () => {
    const stale: CheckIn = { ...recentCi, week: 5 };
    expect(
      evaluateReplanningTrigger({ ...base, currentWeek: 7, lastCheckIn: stale })?.reason,
    ).toBe('lapse');
  });

  it('no lapse at boundary (currentWeek === lastCheckIn.week + 1)', () => {
    const ci: CheckIn = { ...recentCi, week: 6 };
    expect(evaluateReplanningTrigger({ ...base, currentWeek: 7, lastCheckIn: ci })).toBeNull();
  });

  it('does not fire lapse at week 1 even with no check-in', () => {
    expect(evaluateReplanningTrigger({ ...base, currentWeek: 1, lastCheckIn: null })).toBeNull();
  });

  it('returns lapse when milestone already fired', () => {
    const result = evaluateReplanningTrigger({
      ...base,
      currentWeek: 5,
      milestones: [milestone],
      existingTriggers: [makeFiredTrigger('milestone')],
    });
    expect(result?.reason).toBe('lapse');
  });

  it('populates trigger fields correctly', () => {
    const result = evaluateReplanningTrigger({ ...base, currentWeek: 30 });
    expect(result).toMatchObject({ care_plan_id: cpId, member_id: memberId, reason: 'phase_30' });
    expect(result).not.toBeNull();
    expect(result?.triggered_at).toBeInstanceOf(Date);
  });

  it('does not cross-pollute triggers from a different care_plan_id', () => {
    const otherTrigger: ReplanningTrigger = {
      care_plan_id: asCarePlanId('other-cp'),
      member_id: memberId,
      reason: 'phase_30',
      triggered_at: new Date(),
    };
    const result = evaluateReplanningTrigger({
      ...base,
      currentWeek: 30,
      existingTriggers: [otherTrigger],
    });
    expect(result?.reason).toBe('phase_30');
  });
});
