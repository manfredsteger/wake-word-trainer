'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import de from '@/messages/de.json';
import en from '@/messages/en.json';

const messages = { de, en } as const;
export type Locale = keyof typeof messages;
type Messages = typeof de;

type PathsToLeaves<T, P extends string = ''> = {
  [K in keyof T]: T[K] extends string
    ? P extends '' ? `${string & K}` : `${P}.${string & K}`
    : PathsToLeaves<T[K], P extends '' ? `${string & K}` : `${P}.${string & K}`>;
}[keyof T];

type TranslationKey = PathsToLeaves<Messages>;

function get(obj: Record<string, unknown>, path: string): string {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return path;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : path;
}

interface I18nContext {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nContext | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('de');

  useEffect(() => {
    const stored = localStorage.getItem('locale') as Locale | null;
    if (stored && stored in messages) setLocaleState(stored);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('locale', l);
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      let str = get(messages[locale] as unknown as Record<string, unknown>, key);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(`{${k}}`, String(v));
        }
      }
      return str;
    },
    [locale],
  );

  return <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
