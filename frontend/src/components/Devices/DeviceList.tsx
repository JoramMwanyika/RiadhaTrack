import { useCallback, useState } from 'react';
import { Activity, Cpu, Radio, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePolling } from '../../hooks/usePolling';
import { getDevices, formatTime } from '../../api/client';
import type { Device } from '../../types';
import { relativeTime, safeFormatDate, cn } from '../../lib/utils';
import { Spinner } from '../ui/Spinner';
import { StatusDot } from '../ui/StatusDot';

type ConnectionState = 'online' | 'offline' | 'unknown';

function connectionState(value: boolean | undefined): ConnectionState {
  return value === true ? 'online' : value === false ? 'offline' : 'unknown';
}

export function DeviceList() {
  const { config } = useAuth();
  const interval = config?.refreshIntervalMs ?? 5000;
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      setDevices(await getDevices());
      setError(null);
      setLastRefresh(new Date());
    } catch (err: unknown) {
      setError(err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(fetchDevices, interval, true);

  const online = devices.filter((device) => device.status === 'online').length;
  const wifiOnline = devices.filter((device) => device.wifiConnected).length;
  const mqttOnline = devices.filter((device) => device.mqttConnected).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Device status</h1>
          <p className="mt-0.5 text-sm text-slate-400">Monitor every timing unit, its Wi-Fi link, and MQTT connection.</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span><span className="text-emerald-400">{online}</span> / {devices.length} online</span>
          {lastRefresh && <span className="flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Updated {relativeTime(lastRefresh.toISOString())}</span>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatusSummary icon={<Cpu />} label="Timing devices" value={`${online}/${devices.length}`} tone="brand" />
        <StatusSummary icon={<Wifi />} label="Wi-Fi connected" value={`${wifiOnline}/${devices.length}`} tone="sky" />
        <StatusSummary icon={<Radio />} label="MQTT connected" value={`${mqttOnline}/${devices.length}`} tone="emerald" />
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      {loading && devices.length === 0 ? <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div> : devices.length === 0 ? (
        <div className="card px-6 py-16 text-center"><Cpu className="mx-auto mb-3 h-10 w-10 text-slate-600" /><p className="text-slate-400">No timing devices have reported in yet.</p><p className="mt-1 text-xs text-slate-500">Turn on a configured device and connect it to MQTT to add it here.</p></div>
      ) : <div className="grid gap-5 lg:grid-cols-2">{devices.map((device) => <DeviceCard key={device.id} device={device} />)}</div>}
    </div>
  );
}

function StatusSummary({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'brand' | 'sky' | 'emerald' }) {
  const tones = { brand: 'text-brand-300 border-brand-400/25 bg-brand-400/10', sky: 'text-sky-300 border-sky-400/25 bg-sky-400/10', emerald: 'text-emerald-300 border-emerald-400/25 bg-emerald-400/10' };
  return <div className="card flex items-center gap-3 p-4"><div className={cn('flex h-10 w-10 items-center justify-center rounded-lg border', tones[tone])}>{icon}</div><div><div className="text-lg font-bold text-white">{value}</div><div className="text-xs text-slate-400">{label}</div></div></div>;
}

function DeviceCard({ device }: { device: Device }) {
  const wifi = connectionState(device.wifiConnected);
  const mqtt = connectionState(device.mqttConnected);
  const deviceStatus: ConnectionState = device.status === 'online' ? 'online' : device.status === 'offline' ? 'offline' : 'unknown';

  return (
    <article className="card overflow-hidden transition-colors hover:border-sky-600/80">
      <div className="flex items-start justify-between gap-3 border-b border-sky-900/70 px-5 py-4">
        <div className="min-w-0"><h2 className="truncate font-semibold text-white">{device.name}</h2><p className="mt-0.5 truncate font-mono text-xs text-slate-500">{device.id}</p></div>
        <ConnectionBadge label={deviceStatus === 'online' ? 'Online' : deviceStatus === 'offline' ? 'Offline' : 'Unknown'} state={deviceStatus} />
      </div>

      <div className="grid gap-4 p-5 sm:grid-cols-[11rem_1fr]">
        <DeviceIllustration online={deviceStatus === 'online'} />
        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <ConnectionTile icon={wifi === 'online' ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />} label="Wi-Fi" state={wifi} detail={device.wifiRssi != null ? `${device.wifiRssi} dBm` : undefined} />
            <ConnectionTile icon={<Radio className="h-4 w-4" />} label="MQTT" state={mqtt} />
          </div>
          <dl className="space-y-2 text-xs">
            <InfoRow label="Last seen" value={device.lastSeenAt ? relativeTime(device.lastSeenAt) : 'Never'} />
            {device.lastSeenAt && <InfoRow label="Reported" value={safeFormatDate(device.lastSeenAt, 'dd MMM HH:mm')} />}
            <InfoRow label="Firmware" value={device.firmwareVersion ? `v${device.firmwareVersion}` : 'Not reported'} mono />
          </dl>
        </div>
      </div>

      {device.lastResult && <div className="border-t border-sky-900/70 bg-slate-950/20 px-5 py-3"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs text-slate-400"><Activity className="h-3.5 w-3.5 text-brand-300" />Last result</span><span className="font-mono text-sm text-brand-300">{device.lastResult.timeFormatted || formatTime(device.lastResult.timeMs)}</span></div><div className="mt-1 text-xs text-slate-500">{device.lastResult.event}{device.lastResult.distance ? ` · ${device.lastResult.distance}m` : ''} · {safeFormatDate(device.lastResult.recordedAt, 'dd MMM HH:mm')}</div></div>}
    </article>
  );
}

function ConnectionBadge({ label, state }: { label: string; state: ConnectionState }) {
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', state === 'online' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : state === 'offline' ? 'border-red-400/25 bg-red-400/10 text-red-300' : 'border-amber-400/25 bg-amber-400/10 text-amber-300')}><StatusDot status={state} />{label}</span>;
}

function ConnectionTile({ icon, label, state, detail }: { icon: React.ReactNode; label: string; state: ConnectionState; detail?: string }) {
  const labelText = state === 'online' ? 'Connected' : state === 'offline' ? 'Disconnected' : 'Not reported';
  return <div className={cn('rounded-lg border p-2.5', state === 'online' ? 'border-emerald-400/25 bg-emerald-400/5' : state === 'offline' ? 'border-red-400/20 bg-red-400/5' : 'border-slate-700 bg-slate-900/50')}><div className="flex items-center gap-1.5 text-slate-300">{icon}<span className="font-medium">{label}</span></div><div className={cn('mt-1 text-xs', state === 'online' ? 'text-emerald-300' : state === 'offline' ? 'text-red-300' : 'text-slate-500')}>{labelText}{detail ? ` · ${detail}` : ''}</div></div>;
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex justify-between gap-4"><dt className="text-slate-500">{label}</dt><dd className={cn('truncate text-right text-slate-300', mono && 'font-mono')}>{value}</dd></div>;
}

function DeviceIllustration({ online }: { online: boolean }) {
  return <div className="relative flex min-h-36 items-center justify-center overflow-hidden rounded-xl border border-sky-700/60 bg-[radial-gradient(circle_at_50%_45%,rgba(30,118,177,.36),transparent_57%),linear-gradient(145deg,#061d3a,#020c1d)]"><div className={cn('absolute h-28 w-40 rotate-[-14deg] rounded-md border-2 bg-[#0c4f83] shadow-[0_10px_25px_rgba(0,0,0,.45)]', online ? 'border-sky-300/70' : 'border-slate-500/50')}><div className="absolute left-2 top-2 grid grid-cols-4 gap-1"><i className="h-2 w-2 rounded-sm bg-slate-950"/><i className="h-2 w-2 rounded-sm bg-slate-950"/><i className="h-2 w-2 rounded-sm bg-slate-950"/><i className="h-2 w-2 rounded-sm bg-slate-950"/></div><div className="absolute right-3 top-3 h-12 w-16 rounded-sm border border-slate-950/70 bg-slate-800 p-1"><div className="h-full w-full rounded-[2px] bg-[#112943]"/></div><div className="absolute bottom-3 left-4 h-4 w-4 rounded-full border border-brand-300/50 bg-brand-400/50"/><div className="absolute bottom-3 left-10 h-4 w-4 rounded-full border border-red-300/40 bg-red-400/50"/><div className="absolute bottom-3 right-3 flex gap-1">{[0, 1, 2, 3].map((pin) => <i key={pin} className="h-5 w-1 rounded bg-amber-300"/>)}</div></div><span className="absolute bottom-3 text-[10px] font-semibold uppercase tracking-[.18em] text-sky-200/80">ESP32 timing unit</span></div>;
}
