import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Shield, Share2, AlertTriangle } from 'lucide-react';
import { usePolling } from '../../hooks/usePolling';
import {
  getAthlete,
  getAthleteResults,
  formatTime,
  qualityClass,
  qualityLabel,
} from '../../api/client';
import type { Athlete, Result } from '../../types';
import {
  athleteDisplayName,
  cn,
  safeFormatDate,
} from '../../lib/utils';
import { Spinner } from '../ui/Spinner';

export function AthleteProfile() {
  const { id } = useParams<{ id: string }>();
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [a, r] = await Promise.all([
        getAthlete(id),
        getAthleteResults(id),
      ]);
      setAthlete(a);
      setResults(r);
      setError(null);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Failed to load athlete';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  usePolling(load, 10000, !!id);

  if (loading && !athlete) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error && !athlete) {
    return (
      <div className="space-y-4">
        <Link to="/athletes" className="btn-ghost text-sm">
          <ArrowLeft className="h-4 w-4" /> Back to athletes
        </Link>
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-red-300">
          {error}
        </div>
      </div>
    );
  }

  if (!athlete) return null;

  const consentOk = athlete.consentStatus === 'granted';
  const sorted = [...results].sort(
    (a, b) =>
      new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
  );
  const bestByEvent = new Map<string, Result>();
  for (const r of results) {
    const key = `${r.event}|${r.distance ?? ''}|${r.protocol ?? ''}|${r.category ?? ''}`;
    const existing = bestByEvent.get(key);
    if (!existing || r.timeMs < existing.timeMs) {
      bestByEvent.set(key, r);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        to="/athletes"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" /> Back to athletes
      </Link>

      {/* Header card */}
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {athleteDisplayName(athlete)}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
              {athlete.school && <span>{athlete.school}</span>}
              {athlete.club && <span>{athlete.club}</span>}
              {athlete.category && (
                <span className="text-slate-300">{athlete.category}</span>
              )}
              {athlete.dateOfBirth && (
                <span>Born {safeFormatDate(athlete.dateOfBirth, 'dd MMM yyyy')}</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span
              className={cn(
                'badge border flex items-center gap-1.5',
                consentOk
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
              )}
            >
              <Shield className="h-3.5 w-3.5" />
              Consent: {athlete.consentStatus}
            </span>
            <span className="badge border border-slate-600 bg-slate-800/50 text-slate-300 flex items-center gap-1.5">
              <Share2 className="h-3.5 w-3.5" />
              {athlete.sharingStatus}
            </span>
          </div>
        </div>

        {!consentOk && (
          <div className="mt-4 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-sm text-amber-200 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              Consent is not granted. Display and export of detailed information
              may be restricted. Confirm consent status before sharing or
              publishing results.
            </div>
          </div>
        )}
      </div>

      {/* Best results */}
      {bestByEvent.size > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="font-semibold text-white">Best results</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Best time per event · distance · protocol · category
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800/80">
                  <th className="table-header">Event</th>
                  <th className="table-header">Distance</th>
                  <th className="table-header">Protocol</th>
                  <th className="table-header">Category</th>
                  <th className="table-header">Time</th>
                  <th className="table-header">Quality</th>
                  <th className="table-header">Date</th>
                </tr>
              </thead>
              <tbody>
                {[...bestByEvent.values()].map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-800/50"
                  >
                    <td className="table-cell font-medium">{r.event}</td>
                    <td className="table-cell">
                      {r.distance ? `${r.distance} m` : '—'}
                    </td>
                    <td className="table-cell">{r.protocol || '—'}</td>
                    <td className="table-cell">{r.category || '—'}</td>
                    <td className="table-cell font-mono text-brand-300">
                      {r.timeFormatted || formatTime(r.timeMs)}
                    </td>
                    <td className="table-cell">
                      <span className={cn('badge', qualityClass(r.quality))}>
                        {qualityLabel(r.quality)}
                      </span>
                    </td>
                    <td className="table-cell text-slate-400">
                      {safeFormatDate(r.recordedAt, 'dd MMM yyyy')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full history */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white">Performance history</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {results.length} result{results.length !== 1 ? 's' : ''} · newest
            first
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800/80">
                <th className="table-header">Date</th>
                <th className="table-header">Event</th>
                <th className="table-header">Distance</th>
                <th className="table-header">Time</th>
                <th className="table-header">Quality</th>
                <th className="table-header">Device</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="table-cell text-center text-slate-500 py-10"
                  >
                    No results recorded for this athlete
                  </td>
                </tr>
              ) : (
                sorted.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30"
                  >
                    <td className="table-cell text-slate-400">
                      {safeFormatDate(r.recordedAt)}
                    </td>
                    <td className="table-cell font-medium">{r.event}</td>
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
                    <td className="table-cell text-slate-400">
                      {r.deviceName || r.deviceId || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
