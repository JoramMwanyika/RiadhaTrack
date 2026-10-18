import type { Athlete, AthleteSummary, CreateAthletePayload, DashboardConfig, DashboardSummary, Device, Result, ResultsFilter } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';
let authToken: string | null = null;

type ApiAthlete = { athlete_id: string; display_name: string; age_group?: string | null; school_club?: string | null; preferred_event?: string | null; consent_status: 'pending' | 'granted' | 'withdrawn'; created_at: string };
type ApiResult = { result_id: string; athlete_id: string; device_id: string; event: string; distance_m: number; elapsed_ms: number; quality: Result['quality']; received_at: string };
type ApiDevice = { device_id: string; label?: string | null; firmware_version?: string | null; last_seen_at?: string | null; status: Device['status'] };
export type PendingResult = { result_id: string; athlete_id: string; device_id: string; event: string; distance_m: number; elapsed_ms: number; quality: Result['quality']; received_at: string };

function normalizeAthlete(a: ApiAthlete): AthleteSummary {
  return { id: a.athlete_id, displayName: a.display_name, firstName: a.display_name, lastName: '', category: a.age_group ?? undefined, school: a.school_club ?? undefined, club: undefined, consentStatus: a.consent_status === 'withdrawn' ? 'revoked' : a.consent_status, sharingStatus: 'private', createdAt: a.created_at };
}
function normalizeResult(r: ApiResult): Result {
  return { id: r.result_id, athleteId: r.athlete_id, event: r.event, distance: r.distance_m, timeMs: r.elapsed_ms, deviceId: r.device_id, recordedAt: r.received_at, quality: r.quality };
}
function normalizeDevice(d: ApiDevice): Device {
  return { id: d.device_id, name: d.label || d.device_id, status: d.status, lastSeenAt: d.last_seen_at ?? undefined, firmwareVersion: d.firmware_version ?? undefined };
}

export function setToken(token: string) { authToken = token; sessionStorage.setItem('rt_token', token); }
export function clearCredentials() { authToken = null; sessionStorage.removeItem('rt_token'); }
export function loadCredentialsFromSession() { authToken = sessionStorage.getItem('rt_token'); return !!authToken; }
export function isAuthenticated() { return !!authToken; }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!authToken) throw { message: 'Not authenticated', status: 401 };
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { Accept: 'application/json', Authorization: `Bearer ${authToken}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  if (response.status === 401 || response.status === 403) { clearCredentials(); throw { message: 'Authentication failed or expired', status: response.status }; }
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw { message: body.detail || body.message || response.statusText, status: response.status }; }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export async function loginAccount(username: string, password: string) {
  const response = await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ username, password }) });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw { message: body.detail || 'Unable to sign in', status: response.status }; }
  return response.json() as Promise<{ access_token: string; user: { username: string; role: 'admin' | 'coach' | 'viewer' } }>;
}
export async function registerAccount(username: string, password: string) {
  const response = await fetch(`${API_BASE}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ username, password }) });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw { message: body.detail || 'Unable to create account', status: response.status }; }
  return response.json() as Promise<{ access_token: string; user: { username: string; role: 'admin' | 'coach' | 'viewer' } }>;
}

export async function getDashboardConfig(): Promise<DashboardConfig> {
  const [config, user] = await Promise.all([request<{ poll_interval_seconds?: number }>('/dashboard-config'), request<{ username: string; role: 'admin' | 'coach' | 'viewer' }>('/auth/me')]);
  return { refreshIntervalMs: (config.poll_interval_seconds ?? 5) * 1000, user, features: { canCreateAthletes: true, canEditResults: false, canExport: false } };
}
export async function getDashboardSummary(): Promise<DashboardSummary> { const [athletes, recentResults, devices] = await Promise.all([getAthletes(), getResults(), getDevices()]); return { athleteCount: athletes.length, testsToday: recentResults.filter(r => r.recordedAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length, recentResults: recentResults.slice(0, 8), devicesOnline: devices.filter(d => d.status === 'online').length, devicesTotal: devices.length, lastUpdated: new Date().toISOString() }; }
export async function getAthletes(params?: { query?: string; limit?: number }): Promise<AthleteSummary[]> { const q = params?.query ? `?query=${encodeURIComponent(params.query)}` : ''; return (await request<ApiAthlete[]>(`/athletes${q}`)).slice(0, params?.limit ?? Infinity).map(normalizeAthlete); }
export async function getAthlete(id: string): Promise<Athlete> { return normalizeAthlete(await request<ApiAthlete>(`/athletes/${id}`)); }
export async function createAthlete(payload: CreateAthletePayload): Promise<Athlete> { const displayName = [payload.firstName, payload.lastName].filter(Boolean).join(' ').trim(); const athleteId = payload.athleteId?.trim() || `${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'athlete'}-${Date.now().toString().slice(-6)}`; return normalizeAthlete(await request<ApiAthlete>('/athletes', { method: 'POST', body: JSON.stringify({ athlete_id: athleteId, display_name: displayName, age_group: payload.category || null, school_club: [payload.school, payload.club].filter(Boolean).join(' · ') || null, preferred_event: null, consent_status: payload.consentStatus === 'revoked' || payload.consentStatus === 'unknown' ? 'pending' : payload.consentStatus }) })); }
export async function deleteAthlete(id: string): Promise<void> { await request<void>(`/athletes/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
export async function getAthleteResults(id: string): Promise<Result[]> { return (await request<ApiResult[]>(`/athletes/${id}/results`)).map(normalizeResult); }
export async function getResults(filters: ResultsFilter = {}): Promise<Result[]> { const search = new URLSearchParams(); if (filters.event) search.set('event', filters.event); if (filters.distance) search.set('distance_m', String(filters.distance)); if (filters.athleteId) search.set('athlete_id', filters.athleteId); if (filters.deviceId) search.set('device_id', filters.deviceId); if (filters.dateFrom) search.set('from', filters.dateFrom); if (filters.dateTo) search.set('to', filters.dateTo); const results = (await request<ApiResult[]>(`/results${search.size ? `?${search}` : ''}`)).map(normalizeResult); return results.slice(0, filters.limit ?? Infinity); }
export async function getPendingResults(): Promise<PendingResult[]> { return request<PendingResult[]>('/pending-results'); }
export async function acceptPendingResult(id: string): Promise<void> { await request<void>(`/pending-results/${encodeURIComponent(id)}/accept`, { method: 'POST' }); }
export async function rejectPendingResult(id: string): Promise<void> { await request<void>(`/pending-results/${encodeURIComponent(id)}/reject`, { method: 'POST' }); }
export async function getDevices(): Promise<Device[]> {
  const [devices, results] = await Promise.all([request<ApiDevice[]>('/devices'), getResults({ limit: 500 })]);
  return devices.map(normalizeDevice).map(device => ({ ...device, lastResult: results.find(result => result.deviceId === device.id) }));
}
export function formatTime(ms: number) { if (!Number.isFinite(ms) || ms < 0) return '—'; const seconds = ms / 1000; return seconds < 60 ? `${seconds.toFixed(2)}s` : `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`; }
export function qualityLabel(q: Result['quality']) { return q === 'official' ? 'Official' : q === 'manual' ? 'Manual' : 'Unverified'; }
export function qualityClass(q: Result['quality']) { return q === 'official' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'; }
