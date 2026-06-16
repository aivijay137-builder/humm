import {
  createConsent,
  hasConsent,
  assertConsent,
  InsufficientConsentError,
  REQUIRED_SCOPES,
  CONSENT_VERSION,
} from '../src/domain/consent';
import type { ConsentScope } from '../src/domain/types';
import { asMemberId } from '../src/domain/types';

const memberId = asMemberId('member-001');

describe('createConsent', () => {
  it('returns a ConsentRecord with the given member and scopes', () => {
    const rec = createConsent(memberId, ['health_data', 'care_plan']);
    expect(rec.member_id).toBe(memberId);
    expect(rec.scopes).toEqual(['health_data', 'care_plan']);
  });

  it('sets version to CONSENT_VERSION', () => {
    const rec = createConsent(memberId, ['health_data']);
    expect(rec.version).toBe(CONSENT_VERSION);
  });

  it('sets granted_at to approximately now', () => {
    const before = Date.now();
    const rec = createConsent(memberId, ['health_data']);
    const after = Date.now();
    expect(rec.granted_at.getTime()).toBeGreaterThanOrEqual(before);
    expect(rec.granted_at.getTime()).toBeLessThanOrEqual(after);
  });

  it('generates a non-empty id', () => {
    const rec = createConsent(memberId, ['health_data']);
    expect(rec.id).toBeTruthy();
    expect(typeof rec.id).toBe('string');
  });

  it('produces unique ids for two calls', () => {
    const a = createConsent(memberId, ['health_data']);
    const b = createConsent(memberId, ['health_data']);
    expect(a.id).not.toBe(b.id);
  });
});

describe('hasConsent', () => {
  it('returns true when record has all required scopes', () => {
    const rec = createConsent(memberId, ['health_data', 'care_plan', 'notifications']);
    expect(hasConsent(rec, ['health_data', 'care_plan'])).toBe(true);
  });

  it('returns false when a required scope is missing', () => {
    const rec = createConsent(memberId, ['health_data']);
    expect(hasConsent(rec, ['health_data', 'care_plan'])).toBe(false);
  });

  it('returns true for an empty required list', () => {
    const rec = createConsent(memberId, []);
    expect(hasConsent(rec, [])).toBe(true);
  });
});

describe('assertConsent', () => {
  it('does not throw when all scopes are present', () => {
    const rec = createConsent(memberId, ['health_data', 'care_plan']);
    expect(() => assertConsent(rec, ['health_data', 'care_plan'])).not.toThrow();
  });

  it('throws InsufficientConsentError listing missing scopes', () => {
    const rec = createConsent(memberId, ['health_data']);
    expect(() => assertConsent(rec, ['health_data', 'care_plan'])).toThrow(InsufficientConsentError);
  });

  it('error message names each missing scope', () => {
    const rec = createConsent(memberId, []);
    expect(() =>
      assertConsent(rec, ['health_data', 'clinician_access']),
    ).toThrow('health_data');
  });
});

describe('REQUIRED_SCOPES', () => {
  it('includes health_data and care_plan at minimum', () => {
    const required: ConsentScope[] = ['health_data', 'care_plan'];
    required.forEach(s => expect(REQUIRED_SCOPES).toContain(s));
  });
});
