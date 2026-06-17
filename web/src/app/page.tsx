import Link from 'next/link';
import { SCENARIOS } from '@/lib/scenarios';

const CATEGORY_COLORS: Record<string, string> = {
  maya: 'bg-green-100 border-green-300 text-green-800',
  aisha: 'bg-amber-100 border-amber-300 text-amber-800',
  priya: 'bg-purple-100 border-purple-300 text-purple-800',
};

export default function HomePage() {
  const scenarios = Object.values(SCENARIOS);

  return (
    <div>
      <section className="mb-10 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-purple-800 mb-3">
          Her Health Hub
        </h1>
        <p className="text-slate-600 max-w-xl mx-auto text-base sm:text-lg">
          An interactive prototype of a PCOS care-plan domain model.
          Select a member to explore their personalised care plan.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">
          Demo Members
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scenarios.map(scenario => (
            <Link
              key={scenario.id}
              href={`/demo/${scenario.id}`}
              className="block bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-purple-300 transition-all p-5 group"
            >
              <div className="flex items-start gap-3">
                <span className="text-3xl" aria-hidden="true">{scenario.emoji}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-800 group-hover:text-purple-700 transition-colors text-base">
                    {scenario.name}
                  </h3>
                  <p className={`mt-1 text-xs font-medium px-2 py-0.5 rounded-full border inline-block ${CATEGORY_COLORS[scenario.id] ?? 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                    {scenario.tagline}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-500 leading-relaxed">
                {scenario.description}
              </p>
              <div className="mt-4 text-sm font-medium text-purple-600 group-hover:text-purple-800 transition-colors">
                View care plan →
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10 bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-800">Coordinator Console</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Ranked attention queue across all active members
            </p>
          </div>
          <Link
            href="/coordinator"
            className="inline-block bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors text-center"
          >
            Open console
          </Link>
        </div>
      </section>
    </div>
  );
}
