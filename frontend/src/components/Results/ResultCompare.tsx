import { X, AlertTriangle } from 'lucide-react';
import { formatTime, qualityClass, qualityLabel } from '../../api/client';
import type { Result } from '../../types';
import { cn, safeFormatDate } from '../../lib/utils';

interface Props {
  results: Result[];
  onClose: () => void;
}

/**
 * Comparison is only valid for equivalent results:
 * same event, distance, protocol, and category.
 */
function groupKey(r: Result): string {
  return [
    r.event ?? '',
    r.distance ?? '',
    r.protocol ?? '',
    r.category ?? '',
  ].join('|');
}

export function ResultCompare({ results, onClose }: Props) {
  // Group by equivalence key
  const groups = new Map<string, Result[]>();
  for (const r of results) {
    const key = groupKey(r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const comparableGroups = [...groups.entries()].filter(
    ([, items]) => items.length >= 2
  );
  const nonComparable = results.filter((r) => {
    const key = groupKey(r);
    return (groups.get(key)?.length ?? 0) < 2;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 sticky top-0 bg-surface-900/95 backdrop-blur">
          <h2 className="text-lg font-semibold text-white">
            Compare results
          </h2>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <p className="text-sm text-slate-400">
            Only results that share the same event, distance, protocol and
            category can be compared. Prototype / unverified timings are clearly
            labelled and are not official.
          </p>

          {comparableGroups.length === 0 && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-sm text-amber-200 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              None of the selected results are equivalent. Select at least two
              results with matching event, distance, protocol and category.
            </div>
          )}

          {comparableGroups.map(([key, items]) => {
            const sample = items[0];
            const sorted = [...items].sort((a, b) => a.timeMs - b.timeMs);
            const best = sorted[0];

            return (
              <div key={key} className="space-y-3">
                <div className="text-sm font-medium text-slate-200">
                  {sample.event}
                  {sample.distance ? ` · ${sample.distance} m` : ''}
                  {sample.protocol ? ` · ${sample.protocol}` : ''}
                  {sample.category ? ` · ${sample.category}` : ''}
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-800">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-800/50">
                        <th className="table-header">Athlete</th>
                        <th className="table-header">Time</th>
                        <th className="table-header">Δ vs best</th>
                        <th className="table-header">Quality</th>
                        <th className="table-header">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r) => {
                        const delta = r.timeMs - best.timeMs;
                        const isBest = r.id === best.id;
                        return (
                          <tr
                            key={r.id}
                            className={cn(
                              'border-t border-slate-800/80',
                              isBest && 'bg-emerald-500/5'
                            )}
                          >
                            <td className="table-cell font-medium">
                              {r.athleteName || r.athleteId}
                            </td>
                            <td className="table-cell font-mono text-brand-300">
                              {r.timeFormatted || formatTime(r.timeMs)}
                              {isBest && (
                                <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-400">
                                  best
                                </span>
                              )}
                            </td>
                            <td className="table-cell font-mono text-slate-400">
                              {isBest
                                ? '—'
                                : `+${(delta / 1000).toFixed(2)} s`}
                            </td>
                            <td className="table-cell">
                              <span
                                className={cn('badge', qualityClass(r.quality))}
                              >
                                {qualityLabel(r.quality)}
                              </span>
                            </td>
                            <td className="table-cell text-slate-400">
                              {safeFormatDate(r.recordedAt, 'dd MMM yyyy')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {nonComparable.length > 0 && (
            <div className="pt-2 border-t border-slate-800">
              <p className="text-xs text-slate-500 mb-2">
                Selected but not comparable (different event / distance /
                protocol / category):
              </p>
              <ul className="text-sm text-slate-400 space-y-1">
                {nonComparable.map((r) => (
                  <li key={r.id}>
                    {r.athleteName || r.athleteId} — {r.event}
                    {r.distance ? ` ${r.distance}m` : ''} (
                    {r.timeFormatted || formatTime(r.timeMs)})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
