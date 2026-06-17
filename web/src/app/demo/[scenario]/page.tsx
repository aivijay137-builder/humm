import { notFound } from 'next/navigation';
import Link from 'next/link';
import { SCENARIOS } from '@/lib/scenarios';
import { assembledPlans, iconByModuleId, replanningTrigger } from '@/lib/demo-state';
import CheckInForm from './CheckInForm';

export function generateStaticParams() {
  return [{ scenario: 'maya' }, { scenario: 'aisha' }, { scenario: 'priya' }];
}

const PHASE_COLORS: Record<number, string> = {
  1: 'bg-green-100 text-green-700 border-green-200',
  2: 'bg-amber-100 text-amber-700 border-amber-200',
  3: 'bg-purple-100 text-purple-700 border-purple-200',
};

const EVIDENCE_BADGE: Record<string, string> = {
  guideline: 'bg-blue-100 text-blue-700',
  good: 'bg-teal-100 text-teal-700',
  referral: 'bg-orange-100 text-orange-700',
  safety: 'bg-red-100 text-red-700',
};

function isLapsed(currentWeek: number, lastCheckInWeek: number | undefined): boolean {
  if (lastCheckInWeek === undefined) return currentWeek > 1;
  return currentWeek > lastCheckInWeek + 1;
}

export default async function ScenarioPage({
  params,
}: {
  params: Promise<{ scenario: string }>;
}) {
  const { scenario: scenarioId } = await params;
  const scenario = SCENARIOS[scenarioId];
  const planResult = assembledPlans[scenarioId as keyof typeof assembledPlans];

  if (!scenario || !planResult) notFound();

  const { carePlan } = planResult;
  const lastCheckIn = scenario.checkIns.at(0);
  const lapsed = isLapsed(scenario.currentWeek, lastCheckIn?.week);
  const trigger = scenarioId === 'priya' ? replanningTrigger : null;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/" className="text-sm text-purple-600 hover:text-purple-800 transition-colors">
        ← All members
      </Link>

      {/* Profile header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-4xl" aria-hidden="true">{scenario.emoji}</span>
            <div>
              <h1 className="text-xl font-bold text-slate-800">{scenario.name}</h1>
              <p className="text-sm text-slate-500">{scenario.tagline}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
              Week {scenario.currentWeek}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">
              {carePlan.recommendations.length} recommendation{carePlan.recommendations.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-500">{scenario.description}</p>
      </div>

      {/* Lapse banner — Aisha */}
      {lapsed && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="text-xl" aria-hidden="true">⚠️</span>
          <div>
            <p className="font-semibold text-amber-800 text-sm">Lapse detected</p>
            <p className="text-amber-700 text-sm">
              Last check-in was week {lastCheckIn?.week ?? 'none'} — that's{' '}
              {scenario.currentWeek - (lastCheckIn?.week ?? 0)} weeks ago. Coordinator review recommended.
            </p>
          </div>
        </div>
      )}

      {/* Replanning banner — Priya */}
      {trigger && (
        <div className="rounded-lg border border-purple-300 bg-purple-50 p-4 flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="text-xl" aria-hidden="true">🔄</span>
          <div>
            <p className="font-semibold text-purple-800 text-sm">Re-planning triggered</p>
            <p className="text-purple-700 text-sm">
              Reason: <span className="font-mono">{trigger.reason}</span> — a new plan version is
              due for approval.
            </p>
          </div>
        </div>
      )}

      {/* Recommendations */}
      <section>
        <h2 className="text-base font-semibold text-slate-700 mb-3">Care Plan Recommendations</h2>
        {carePlan.recommendations.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No recommendations in this plan.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {carePlan.recommendations.map(rec => (
              <div
                key={rec.id}
                className="bg-white rounded-xl border border-slate-200 p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-2xl" aria-hidden="true">
                    {iconByModuleId[rec.module_id] ?? '💊'}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${PHASE_COLORS[rec.phase] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                    Phase {rec.phase}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-800 text-sm leading-snug">{rec.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{rec.action}</p>
                <p className="text-xs text-slate-400">{rec.cadence}</p>
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${EVIDENCE_BADGE[rec.evidence.evidence_level] ?? 'bg-slate-100 text-slate-600'}`}>
                    {rec.evidence.evidence_level}
                  </span>
                  <span className="text-xs text-slate-400 truncate">{rec.evidence.source}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Check-in form */}
      <section>
        <h2 className="text-base font-semibold text-slate-700 mb-3">Record a Check-In</h2>
        <CheckInForm scenarioId={scenarioId} />
      </section>
    </div>
  );
}
