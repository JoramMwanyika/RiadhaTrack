import { cn } from '../../lib/utils';

const colors = {
  online: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
  offline: 'bg-slate-500',
  unknown: 'bg-amber-400',
  pending: 'bg-amber-400 animate-pulse',
};

export function StatusDot({
  status,
  className,
}: {
  status: keyof typeof colors;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block h-2.5 w-2.5 rounded-full',
        colors[status] ?? colors.unknown,
        className
      )}
    />
  );
}
