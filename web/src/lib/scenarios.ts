import {
  asMemberId,
  asConditionProfileId,
  type Member,
  type ConditionProfile,
  type CheckIn,
  type Outcome,
  type EscalationEvent,
} from '@humm/domain/types';

export interface DemoScenario {
  readonly id: string;
  readonly name: string;
  readonly tagline: string;
  readonly emoji: string;
  readonly member: Member;
  readonly profile: ConditionProfile;
  readonly currentWeek: number;
  readonly checkIns: readonly CheckIn[];
  readonly escalations: readonly EscalationEvent[];
  readonly milestones: readonly Outcome[];
  readonly description: string;
}

const now = new Date();

export const SCENARIOS: Record<string, DemoScenario> = {
  maya: {
    id: 'maya',
    name: 'Maya Sharma',
    emoji: '🌱',
    tagline: 'Newly diagnosed · Week 4',
    member: { id: asMemberId('member-maya'), email: 'maya@demo.com', created_at: now },
    profile: {
      id: asConditionProfileId('profile-maya'),
      member_id: asMemberId('member-maya'),
      symptoms: [],
      primary_goal: 'understand',
      conditions: [],
      diagnosed: true,
      diagnosis_date: new Date('2026-05-20'),
      free_text_flagged: false,
    },
    currentWeek: 4,
    checkIns: [
      {
        id: 'ci-maya-1',
        member_id: asMemberId('member-maya'),
        week: 3,
        cycle_date: null,
        top_symptom_severity: 'mild',
        meds_taken: true,
        lifestyle_chips: ['walked', 'journalled'],
        mood: [3, 4],
        created_at: now,
      },
    ],
    escalations: [],
    milestones: [],
    description:
      'Recently diagnosed with PCOS. Starting her care journey with lifestyle foundations and education.',
  },

  aisha: {
    id: 'aisha',
    name: 'Aisha Rahman',
    emoji: '⚠️',
    tagline: 'Lapse detected · Week 8',
    member: { id: asMemberId('member-aisha'), email: 'aisha@demo.com', created_at: now },
    profile: {
      id: asConditionProfileId('profile-aisha'),
      member_id: asMemberId('member-aisha'),
      symptoms: ['weight'],
      primary_goal: 'metabolic',
      conditions: ['Insulin resistance'],
      diagnosed: true,
      diagnosis_date: new Date('2026-03-01'),
      free_text_flagged: false,
    },
    currentWeek: 8,
    checkIns: [
      {
        id: 'ci-aisha-1',
        member_id: asMemberId('member-aisha'),
        week: 6,
        cycle_date: null,
        top_symptom_severity: 'moderate',
        meds_taken: true,
        lifestyle_chips: ['walked'],
        mood: [2, 3],
        created_at: now,
      },
    ],
    escalations: [],
    milestones: [],
    description:
      "Managing PCOS with insulin resistance. Missed the last two check-ins — flagged for coordinator follow-up.",
  },

  priya: {
    id: 'priya',
    name: 'Priya Menon',
    emoji: '🌟',
    tagline: '30-week milestone · Re-planning',
    member: { id: asMemberId('member-priya'), email: 'priya@demo.com', created_at: now },
    profile: {
      id: asConditionProfileId('profile-priya'),
      member_id: asMemberId('member-priya'),
      symptoms: ['skinhair'],
      primary_goal: 'skin',
      conditions: [],
      diagnosed: true,
      diagnosis_date: new Date('2025-10-01'),
      free_text_flagged: false,
    },
    currentWeek: 32,
    checkIns: [
      {
        id: 'ci-priya-1',
        member_id: asMemberId('member-priya'),
        week: 31,
        cycle_date: null,
        top_symptom_severity: null,
        meds_taken: true,
        lifestyle_chips: ['walked', 'strength', 'journalled'],
        mood: [4, 5],
        created_at: now,
      },
    ],
    escalations: [],
    milestones: [
      {
        id: 'outcome-priya-1',
        member_id: asMemberId('member-priya'),
        metric: 'milestone',
        value: 'Completed 30 weeks of consistent care',
        ts: new Date('2026-06-01'),
      },
    ],
    description:
      '32 weeks into her journey. Achieved her 30-week milestone — re-planning has been triggered for a fresh assessment.',
  },
};
