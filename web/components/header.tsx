'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useI18n } from '@/lib/i18n';
import { Mic2, LayoutDashboard, Zap, Mic, Package, Sun, Moon, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', icon: LayoutDashboard, key: 'nav.dashboard' as const },
  { href: '/training', icon: Zap, key: 'nav.training' as const },
  { href: '/recordings', icon: Mic, key: 'nav.recordings' as const },
  { href: '/models', icon: Package, key: 'nav.models' as const },
];

export function Header() {
  const { t, locale, setLocale } = useI18n();
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-slate-900 dark:text-white shrink-0">
          <Mic2 className="w-5 h-5 text-emerald-500" />
          <span className="hidden sm:block">Wake Word Trainer</span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-1 flex-1">
          {navItems.map(({ href, icon: Icon, key }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                pathname === href
                  ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden md:block">{t(key)}</span>
            </Link>
          ))}
        </nav>

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setLocale(locale === 'de' ? 'en' : 'de')}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Switch language"
          >
            <Globe className="w-4 h-4" />
            <span className="font-medium">{locale.toUpperCase()}</span>
          </button>

          <button
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Toggle theme"
          >
            {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
}
