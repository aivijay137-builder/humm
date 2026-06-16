import { generateNudges, type NudgeContext } from '../../src/engagement/nudge-service';
import { asMemberId } from '../../src/domain/types';

const memberId = asMemberId('member-001');

function ctx(overrides: Partial<NudgeContext>): NudgeContext {
  return { member_id: memberId, current_week: 2, last_checkin_week: 1, milestone_reached: false, ...overrides };
}

describe('generateNudges — check_in_due', () => {
  it('always includes check_in_due', () => {
    expect(generateNudges(ctx({})).some(n => n.type === 'check_in_due')).toBe(true);
  });

  it('check_in_due recipient_id matches member', () => {
    const [n] = generateNudges(ctx({})).filter(n => n.type === 'check_in_due');
    expect(n?.recipient_id).toBe(memberId);
  });

  it('check_in_due recipient_type is member', () => {
    const [n] = generateNudges(ctx({})).filter(n => n.type === 'check_in_due');
    expect(n?.recipient_type).toBe('member');
  });

  it('produces exactly one check_in_due per call', () => {
    expect(generateNudges(ctx({})).filter(n => n.type === 'check_in_due')).toHaveLength(1);
  });
});

describe('generateNudges — lapse_nudge', () => {
  it('includes lapse_nudge when current_week is 2 more than last_checkin_week', () => {
    expect(generateNudges(ctx({ current_week: 3, last_checkin_week: 1 })).some(n => n.type === 'lapse_nudge')).toBe(true);
  });

  it('does not include lapse_nudge when current_week is exactly last_checkin_week + 1', () => {
    expect(generateNudges(ctx({ current_week: 2, last_checkin_week: 1 })).some(n => n.type === 'lapse_nudge')).toBe(false);
  });

  it('includes lapse_nudge when last_checkin_week is null and current_week > 1', () => {
    expect(generateNudges(ctx({ current_week: 2, last_checkin_week: null })).some(n => n.type === 'lapse_nudge')).toBe(true);
  });

  it('does not include lapse_nudge in week 1 with no prior check-ins', () => {
    expect(generateNudges(ctx({ current_week: 1, last_checkin_week: null })).some(n => n.type === 'lapse_nudge')).toBe(false);
  });

  it('produces at most one lapse_nudge per call', () => {
    expect(generateNudges(ctx({ current_week: 5, last_checkin_week: 1 })).filter(n => n.type === 'lapse_nudge')).toHaveLength(1);
  });
});

describe('generateNudges — milestone', () => {
  it('includes milestone notification when milestone_reached is true', () => {
    expect(generateNudges(ctx({ milestone_reached: true })).some(n => n.type === 'milestone')).toBe(true);
  });

  it('does not include milestone when milestone_reached is false', () => {
    expect(generateNudges(ctx({ milestone_reached: false })).some(n => n.type === 'milestone')).toBe(false);
  });

  it('produces exactly one milestone per call when reached', () => {
    expect(generateNudges(ctx({ milestone_reached: true })).filter(n => n.type === 'milestone')).toHaveLength(1);
  });
});

describe('generateNudges — all three fire together', () => {
  it('can return all three types in one call', () => {
    const nudges = generateNudges(ctx({ current_week: 3, last_checkin_week: 1, milestone_reached: true }));
    const types = nudges.map(n => n.type);
    expect(types).toContain('check_in_due');
    expect(types).toContain('lapse_nudge');
    expect(types).toContain('milestone');
  });

  it('all notifications have read_at null', () => {
    generateNudges(ctx({ milestone_reached: true })).forEach(n => expect(n.read_at).toBeNull());
  });
});
