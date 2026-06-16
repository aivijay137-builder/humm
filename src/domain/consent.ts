import { randomUUID } from 'node:crypto';
import type { ConsentRecord, ConsentScope, MemberId } from './types';

export const CONSENT_VERSION = '1.0.0';

export const REQUIRED_SCOPES: readonly ConsentScope[] = ['health_data', 'care_plan'];

export class InsufficientConsentError extends Error {
  readonly missing: ConsentScope[];
  constructor(missing: ConsentScope[]) {
    super(`Insufficient consent — missing scopes: ${missing.join(', ')}`);
    this.name = 'InsufficientConsentError';
    this.missing = missing;
  }
}

export function createConsent(
  memberId: MemberId,
  scopes: readonly ConsentScope[],
): ConsentRecord {
  return {
    id: randomUUID(),
    member_id: memberId,
    scopes,
    granted_at: new Date(),
    version: CONSENT_VERSION,
  };
}

export function hasConsent(
  record: ConsentRecord,
  requiredScopes: readonly ConsentScope[],
): boolean {
  return requiredScopes.every(s => record.scopes.includes(s));
}

export function assertConsent(
  record: ConsentRecord,
  requiredScopes: readonly ConsentScope[],
): void {
  const missing = requiredScopes.filter(s => !record.scopes.includes(s));
  if (missing.length > 0) throw new InsufficientConsentError(missing);
}
