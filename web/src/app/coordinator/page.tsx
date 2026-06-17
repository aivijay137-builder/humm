import Link from 'next/link';
import { attentionQueue } from '@/lib/demo-state';
import type { AttentionCategory } from '@humm/coordinator/attention-queue';

const MEMBER_MAP: Record<string, string> = {
  'member-maya': 'Maya Sharma',
  'member-aisha': 'Aisha Rahman',
  'member-priya': 'Priya Menon',
};

const SCENARIO_MAP: Record<string, string> = {
  'member-maya': 'maya',
  'member-aisha': 'aisha',
  'member-priya': 'priya',
};

const CATEGORY_CONFIG: Record<
  AttentionCategory,
  { label: string; badge: string; icon: string }
> = {
  escalation: { label: 'Escalation', badge: 'bg-red-100 text-red-800 border-red-300', icon: '🚨' },
  lapse: { label: 'Lapse', badge: 'bg-amber-100 text-amber-800 border-amber-300', icon: '⚠️' },
  milestone: { label: 'Milestone', badge: 'bg-purple-100 text-purple-800 border-purple-300', icon: '🌟' },
  plan_due: { label: 'Plan Due', badge: 'bg-blue-100 text-blue-800 border-blue-300', icon: '📋' },
};

const PRIORITY_COLORS: Record<number, string> = {
  1: 'border-l-red-500',
  2: 'border-l-amber-400',
  3: 'border-l-purple-400',
  4: 'border-l-blue-400',
};

export default function CoordinatorPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Coordinator Console</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Members ranked by attention priority — highest first
          </p>
        </div>
        <Link href="/" className="text-sm text-purple-600 hover:text-purple-800 transition-colors">
          ← Member list
        </Link>
      </div>

      {/* Queue */}
      {attentionQueue.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-slate-400 text-sm">No members require attention right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {attentionQueue.map((entry, idx) => {
            const memberName = MEMBER_MAP[entry.member_id] ?? entry.member_id;
            const scenarioId = SCENARIO_MAP[entry.member_id];
            const config = CATEGORY_CONFIG[entry.category];
            const borderColor = PRIORITY_COLORS[entry.priority] ?? 'border-l-slate-300';

            return (
              <div
                key={entry.member_id}
                className={`bg-white rounded-xl border border-slate-200 border-l-4 ${borderColor} p-4 sm:p-5`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  {/* Rank badge */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600">
                    {idx + 1}
                  </div>

                  {/* Member info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800 text-sm">{memberName}</span>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${config.badge}`}>
                        <span aria-hidden="true">{config.icon}</span>
                        {config.label}
                      </span>
                      <span className="text-xs text-slate-400">Priority {entry.priority}</span>
                    </div>

                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                      {entry.lastCheckIn && (
                        <span>Last check-in: week {entry.lastCheckIn.week}</span>
                      )}
                      {entry.carePlan && (
                        <span>Plan: {entry.carePlan.recommendations.length} recs · v{entry.carePlan.version}</span>
                      )}
                      {entry.openEscalation && (
                        <span className="text-red-600 font-medium">
                          Open escalation: {entry.openEscalation.severity}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action link */}
                  {scenarioId && (
                    <Link
                      href={`/demo/${scenarioId}`}
                      className="flex-shrink-0 text-xs font-medium text-purple-600 hover:text-purple-800 transition-colors whitespace-nowrap"
                    >
                      View plan →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Priority legend */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Priority legend
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.entries(CATEGORY_CONFIG) as [AttentionCategory, typeof CATEGORY_CONFIG[AttentionCategory]][]).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-2 text-xs text-slate-600">
              <span aria-hidden="true">{cfg.icon}</span>
              <span className="font-medium">{cfg.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
