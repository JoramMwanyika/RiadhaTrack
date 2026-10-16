import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearCredentials,
  getDashboardConfig,
  isAuthenticated,
  loadCredentialsFromSession,
  loginAccount,
  registerAccount,
  setToken,
} from '../api/client';
import type { DashboardConfig } from '../types';

interface AuthState {
  isLoggedIn: boolean;
  isLoading: boolean;
  config: DashboardConfig | null;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshConfig: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshConfig = useCallback(async () => {
    try {
      const cfg = await getDashboardConfig();
      setConfig(cfg);
      setError(null);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Failed to load dashboard config';
      setError(msg);
      if (
        err &&
        typeof err === 'object' &&
        'status' in err &&
        ((err as { status: number }).status === 401 ||
          (err as { status: number }).status === 403)
      ) {
        clearCredentials();
        setIsLoggedIn(false);
        setConfig(null);
      }
      throw err;
    }
  }, []);

  // Bootstrap from session
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hasCreds = loadCredentialsFromSession();
      if (hasCreds && isAuthenticated()) {
        try {
          await refreshConfig();
          if (!cancelled) setIsLoggedIn(true);
        } catch {
          if (!cancelled) {
            setIsLoggedIn(false);
            clearCredentials();
          }
        }
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshConfig]);

  const login = useCallback(
    async (username: string, password: string) => {
      setError(null);
      try {
        const session = await loginAccount(username, password);
        setToken(session.access_token);
        await refreshConfig();
        setIsLoggedIn(true);
      } catch (err: unknown) {
        clearCredentials();
        setIsLoggedIn(false);
        const msg =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: string }).message)
            : 'Login failed';
        setError(msg);
        throw err;
      }
    },
    [refreshConfig]
  );

  const register = useCallback(async (username: string, password: string) => {
    setError(null);
    try {
      const session = await registerAccount(username, password);
      setToken(session.access_token);
      await refreshConfig();
      setIsLoggedIn(true);
    } catch (err: unknown) {
      clearCredentials();
      setIsLoggedIn(false);
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Registration failed';
      setError(msg);
      throw err;
    }
  }, [refreshConfig]);

  const logout = useCallback(() => {
    clearCredentials();
    setIsLoggedIn(false);
    setConfig(null);
    setError(null);
  }, []);

  const value = useMemo(
    () => ({
      isLoggedIn,
      isLoading,
      config,
      error,
      login,
      register,
      logout,
      refreshConfig,
    }),
    [isLoggedIn, isLoading, config, error, login, register, logout, refreshConfig]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
