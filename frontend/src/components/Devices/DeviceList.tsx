import { useCallback, useState } from 'react';
import { Cpu, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePolling } from '../../hooks/usePolling';
import { getDevices, formatTime } from '../../api/client';
import type { Device } from '../../types';
import { relativeTime, safeFormatDate, cn } from '../../lib/utils';
import { Spinner } from '../ui/Spinner';
import { StatusDot } from '../ui/StatusDot';

export function DeviceList() {
  const { config } = useAuth();
  const interval = config?.refreshIntervalMs ?? 5000;

  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const data = await getDevices();
      setDevices(data);
      setError(null);
      setLastRefresh(new Date());
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Failed to load devices';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(fetchDevices, interval, true);

  const online = devices.filter((d) => d.status === 'online').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Devices
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Timing device status · last-seen · firmware · last result
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <StatusDot status="online" />
            {online} online
          </span>
          <span>/ {devices.length} total</span>
          {lastRefresh && (
            <span className="flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              {relativeTime(lastRefresh.toISOString())}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && devices.length === 0 ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : devices.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <Cpu className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No devices registered</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {devices.map((d) => (
            <DeviceCard key={d.id} device={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeviceCard({ device: d }: { device: Device }) {
  const statusMap = {
    online: 'online' as const,
    offline: 'offline' as const,
    unknown: 'unknown' as const,
  };
  const status = statusMap[d.status] ?? 'unknown';

  return (
    <div className="card p-5 hover:border-slate-700 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
              status === 'online'
                ? 'bg-emerald-500/15 border border-emerald-500/30'
                : 'bg-slate-800 border border-slate-700'
            )}
          >
            <Cpu
              className={cn(
                'h-5 w-5',
                status === 'online' ? 'text-emerald-400' : 'text-slate-500'
              )}
            />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-white truncate">{d.name}</div>
            <div className="text-xs text-slate-500 font-mono truncate">
              {d.id}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusDot status={status} />
          <span
            className={cn(
              'text-xs capitalize',
              status === 'online' ? 'text-emerald-400' : 'text-slate-500'
            )}
          >
            {d.status}
          </span>
        </div>
      </div>

      <dl className="mt-4 space-y-2.5 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Last seen</dt>
          <dd className="text-slate-300 text-right">
            {d.lastSeenAt
              ? relativeTime(d.lastSeenAt)
              : 'never'}
          </dd>
        </div>
        {d.lastSeenAt && (
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Exact</dt>
            <dd className="text-slate-400 text-xs text-right">
              {safeFormatDate(d.lastSeenAt)}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Firmware</dt>
          <dd className="text-slate-300 font-mono">
            {d.firmwareVersion ? `v${d.firmwareVersion}` : '—'}
          </dd>
        </div>
        {d.batteryPercent != null && (
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Battery</dt>
            <dd
              className={cn(
                d.batteryPercent < 20
                  ? 'text-red-400'
                  : d.batteryPercent < 40
                    ? 'text-amber-400'
                    : 'text-slate-300'
              )}
            >
              {d.batteryPercent}%
            </dd>
          </div>
        )}
        {d.location && (
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Location</dt>
            <dd className="text-slate-300 text-right truncate max-w-[60%]">
              {d.location}
            </dd>
          </div>
        )}
        {d.lastResult && (
          <div className="pt-2 mt-2 border-t border-slate-800">
            <dt className="text-slate-500 text-xs mb-1">Last result</dt>
            <dd className="flex items-center justify-between">
              <span className="font-mono text-brand-300">
                {d.lastResult.timeFormatted ||
                  formatTime(d.lastResult.timeMs)}
              </span>
              <span className="text-xs text-slate-500">
                {safeFormatDate(d.lastResult.recordedAt, 'dd MMM HH:mm')}
              </span>
            </dd>
            <div className="text-xs text-slate-500 mt-0.5">
              {d.lastResult.event}
              {d.lastResult.distance ? ` · ${d.lastResult.distance}m` : ''}
            </div>
          </div>
        )}
      </dl>
    </div>
  );
}
