import type { Evidence, Recommendation } from './types';

export class MissingEvidenceError extends Error {
  constructor(recommendationId: string) {
    super(`Recommendation "${recommendationId}" cannot publish without linked Evidence`);
    this.name = 'MissingEvidenceError';
  }
}

export class IncompleteEvidenceError extends Error {
  constructor(recommendationId: string, field: string) {
    super(`Evidence for recommendation "${recommendationId}" is incomplete: ${field} is empty`);
    this.name = 'IncompleteEvidenceError';
  }
}

export function validateEvidence(e: Evidence): boolean {
  return (
    e.claim.trim().length > 0 &&
    e.rationale.trim().length > 0 &&
    e.source.trim().length > 0 &&
    ['guideline', 'good', 'referral', 'safety'].includes(e.evidence_level)
  );
}

export function assertRecommendationHasEvidence(rec: Recommendation): void {
  const { evidence: e, id } = rec;
  if (e.claim.trim().length === 0) throw new IncompleteEvidenceError(id, 'claim');
  if (e.rationale.trim().length === 0) throw new IncompleteEvidenceError(id, 'rationale');
  if (e.source.trim().length === 0) throw new IncompleteEvidenceError(id, 'source');
  if (!['guideline', 'good', 'referral', 'safety'].includes(e.evidence_level)) {
    throw new IncompleteEvidenceError(id, 'evidence_level');
  }
}
