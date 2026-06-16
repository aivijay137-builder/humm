import type { ConditionProfile } from '../domain/types';
import type { ValidatedModule } from '../module-library/schema';

export function selectModules(
  modules: ValidatedModule[],
  profile: ConditionProfile,
): ValidatedModule[] {
  return modules.filter(m => {
    if (m.always) return true;
    const iw = m.include_when;
    if (iw === undefined) return false;

    const symptomMatch = iw.symptoms?.some(s => profile.symptoms.includes(s)) ?? false;
    const goalMatch = iw.primary_goal?.includes(profile.primary_goal) ?? false;
    const conditionMatch = iw.conditions?.some(c => profile.conditions.includes(c)) ?? false;

    return symptomMatch || goalMatch || conditionMatch;
  });
}
