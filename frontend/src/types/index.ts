/** Core domain types for RiadhaTrac frontend */

export interface DashboardConfig {
  refreshIntervalMs: number;
  mqttTopicTemplates?: Record<string, string>;
  features?: {
    canCreateAthletes?: boolean;
    canEditResults?: boolean;
    canExport?: boolean;
  };
  user?: {
    username: string;
    role: 'admin' | 'coach' | 'viewer';
  };
}

export interface Athlete {
  id: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other' | 'unspecified';
  school?: string;
  club?: string;
  category?: string;
  consentStatus: 'granted' | 'pending' | 'revoked' | 'unknown';
  sharingStatus: 'shared' | 'private' | 'restricted';
  createdAt: string;
  updatedAt?: string;
  notes?: string;
}

export interface AthleteSummary extends Athlete {
  bestResult?: ResultSummary;
  latestResult?: ResultSummary;
  resultCount?: number;
}

export interface Result {
  id: string;
  athleteId: string;
  athleteName?: string;
  event: string;
  distance?: number; // meters
  protocol?: string;
  category?: string;
  timeMs: number;
  timeFormatted?: string;
  deviceId?: string;
  deviceName?: string;
  recordedAt: string;
  quality: 'official' | 'prototype' | 'unverified' | 'manual';
  school?: string;
  club?: string;
  notes?: string;
}

export interface ResultSummary {
  id: string;
  event: string;
  distance?: number;
  timeMs: number;
  timeFormatted?: string;
  recordedAt: string;
  quality: Result['quality'];
}

export interface Device {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'unknown';
  lastSeenAt?: string;
  firmwareVersion?: string;
  lastResult?: ResultSummary;
  batteryPercent?: number;
  location?: string;
}

export interface DashboardSummary {
  athleteCount: number;
  testsToday: number;
  recentResults: Result[];
  devicesOnline: number;
  devicesTotal: number;
  pendingSyncCount?: number;
  lastUpdated: string;
}

export interface ResultsFilter {
  athleteId?: string;
  athleteQuery?: string;
  event?: string;
  distance?: number;
  dateFrom?: string;
  dateTo?: string;
  school?: string;
  club?: string;
  deviceId?: string;
  quality?: Result['quality'];
  limit?: number;
  offset?: number;
}

export interface CreateAthletePayload {
  athleteId?: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: Athlete['gender'];
  school?: string;
  club?: string;
  category?: string;
  consentStatus?: Athlete['consentStatus'];
  notes?: string;
}

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}
