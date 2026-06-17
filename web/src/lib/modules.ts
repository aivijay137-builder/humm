import seedData from '../../../module-library.seed.json';
import { loadModuleLibraryFromJson } from '@humm/module-library/loader';

export const allModules = loadModuleLibraryFromJson(JSON.stringify(seedData));
