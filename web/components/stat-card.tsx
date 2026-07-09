import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: boolean;
  sub?: string;
}

export function StatCard({ label, value, icon: Icon, accent, sub }: StatCardProps) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={cn(
        'p-2.5 rounded-xl shrink-0',
        accent
          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
      )}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5 truncate">{value}</p>
        {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 truncate">{sub}</p>}
      </div>
    </div>
  );
}
