'use client';

import { useState, useRef } from 'react';
import { handleCheckIn, type CheckInResult } from './actions';

const SEVERITY_LEVELS = [
  { value: 'none', label: 'None' },
  { value: 'mild', label: 'Mild' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'marked', label: 'Marked' },
] as const;

const SEVERITY_COLORS: Record<string, string> = {
  none: 'bg-green-50 border-green-300 text-green-800',
  low: 'bg-blue-50 border-blue-300 text-blue-800',
  medium: 'bg-amber-50 border-amber-300 text-amber-800',
  high: 'bg-red-50 border-red-300 text-red-800',
};

function ResultPanel({ result }: { result: CheckInResult }) {
  if (!result) return null;
  const colorClass = SEVERITY_COLORS[result.severity_level] ?? SEVERITY_COLORS.none!;
  return (
    <div className={`mt-4 rounded-lg border p-4 ${colorClass}`}>
      <p className="font-semibold text-sm mb-1">
        Check-in recorded — severity: <span className="uppercase">{result.severity_level}</span>
      </p>
      {result.escalations > 0 && (
        <p className="text-sm">
          {result.escalations} escalation{result.escalations > 1 ? 's' : ''} flagged for coordinator review.
        </p>
      )}
      {result.flags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {result.flags.map(f => (
            <span
              key={f}
              className="px-2 py-0.5 text-xs font-mono rounded-full bg-white/60 border border-current"
            >
              {f.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}
      {result.severity_level === 'none' && (
        <p className="text-sm mt-1">All clear — no flags detected.</p>
      )}
    </div>
  );
}

export default function CheckInForm({ scenarioId }: { scenarioId: string }) {
  const [mood1, setMood1] = useState(3);
  const [mood2, setMood2] = useState(3);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      const formData = new FormData(e.currentTarget);
      const res = await handleCheckIn(formData);
      setResult(res);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6">
      <h2 className="text-base font-semibold text-slate-800 mb-4">Submit a Check-In</h2>
      <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
        <input type="hidden" name="scenario" value={scenarioId} />

        {/* Mood sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Energy mood</span>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="range"
                name="mood1"
                min={1}
                max={5}
                step={1}
                value={mood1}
                onChange={e => setMood1(Number(e.target.value))}
                className="flex-1 accent-purple-600"
              />
              <span className="w-6 text-center text-sm font-bold text-purple-700">{mood1}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-0.5">
              <span>Low</span><span>High</span>
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Emotional mood</span>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="range"
                name="mood2"
                min={1}
                max={5}
                step={1}
                value={mood2}
                onChange={e => setMood2(Number(e.target.value))}
                className="flex-1 accent-purple-600"
              />
              <span className="w-6 text-center text-sm font-bold text-purple-700">{mood2}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-0.5">
              <span>Low</span><span>High</span>
            </div>
          </label>
        </div>

        {/* Severity */}
        <fieldset>
          <legend className="text-sm font-medium text-slate-700 mb-2">Top symptom severity</legend>
          <div className="flex flex-wrap gap-2">
            {SEVERITY_LEVELS.map(s => (
              <label
                key={s.value}
                className="flex items-center gap-1.5 cursor-pointer text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:border-purple-400 transition-colors has-[:checked]:border-purple-600 has-[:checked]:bg-purple-50"
              >
                <input
                  type="radio"
                  name="severity"
                  value={s.value}
                  defaultChecked={s.value === 'none'}
                  className="accent-purple-600"
                />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Meds */}
        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="checkbox" name="meds" className="accent-purple-600 w-4 h-4" />
          Medications taken today
        </label>

        {/* Submit */}
        <button
          type="submit"
          disabled={pending}
          className="w-full sm:w-auto bg-purple-700 hover:bg-purple-600 disabled:opacity-60 text-white font-medium text-sm px-6 py-2.5 rounded-lg transition-colors"
        >
          {pending ? 'Analysing…' : 'Submit check-in'}
        </button>
      </form>

      {result !== null && <ResultPanel result={result} />}
    </div>
  );
}
