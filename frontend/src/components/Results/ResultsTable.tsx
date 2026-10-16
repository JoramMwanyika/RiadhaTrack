import { useCallback, useMemo, useState } from 'react';
import { Filter, GitCompare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePolling } from '../../hooks/usePolling';
import {
  getResults,
  formatTime,
  qualityClass,
  qualityLabel,
} from '../../api/client';
import type { Result, ResultsFilter } from '../../types';
import { cn, safeFormatDate } from '../../lib/utils';
import { Spinner } from '../ui/Spinner';
import { ResultCompare } from './ResultCompare';

const EMPTY_FILTERS: ResultsFilter = {
  athleteQuery: '',
  event: '',
  distance: undefined,
  dateFrom: '',
  dateTo: '',
  school: '',
  club: '',
  deviceId: '',
};

export function ResultsTable() {
  const { config } = useAuth();
  const interval = config?.refreshIntervalMs ?? 5000;

  const [results, setResults] = useState<Result[]>([]);
  const [filters, setFilters] = useState<ResultsFilter>({ ...EMPTY_FILTERS });
  const [applied, setApplied] = useState<ResultsFilter>({ ...EMPTY_FILTERS });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);

  const fetchResults = useCallback(async () => {
    try {
      const data = await getResults({
        ...applied,
        limit: 200,
      });
      setResults(data);
      setError(null);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Failed to load results';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [applied]);

  usePolling(fetchResults, interval, true);

  function applyFilters() {
    setApplied({ ...filters });
    setLoading(true);
  }

  function resetFilters() {
    setFilters({ ...EMPTY_FILTERS });
    setApplied({ ...EMPTY_FILTERS });
    setLoading(true);
  }

  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedForCompare = useMemo(
    () => results.filter((r) => compareIds.has(r.id)),
    [results, compareIds]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Results
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Filter and compare performance data · auto-refresh{' '}
            {Math.round(interval / 1000)}s
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            onClick={() => setShowFilters((s) => !s)}
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
          {compareIds.size >= 2 && (
            <button
              className="btn-primary"
              onClick={() => setShowCompare(true)}
            >
              <GitCompare className="h-4 w-4" />
              Compare ({compareIds.size})
            </button>
          )}
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="card p-5 space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="label">Athlete</label>
              <input
                className="input"
                placeholder="Name search"
                value={filters.athleteQuery ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, athleteQuery: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="label">Event</label>
              <input
                className="input"
                placeholder="e.g. 100m, 800m"
                value={filters.event ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, event: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="label">Distance (m)</label>
              <input
                type="number"
                className="input"
                placeholder="e.g. 100"
                value={filters.distance ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    distance: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  }))
                }
              />
            </div>
            <div>
              <label className="label">Date from</label>
              <input
                type="date"
                className="input"
                value={filters.dateFrom ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, dateFrom: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="label">Date to</label>
              <input
                type="date"
                className="input"
                value={filters.dateTo ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, dateTo: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="label">School</label>
              <input
                className="input"
                value={filters.school ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, school: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="label">Club</label>
              <input
                className="input"
                value={filters.club ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, club: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="label">Device ID</label>
              <input
                className="input"
                value={filters.deviceId ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, deviceId: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={applyFilters}>
              Apply filters
            </button>
            <button className="btn-secondary" onClick={resetFilters}>
              Reset
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && results.length === 0 ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="table-header w-10">
                    <span className="sr-only">Compare</span>
                  </th>
                  <th className="table-header">Athlete</th>
                  <th className="table-header">Event</th>
                  <th className="table-header">Distance</th>
                  <th className="table-header">Time</th>
                  <th className="table-header">Quality</th>
                  <th className="table-header">School / Club</th>
                  <th className="table-header">Device</th>
                  <th className="table-header">Date</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="table-cell text-center text-slate-500 py-12"
                    >
                      No results match the current filters
                    </td>
                  </tr>
                ) : (
                  results.map((r) => (
                    <tr
                      key={r.id}
                      className={cn(
                        'border-b border-slate-800/50 hover:bg-slate-800/30',
                        compareIds.has(r.id) && 'bg-brand-950/40'
                      )}
                    >
                      <td className="table-cell">
                        <input
                          type="checkbox"
                          checked={compareIds.has(r.id)}
                          onChange={() => toggleCompare(r.id)}
                          className="rounded border-slate-600 bg-surface-900 text-brand-500 focus:ring-brand-500"
                          title="Select for comparison"
                        />
                      </td>
                      <td className="table-cell font-medium">
                        {r.athleteName || r.athleteId}
                      </td>
                      <td className="table-cell">{r.event}</td>
                      <td className="table-cell">
                        {r.distance ? `${r.distance} m` : '—'}
                      </td>
                      <td className="table-cell font-mono text-brand-300">
                        {r.timeFormatted || formatTime(r.timeMs)}
                      </td>
                      <td className="table-cell">
                        <span className={cn('badge', qualityClass(r.quality))}>
                          {qualityLabel(r.quality)}
                        </span>
                      </td>
                      <td className="table-cell text-slate-400 text-xs">
                        {[r.school, r.club].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="table-cell text-slate-400 text-xs">
                        {r.deviceName || r.deviceId || '—'}
                      </td>
                      <td className="table-cell text-slate-400">
                        {safeFormatDate(r.recordedAt, 'dd MMM yyyy HH:mm')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCompare && selectedForCompare.length >= 2 && (
        <ResultCompare
          results={selectedForCompare}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  );
}
