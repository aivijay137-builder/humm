import {
  validateEvidence,
  assertRecommendationHasEvidence,
  MissingEvidenceError,
  IncompleteEvidenceError,
} from '../src/domain/evidence';
import type { Evidence, Recommendation } from '../src/domain/types';
import { asRecommendationId } from '../src/domain/types';

const validEvidence: Evidence = {
  claim: 'Patient education improves PCOS care.',
  rationale: 'The guideline recommends high-quality patient education.',
  evidence_level: 'guideline',
  source: '2023 Intl. Evidence-Based PCOS Guideline',
  confidence: 'illustrative',
  reviewed_by: null,
  last_reviewed: null,
};

const minimalRec: Omit<Recommendation, 'evidence'> = {
  id: asRecommendationId('rec-001'),
  module_id: 'understand',
  title: 'Understand your PCOS',
  action: 'Read a 3-minute primer.',
  cadence: 'Once this week',
  phase: 1,
};

describe('validateEvidence', () => {
  it('returns true for a complete evidence object', () => {
    expect(validateEvidence(validEvidence)).toBe(true);
  });

  it('returns false when claim is empty', () => {
    expect(validateEvidence({ ...validEvidence, claim: '' })).toBe(false);
  });

  it('returns false when rationale is empty', () => {
    expect(validateEvidence({ ...validEvidence, rationale: '' })).toBe(false);
  });

  it('returns false when source is empty', () => {
    expect(validateEvidence({ ...validEvidence, source: '' })).toBe(false);
  });

  it('accepts all four evidence levels', () => {
    const levels = ['guideline', 'good', 'referral', 'safety'] as const;
    levels.forEach(level => {
      expect(validateEvidence({ ...validEvidence, evidence_level: level })).toBe(true);
    });
  });
});

describe('assertRecommendationHasEvidence', () => {
  it('does not throw for a recommendation with valid evidence', () => {
    const rec: Recommendation = { ...minimalRec, evidence: validEvidence };
    expect(() => assertRecommendationHasEvidence(rec)).not.toThrow();
  });

  it('throws IncompleteEvidenceError when evidence fields are empty', () => {
    const rec: Recommendation = {
      ...minimalRec,
      evidence: { ...validEvidence, claim: '' },
    };
    expect(() => assertRecommendationHasEvidence(rec)).toThrow(IncompleteEvidenceError);
  });

  it('error message includes the recommendation id', () => {
    const rec: Recommendation = {
      ...minimalRec,
      evidence: { ...validEvidence, claim: '' },
    };
    expect(() => assertRecommendationHasEvidence(rec)).toThrow('rec-001');
  });
});

describe('MissingEvidenceError', () => {
  it('is an instance of Error', () => {
    const err = new MissingEvidenceError('rec-xyz');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('MissingEvidenceError');
    expect(err.message).toContain('rec-xyz');
  });
});

describe('Evidence level invariant', () => {
  it('a recommendation whose evidence_level is safety is still valid', () => {
    const rec: Recommendation = {
      ...minimalRec,
      evidence: { ...validEvidence, evidence_level: 'safety' },
    };
    expect(() => assertRecommendationHasEvidence(rec)).not.toThrow();
  });
});
