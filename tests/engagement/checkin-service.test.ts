import { createCheckIn, InvalidMoodError, type CheckInInput } from '../../src/engagement/checkin-service';
import { asMemberId } from '../../src/domain/types';

const memberId = asMemberId('member-001');

const baseInput: CheckInInput = {
  member_id: memberId, week: 1, cycle_date: null,
  top_symptom_severity: 'mild', meds_taken: true,
  lifestyle_chips: ['walked', 'slept_well'], mood: [3, 4],
};

describe('createCheckIn — shape', () => {
  it('returns a CheckIn with a non-empty id', () => {
    expect(createCheckIn(baseInput).id).toBeTruthy();
  });

  it('copies member_id', () => {
    expect(createCheckIn(baseInput).member_id).toBe(memberId);
  });

  it('copies week', () => {
    expect(createCheckIn(baseInput).week).toBe(1);
  });

  it('copies cycle_date when provided', () => {
    const d = new Date('2026-01-15');
    expect(createCheckIn({ ...baseInput, cycle_date: d }).cycle_date).toBe(d);
  });

  it('preserves null cycle_date', () => {
    expect(createCheckIn(baseInput).cycle_date).toBeNull();
  });

  it('copies top_symptom_severity', () => {
    expect(createCheckIn(baseInput).top_symptom_severity).toBe('mild');
  });

  it('preserves null top_symptom_severity', () => {
    expect(createCheckIn({ ...baseInput, top_symptom_severity: null }).top_symptom_severity).toBeNull();
  });

  it('copies meds_taken', () => {
    expect(createCheckIn(baseInput).meds_taken).toBe(true);
  });

  it('copies lifestyle_chips', () => {
    expect(createCheckIn(baseInput).lifestyle_chips).toEqual(['walked', 'slept_well']);
  });

  it('copies mood tuple', () => {
    expect(createCheckIn(baseInput).mood).toEqual([3, 4]);
  });

  it('sets created_at to a Date', () => {
    expect(createCheckIn(baseInput).created_at).toBeInstanceOf(Date);
  });
});

describe('createCheckIn — mood validation', () => {
  it('throws InvalidMoodError when mood[0] is below 1', () => {
    expect(() => createCheckIn({ ...baseInput, mood: [0, 3] })).toThrow(InvalidMoodError);
  });

  it('throws InvalidMoodError when mood[0] is above 5', () => {
    expect(() => createCheckIn({ ...baseInput, mood: [6, 3] })).toThrow(InvalidMoodError);
  });

  it('throws InvalidMoodError when mood[1] is above 5', () => {
    expect(() => createCheckIn({ ...baseInput, mood: [3, 6] })).toThrow(InvalidMoodError);
  });

  it('throws InvalidMoodError when mood[1] is below 1', () => {
    expect(() => createCheckIn({ ...baseInput, mood: [3, 0] })).toThrow(InvalidMoodError);
  });

  it('accepts boundary values 1 and 5', () => {
    expect(() => createCheckIn({ ...baseInput, mood: [1, 5] })).not.toThrow();
  });
});
