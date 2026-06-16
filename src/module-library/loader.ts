import { readFileSync } from 'node:fs';
import type { LibrarySeed, ValidatedModule } from './schema';
import { toValidatedModule } from './schema';

export class InvalidModuleLibraryError extends Error {
  constructor(message: string) {
    super(`Invalid module library: ${message}`);
    this.name = 'InvalidModuleLibraryError';
  }
}

export function loadModuleLibraryFromJson(json: string): ValidatedModule[] {
  let seed: LibrarySeed;
  try {
    seed = JSON.parse(json) as LibrarySeed;
  } catch {
    throw new InvalidModuleLibraryError('JSON parse failed');
  }
  if (!Array.isArray(seed.modules)) {
    throw new InvalidModuleLibraryError('modules must be an array');
  }
  return seed.modules.map(toValidatedModule);
}

export function loadModuleLibraryFromFile(filePath: string): ValidatedModule[] {
  let json: string;
  try {
    json = readFileSync(filePath, 'utf-8');
  } catch {
    throw new InvalidModuleLibraryError(`could not read file: ${filePath}`);
  }
  return loadModuleLibraryFromJson(json);
}
