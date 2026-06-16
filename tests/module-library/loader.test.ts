import * as path from 'node:path';
import {
  loadModuleLibraryFromJson,
  loadModuleLibraryFromFile,
  InvalidModuleLibraryError,
} from '../../src/module-library/loader';

const SEED_PATH = path.join(process.cwd(), 'module-library.seed.json');

const minimalSeedJson = JSON.stringify({
  _meta: {},
  modules: [
    {
      id: 'test-module',
      phase: 1,
      kind: 'self',
      icon: 'test',
      title: 'Test module',
      action: 'Do the thing.',
      cadence: 'Daily',
      goals_served: ['all'],
      always: true,
      this_week: false,
      evidence: {
        claim: 'A claim.',
        rationale: 'A rationale.',
        level: 'guideline',
        source: 'Test source',
        confidence: 'illustrative',
        reviewed_by: null,
        last_reviewed: null,
        validated: false,
      },
    },
  ],
});

describe('loadModuleLibraryFromJson', () => {
  it('returns a ValidatedModule array from valid JSON', () => {
    const modules = loadModuleLibraryFromJson(minimalSeedJson);
    expect(modules).toHaveLength(1);
    expect(modules[0]?.id).toBe('test-module');
  });

  it('maps evidence.level to evidence.evidence_level', () => {
    const modules = loadModuleLibraryFromJson(minimalSeedJson);
    expect(modules[0]?.evidence.evidence_level).toBe('guideline');
  });

  it('throws InvalidModuleLibraryError on unparseable JSON', () => {
    expect(() => loadModuleLibraryFromJson('not json {')).toThrow(InvalidModuleLibraryError);
  });

  it('throws InvalidModuleLibraryError when modules key is missing', () => {
    expect(() =>
      loadModuleLibraryFromJson(JSON.stringify({ _meta: {} })),
    ).toThrow(InvalidModuleLibraryError);
  });

  it('throws InvalidModuleLibraryError when modules is not an array', () => {
    expect(() =>
      loadModuleLibraryFromJson(JSON.stringify({ _meta: {}, modules: 'bad' })),
    ).toThrow(InvalidModuleLibraryError);
  });
});

describe('loadModuleLibraryFromFile', () => {
  it('loads the seed file and returns 13 modules', () => {
    const modules = loadModuleLibraryFromFile(SEED_PATH);
    expect(modules).toHaveLength(13);
  });

  it('all modules have valid evidence_level values', () => {
    const validLevels = ['guideline', 'good', 'referral', 'safety'];
    const modules = loadModuleLibraryFromFile(SEED_PATH);
    modules.forEach(m => {
      expect(validLevels).toContain(m.evidence.evidence_level);
    });
  });

  it('all modules have non-empty claim and source', () => {
    const modules = loadModuleLibraryFromFile(SEED_PATH);
    modules.forEach(m => {
      expect(m.evidence.claim.length).toBeGreaterThan(0);
      expect(m.evidence.source.length).toBeGreaterThan(0);
    });
  });

  it('at least one module has always=true', () => {
    const modules = loadModuleLibraryFromFile(SEED_PATH);
    expect(modules.some(m => m.always)).toBe(true);
  });

  it('throws InvalidModuleLibraryError for a non-existent path', () => {
    expect(() => loadModuleLibraryFromFile('/no/such/file.json')).toThrow(
      InvalidModuleLibraryError,
    );
  });
});
