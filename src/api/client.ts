import type {
  Athlete,
  AthleteSummary,
  CreateAthletePayload,
  DashboardConfig,
  DashboardSummary,
  Device,
  Result,
  ResultsFilter,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

/** Store credentials only in memory / sessionStorage – never in source */
let authHeader: string | null = null;

export function setCredentials(username: string, password: string) {
  authHeader = 'Basic ' + btoa(`${username}:${password}`);
  sessionStorage.setItem('rt_auth', authHeader);
}

export function clearCredentials() {
  authHeader = null;
  sessionStorage.removeItem('rt_auth');
}

export function loadCredentialsFromSession(): boolean {
  const stored = sessionStorage.getItem('rt_auth');
  if (stored) {
    authHeader = stored;
    return true;
  }
  return false;
}

export function isAuthenticated(): boolean {
  return !!authHeader;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!authHeader) {
    throw { message: 'Not authenticated', status: 401 } as const;
  }

  const headers: HeadersInit = {
    Authorization: authHeader,
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 || res.status === 403) {
    clearCredentials();
    throw { message: 'Authentication failed or expired', status: res.status };
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message || body.error || message;
    } catch {
      /* ignore */
    }
    throw { message, status: res.status };
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// ---------- Public API helpers ----------

export async function getDashboardConfig(): Promise<DashboardConfig> {
  return request<DashboardConfig>('/dashboard-config');
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  // Backend may expose this as part of config or a dedicated endpoint.
  // For MVP we derive from existing endpoints if needed.
  const [athletes, results, devices] = await Promise.all([
    getAthletes({ limit: 1 }),
    getResults({ limit: 10 }),
    getDevices(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const testsToday = results.filter((r) =>
    r.recordedAt.startsWith(today)
  ).length;

  return {
    athleteCount: athletes.length, // note: if backend supports total count, prefer that
    testsToday,
    recentResults: results.slice(0, 8),
    devicesOnline: devices.filter((d) => d.status === 'online').length,
    devicesTotal: devices.length,
    lastUpdated: new Date().toISOString(),
  };
}

export async function getAthletes(params?: {
  query?: string;
  limit?: number;
}): Promise<AthleteSummary[]> {
  const search = new URLSearchParams();
  if (params?.query) search.set('query', params.query);
  if (params?.limit) search.set('limit', String(params.limit));
  const qs = search.toString();
  return request<AthleteSummary[]>(`/athletes${qs ? `?${qs}` : ''}`);
}

export async function getAthlete(id: string): Promise<Athlete> {
  return request<Athlete>(`/athletes/${id}`);
}

export async function createAthlete(
  payload: CreateAthletePayload
): Promise<Athlete> {
  return request<Athlete>('/athletes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getAthleteResults(id: string): Promise<Result[]> {
  return request<Result[]>(`/athletes/${id}/results`);
}

export async function getResults(
  filters: ResultsFilter = {}
): Promise<Result[]> {
  const search = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      search.set(k, String(v));
    }
  });
  const qs = search.toString();
  return request<Result[]>(`/results${qs ? `?${qs}` : ''}`);
}

export async function getDevices(): Promise<Device[]> {
  return request<Device[]>('/devices');
}

/** Format milliseconds to human-readable time (e.g. 12.34 or 1:23.45) */
export function formatTime(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) return '—';
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return totalSeconds.toFixed(2);
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}

export function qualityLabel(q: Result['quality']): string {
  switch (q) {
    case 'official':
      return 'Official';
    case 'prototype':
      return 'Prototype (unverified)';
    case 'unverified':
      return 'Unverified';
    case 'manual':
      return 'Manual entry';
    default:
      return String(q);
  }
}

export function qualityClass(q: Result['quality']): string {
  switch (q) {
    case 'official':
      return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    case 'prototype':
    case 'unverified':
      return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
    case 'manual':
      return 'bg-slate-500/15 text-slate-400 border border-slate-500/30';
    default:
      return 'bg-slate-500/15 text-slate-400';
  }
}
