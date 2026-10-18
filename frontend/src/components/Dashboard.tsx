import { useCallback, useState } from 'react';
import {
  Users,
  Timer,
  Cpu,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  BellRing,
  Check,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePolling } from '../hooks/usePolling';
import {
  getAthletes,
  getDevices,
  getResults,
  getPendingResults,
  acceptPendingResult,
  rejectPendingResult,
  formatTime,
  qualityClass,
  qualityLabel,
} from '../api/client';
import type { AthleteSummary, Device, Result } from '../types';
import type { PendingResult } from '../api/client';
import { safeFormatDate, relativeTime, athleteDisplayName, cn } from '../lib/utils';
import { Spinner } from './ui/Spinner';
import { StatusDot } from './ui/StatusDot';

export function Dashboard() {
  const { config } = useAuth();
  const interval = config?.refreshIntervalMs ?? 5000;

  const [athletes, setAthletes] = useState<AthleteSummary[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pendingResults, setPendingResults] = useState<PendingResult[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [a, r, d, pending] = await Promise.all([
        getAthletes({ limit: 50 }),
        getResults({ limit: 12 }),
        getDevices(),
        getPendingResults(),
      ]);
      setAthletes(a);
      setResults(r);
      setDevices(d);
      setPendingResults(pending);
      setError(null);
      setLastRefresh(new Date());
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Failed to load dashboard';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(fetchAll, interval, true);

  const today = new Date().toISOString().slice(0, 10);
  const testsToday = results.filter((r) => r.recordedAt.startsWith(today)).length;
  const onlineDevices = devices.filter((d) => d.status === 'online').length;

  async function reviewPending(result: PendingResult, decision: 'accept' | 'reject') {
    setReviewingId(result.result_id);
    try {
      if (decision === 'accept') await acceptPendingResult(result.result_id);
      else await rejectPendingResult(result.result_id);
      setPendingResults((items) => items.filter((item) => item.result_id !== result.result_id));
      await fetchAll();
    } catch (err: unknown) {
      setError(err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Could not review the incoming result');
    } finally {
      setReviewingId(null);
    }
  }

  if (loading && !lastRefresh) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Live overview · refreshes every {Math.round(interval / 1000)}s
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {lastRefresh && (
            <span className="flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Updated {relativeTime(lastRefresh.toISOString())}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {pendingResults.length > 0 && (
        <section className="rounded-xl border border-amber-400/40 bg-amber-400/10 shadow-[0_0_28px_rgba(251,191,36,.1)] overflow-hidden">
          <div className="px-5 py-4 flex items-center gap-3 border-b border-amber-400/20">
            <BellRing className="h-5 w-5 text-amber-300 shrink-0" />
            <div>
              <h2 className="font-semibold text-amber-100">Incoming test result{pendingResults.length === 1 ? '' : 's'} awaiting approval</h2>
              <p className="text-xs text-amber-200/75 mt-0.5">Accept to save the result and confirm the upload to the timing device.</p>
            </div>
          </div>
          <div className="divide-y divide-amber-400/15">
            {pendingResults.map((result) => (
              <div key={result.result_id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-white">Athlete {result.athlete_id} <span className="text-slate-400 font-normal">· {result.event} · {result.distance_m}m</span></div>
                  <div className="text-sm text-amber-100/90 mt-1 font-mono">{formatTime(result.elapsed_ms)} <span className="font-sans text-slate-400">from {result.device_id}</span></div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button disabled={reviewingId === result.result_id} onClick={() => void reviewPending(result, 'reject')} className="btn-ghost text-slate-300 hover:text-red-300 disabled:opacity-50"><X className="h-4 w-4" /> Reject</button>
                  <button disabled={reviewingId === result.result_id} onClick={() => void reviewPending(result, 'accept')} className="btn-primary disabled:opacity-50"><Check className="h-4 w-4" /> {reviewingId === result.result_id ? 'Saving…' : 'Accept & upload'}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Users className="h-5 w-5 text-brand-400" />}
          label="Athletes"
          value={athletes.length}
          href="/athletes"
        />
        <KpiCard
          icon={<Timer className="h-5 w-5 text-emerald-400" />}
          label="Tests today"
          value={testsToday}
          href="/results"
        />
        <KpiCard
          icon={<Cpu className="h-5 w-5 text-violet-400" />}
          label="Devices online"
          value={`${onlineDevices}/${devices.length}`}
          href="/devices"
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5 text-amber-400" />}
          label="Recent results"
          value={results.length}
          href="/results"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent results */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <h2 className="font-semibold text-white">Recent results</h2>
            <Link
              to="/results"
              className="text-xs text-brand-400 hover:text-brand-300"
            >
              View all →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800/80">
                  <th className="table-header">Athlete</th>
                  <th className="table-header">Event</th>
                  <th className="table-header">Time</th>
                  <th className="table-header">Quality</th>
                  <th className="table-header">When</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="table-cell text-center text-slate-500 py-8"
                    >
                      No results yet
                    </td>
                  </tr>
                ) : (
                  results.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30"
                    >
                      <td className="table-cell font-medium">
                        {r.athleteName || r.athleteId}
                      </td>
                      <td className="table-cell">
                        {r.event}
                        {r.distance ? ` · ${r.distance}m` : ''}
                      </td>
                      <td className="table-cell font-mono text-brand-300">
                        {r.timeFormatted || formatTime(r.timeMs)}
                      </td>
                      <td className="table-cell">
                        <span
                          className={cn(
                            'badge',
                            qualityClass(r.quality)
                          )}
                        >
                          {qualityLabel(r.quality)}
                        </span>
                      </td>
                      <td className="table-cell text-slate-400">
                        {safeFormatDate(r.recordedAt, 'dd MMM HH:mm')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Devices status */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <h2 className="font-semibold text-white">Devices</h2>
            <Link
              to="/devices"
              className="text-xs text-brand-400 hover:text-brand-300"
            >
              All devices →
            </Link>
          </div>
          <ul className="divide-y divide-slate-800/80">
            {devices.length === 0 ? (
              <li className="px-5 py-8 text-center text-sm text-slate-500">
                No devices registered
              </li>
            ) : (
              devices.slice(0, 6).map((d) => (
                <li
                  key={d.id}
                  className="px-5 py-3.5 flex items-start gap-3 hover:bg-slate-800/30"
                >
                  <StatusDot
                    status={
                      d.status === 'online'
                        ? 'online'
                        : d.status === 'offline'
                          ? 'offline'
                          : 'unknown'
                    }
                    className="mt-1.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-200 truncate">
                      {d.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {d.firmwareVersion && (
                        <span className="mr-2">v{d.firmwareVersion}</span>
                      )}
                      {d.lastSeenAt
                        ? relativeTime(d.lastSeenAt)
                        : 'never seen'}
                    </div>
                    {d.lastResult && (
                      <div className="text-xs text-slate-400 mt-1 font-mono">
                        Last:{' '}
                        {d.lastResult.timeFormatted ||
                          formatTime(d.lastResult.timeMs)}
                      </div>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      {/* Quick athlete list */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white">Athletes</h2>
          <Link
            to="/athletes"
            className="text-xs text-brand-400 hover:text-brand-300"
          >
            Manage →
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-800/50">
          {athletes.slice(0, 6).map((a) => (
            <Link
              key={a.id}
              to={`/athletes/${a.id}`}
              className="bg-surface-900 px-5 py-4 hover:bg-slate-800/60 transition-colors"
            >
              <div className="font-medium text-slate-100">
                {athleteDisplayName(a)}
              </div>
              <div className="text-xs font-mono text-brand-300 mt-1">
                ID: {a.id}
              </div>
              <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {a.school && <span>{a.school}</span>}
                {a.club && <span>{a.club}</span>}
                <span
                  className={cn(
                    'badge',
                    a.consentStatus === 'granted'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-amber-500/15 text-amber-400'
                  )}
                >
                  Consent: {a.consentStatus}
                </span>
              </div>
            </Link>
          ))}
          {athletes.length === 0 && (
            <div className="col-span-full px-5 py-8 text-center text-sm text-slate-500">
              No athletes yet — create one from the Athletes page.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  href: string;
}) {
  return (
    <Link
      to={href}
      className="card p-5 hover:border-brand-500/40 transition-colors group"
    >
      <div className="flex items-center justify-between">
        <div className="h-10 w-10 rounded-lg bg-slate-800/80 flex items-center justify-center group-hover:bg-slate-800">
          {icon}
        </div>
      </div>
      <div className="mt-4">
        <div className="text-2xl font-bold text-white tracking-tight">
          {value}
        </div>
        <div className="text-xs text-slate-400 mt-0.5">{label}</div>
      </div>
    </Link>
  );
}
