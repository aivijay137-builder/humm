import {
  toEvidence,
  toValidatedModule,
  type LibraryEvidenceRaw,
  type LibraryModule,
} from '../../src/module-library/schema';

const rawEvidence: LibraryEvidenceRaw = {
  claim: 'Patient education improves outcomes.',
  rationale: 'Guideline recommendation.',
  level: 'guideline',
  source: '2023 PCOS Guideline',
  confidence: 'illustrative',
  reviewed_by: null,
  last_reviewed: null,
  validated: false,
};

const rawModule: LibraryModule = {
  id: 'understand',
  phase: 1,
  kind: 'self',
  icon: 'book-open',
  title: 'Understand your PCOS',
  action: 'Read a 3-minute primer.',
  cadence: 'Once this week',
  goals_served: ['all'],
  always: true,
  this_week: false,
  evidence: rawEvidence,
};

describe('toEvidence', () => {
  it('maps level to evidence_level', () => {
    expect(toEvidence(rawEvidence).evidence_level).toBe('guideline');
  });

  it('does not include a raw "level" field on the output', () => {
    const e = toEvidence(rawEvidence) as unknown as Record<string, unknown>;
    expect('level' in e).toBe(false);
  });

  it('maps null last_reviewed to null', () => {
    expect(toEvidence(rawEvidence).last_reviewed).toBeNull();
  });

  it('maps an ISO string last_reviewed to a Date', () => {
    const e = toEvidence({ ...rawEvidence, last_reviewed: '2024-01-15T00:00:00.000Z' });
    expect(e.last_reviewed).toBeInstanceOf(Date);
    expect(e.last_reviewed?.getFullYear()).toBe(2024);
  });

  it('passes through claim, rationale, source, confidence, reviewed_by', () => {
    const e = toEvidence(rawEvidence);
    expect(e.claim).toBe('Patient education improves outcomes.');
    expect(e.rationale).toBe('Guideline recommendation.');
    expect(e.source).toBe('2023 PCOS Guideline');
    expect(e.confidence).toBe('illustrative');
    expect(e.reviewed_by).toBeNull();
  });

  it('does not include the seed "validated" field on the output', () => {
    const e = toEvidence(rawEvidence) as unknown as Record<string, unknown>;
    expect('validated' in e).toBe(false);
  });
});

describe('toValidatedModule', () => {
  it('preserves scalar fields unchanged', () => {
    const m = toValidatedModule(rawModule);
    expect(m.id).toBe('understand');
    expect(m.phase).toBe(1);
    expect(m.kind).toBe('self');
    expect(m.title).toBe('Understand your PCOS');
    expect(m.always).toBe(true);
    expect(m.this_week).toBe(false);
  });

  it('converts evidence via toEvidence (level → evidence_level)', () => {
    expect(toValidatedModule(rawModule).evidence.evidence_level).toBe('guideline');
  });

  it('preserves include_when when present', () => {
    const withWhen: LibraryModule = {
      ...rawModule,
      always: false,
      include_when: { symptoms: ['skinhair'], primary_goal: ['skin'] },
    };
    const m = toValidatedModule(withWhen);
    expect(m.include_when?.symptoms).toEqual(['skinhair']);
    expect(m.include_when?.primary_goal).toEqual(['skin']);
  });

  it('include_when is undefined when omitted from seed', () => {
    expect(toValidatedModule(rawModule).include_when).toBeUndefined();
  });
});
