import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePolling } from '../../hooks/usePolling';
import { getAthletes } from '../../api/client';
import type { AthleteSummary } from '../../types';
import { athleteDisplayName, cn, safeFormatDate } from '../../lib/utils';
import { Spinner } from '../ui/Spinner';
import { AthleteForm } from './AthleteForm';

export function AthleteList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { config } = useAuth();
  const canCreate = config?.features?.canCreateAthletes !== false;

  const [athletes, setAthletes] = useState<AthleteSummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(searchParams.get('register') === '1');

  useEffect(() => {
    if (searchParams.get('register') === '1') setShowForm(true);
  }, [searchParams]);

  const fetchAthletes = useCallback(async () => {
    try {
      const data = await getAthletes({
        query: query.trim() || undefined,
        limit: 100,
      });
      setAthletes(data);
      setError(null);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Failed to load athletes';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [query]);

  // Poll less aggressively on list (10 s) + re-run on query change
  usePolling(fetchAthletes, 10000, true);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Athletes
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Search, view and register athletes
          </p>
        </div>
        {canCreate && (
          <button
            className="btn-primary"
            onClick={() => setShowForm(true)}
          >
            <Plus className="h-4 w-4" />
            New athlete
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          type="search"
          className="input pl-10"
          placeholder="Search by name, school or club…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLoading(true);
          }}
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && athletes.length === 0 ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="table-header">Name</th>
                  <th className="table-header">School / Club</th>
                  <th className="table-header">Category</th>
                  <th className="table-header">Consent</th>
                  <th className="table-header">Sharing</th>
                  <th className="table-header">Best / Latest</th>
                </tr>
              </thead>
              <tbody>
                {athletes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="table-cell text-center text-slate-500 py-12"
                    >
                      {query
                        ? 'No athletes match your search'
                        : 'No athletes registered yet'}
                    </td>
                  </tr>
                ) : (
                  athletes.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b border-slate-800/50 hover:bg-slate-800/40"
                    >
                      <td className="table-cell">
                        <Link
                          to={`/athletes/${a.id}`}
                          className="flex items-center gap-2.5 font-medium text-brand-300 hover:text-brand-200"
                        >
                          <span className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                            <User className="h-4 w-4 text-slate-400" />
                          </span>
                          {athleteDisplayName(a)}
                        </Link>
                      </td>
                      <td className="table-cell text-slate-400">
                        {[a.school, a.club].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="table-cell">{a.category || '—'}</td>
                      <td className="table-cell">
                        <ConsentBadge status={a.consentStatus} />
                      </td>
                      <td className="table-cell">
                        <span className="text-xs capitalize text-slate-400">
                          {a.sharingStatus}
                        </span>
                      </td>
                      <td className="table-cell text-xs text-slate-400">
                        {a.bestResult ? (
                          <div>
                            Best: {a.bestResult.timeFormatted || a.bestResult.timeMs + ' ms'}
                          </div>
                        ) : (
                          '—'
                        )}
                        {a.latestResult && (
                          <div className="mt-0.5">
                            Latest:{' '}
                            {safeFormatDate(
                              a.latestResult.recordedAt,
                              'dd MMM'
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <AthleteForm
          onClose={() => { setShowForm(false); setSearchParams({}); }}
          onCreated={() => {
            setShowForm(false); setSearchParams({});
            setLoading(true);
            void fetchAthletes();
          }}
        />
      )}
    </div>
  );
}

function ConsentBadge({ status }: { status: AthleteSummary['consentStatus'] }) {
  const styles: Record<string, string> = {
    granted: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    revoked: 'bg-red-500/15 text-red-400 border-red-500/30',
    unknown: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  };
  return (
    <span
      className={cn(
        'badge border capitalize',
        styles[status] ?? styles.unknown
      )}
    >
      {status}
    </span>
  );
}
