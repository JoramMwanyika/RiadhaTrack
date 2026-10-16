import { useEffect, useRef, useCallback } from 'react';

/**
 * Polls a callback at a fixed interval (default 5 s as per README).
 * Uses the interval returned by the backend when available.
 */
export function usePolling(
  callback: () => void | Promise<void>,
  intervalMs: number = 5000,
  enabled: boolean = true
) {
  const savedCallback = useRef(callback);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  const tick = useCallback(() => {
    void savedCallback.current();
  }, []);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    // Immediate first run
    tick();

    intervalRef.current = setInterval(tick, intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [intervalMs, enabled, tick]);
}
