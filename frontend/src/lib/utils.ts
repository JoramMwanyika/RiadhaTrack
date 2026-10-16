import { clsx, type ClassValue } from 'clsx';
import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function safeFormatDate(
  value: string | undefined | null,
  pattern = 'dd MMM yyyy HH:mm'
): string {
  if (!value) return '—';
  try {
    const d = parseISO(value);
    if (!isValid(d)) return value;
    return format(d, pattern);
  } catch {
    return value;
  }
}

export function relativeTime(value: string | undefined | null): string {
  if (!value) return 'never';
  try {
    const d = parseISO(value);
    if (!isValid(d)) return value;
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return value;
  }
}

export function athleteDisplayName(a: {
  firstName?: string;
  lastName?: string;
  displayName?: string;
}): string {
  if (a.displayName) return a.displayName;
  return [a.firstName, a.lastName].filter(Boolean).join(' ') || 'Unknown';
}
