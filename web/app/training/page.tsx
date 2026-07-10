'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Zap, Mic, Info, Users } from 'lucide-react';
import { Header } from '@/components/header';
import { TrainingMonitor } from '@/components/training-monitor';
import { StatusBadge } from '@/components/status-badge';
import { useI18n } from '@/lib/i18n';
import { formatDate } from '@/lib/utils';

interface Run {
  id: number;
  wakeWord: string;
  label: string | null;
  samples: number;
  steps: number;
  fullMode: boolean;
  hasRealVoice: boolean;
  status: string;
  createdAt: string;
}

interface Speaker {
  id: string;
  speaker: string;
  wakeWord: string;
  count: number;
}

function toSlug(s: string) {
  return s.toLowerCase().replace(/[\s,!.]+/g, '_').replace(/_+/g, '_');
}

export default function TrainingPage() {
  const { t } = useI18n();
  const [wakeWord, setWakeWord] = useState('Hey Dobbi');
  const [samples, setSamples] = useState(500);
  const [steps, setSteps] = useState(5000);
  const [full, setFull] = useState(false);
  const [activeRun, setActiveRun] = useState<number | null>(null);
  const [recentRuns, setRecentRuns] = useState<Run[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [matchingSpeakers, setMatchingSpeakers] = useState<Speaker[]>([]);

  const loadMatchingSpeakers = useCallback(async (word: string) => {
    const res = await fetch('/api/recordings');
    if (!res.ok) return;
    const all: Speaker[] = await res.json();
    setMatchingSpeakers(all.filter(s => toSlug(s.wakeWord) === toSlug(word)));
  }, []);

  useEffect(() => { loadMatchingSpeakers(wakeWord); }, [wakeWord, loadMatchingSpeakers]);

  const loadHistory = async () => {
    const res = await fetch('/api/train');
    if (res.ok) {
      const runs: Run[] = await res.json();
      setRecentRuns(runs);
      // Auto-restore monitor if a run is still active
      if (activeRun === null) {
        const running = runs.find(r => r.status === 'running');
        if (running) setActiveRun(running.id);
      }
    }
  };

  // Load history on mount and auto-restore any running training
  useEffect(() => { loadHistory(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startTraining = async () => {
    if (!wakeWord.trim() || isStarting) return;
    setIsStarting(true);
    try {
      const res = await fetch('/api/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wakeWord: wakeWord.trim(), samples, steps, full }),
      });
      const data = await res.json();
      if (res.status === 409) {
        // Another training is already running — jump to its monitor
        setActiveRun(data.id);
        loadHistory();
        return;
      }
      if (data.id) {
        setActiveRun(data.id);
        loadHistory();
      }
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-emerald-500" />
            {t('training.title')}
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Config form */}
          <div className="card p-6 space-y-5">
            <div>
              <label className="label">{t('training.wakeWord')}</label>
              <input
                className="input"
                value={wakeWord}
                onChange={e => setWakeWord(e.target.value)}
                placeholder={t('training.wakeWordPlaceholder')}
                disabled={!!activeRun}
              />
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t('training.wakeWordHint')}</p>

              {/* Real voice recordings for this wake word */}
              {matchingSpeakers.length > 0 && (
                <div className="mt-2 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 flex items-start gap-2">
                  <Users className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-700 dark:text-blue-300">
                    <span className="font-medium">{t('training.realVoicesIncluded')}: </span>
                    {matchingSpeakers.map((s, i) => (
                      <span key={s.id}>
                        {i > 0 && ', '}
                        <span className="font-semibold">{s.speaker}</span>
                        <span className="opacity-70"> ({s.count}×)</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="label">{t('training.samples')}: <span className="text-emerald-600 dark:text-emerald-400 font-bold">{samples}</span></label>
              <input
                type="range" min={30} max={2000} step={50}
                value={samples}
                onChange={e => setSamples(Number(e.target.value))}
                disabled={!!activeRun}
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                <span>30 (Test)</span><span>2000 (Produktion)</span>
              </div>
            </div>

            <div>
              <label className="label">{t('training.steps')}: <span className="text-emerald-600 dark:text-emerald-400 font-bold">{steps.toLocaleString()}</span></label>
              <input
                type="range" min={50} max={25000} step={500}
                value={steps}
                onChange={e => setSteps(Number(e.target.value))}
                disabled={!!activeRun}
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                <span>50 (Test)</span><span>25000 (Max)</span>
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox" checked={full} onChange={e => setFull(e.target.checked)}
                disabled={!!activeRun}
                className="mt-0.5 accent-emerald-500"
              />
              <span className="text-sm text-slate-600 dark:text-slate-300">{t('training.fullMode')}</span>
            </label>

            {!activeRun ? (
              <button onClick={startTraining} disabled={isStarting || !wakeWord.trim()} className="btn-primary w-full">
                {isStarting ? t('common.loading') : t('training.start')}
              </button>
            ) : (
              <button onClick={() => { setActiveRun(null); loadHistory(); }} className="btn-secondary w-full">
                ← {t('training.newTraining')}
              </button>
            )}

            {/* Tip */}
            <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-100 dark:border-emerald-900">
              <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <Link href="/recordings" className="text-xs text-emerald-700 dark:text-emerald-300 hover:underline">
                {t('training.realVoiceHint')}
              </Link>
            </div>
          </div>

          {/* Monitor / placeholder */}
          <div className="card p-6">
            {activeRun ? (
              <TrainingMonitor
                runId={activeRun}
                onDone={() => { loadHistory(); }}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-12">
                <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full">
                  <Zap className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="text-slate-400 dark:text-slate-500 text-sm">{t('training.logEmpty')}</p>
              </div>
            )}
          </div>
        </div>

        {/* History */}
        {recentRuns.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-semibold text-slate-900 dark:text-white">{t('training.history')}</h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentRuns.map(run => (
                <div key={run.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white truncate">
                      &ldquo;{run.label ?? run.wakeWord}&rdquo;
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatDate(run.createdAt)} · {run.samples} samples · {run.steps.toLocaleString()} steps
                      {run.fullMode && <span className="ml-1 text-emerald-500">· Full</span>}
                      {run.hasRealVoice && <span className="ml-1 text-blue-500">· Real voice</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={run.status} label={t(`status.${run.status}` as 'status.done')} />
                    <button
                      onClick={() => setActiveRun(run.id)}
                      className="text-xs text-slate-400 hover:text-emerald-500 transition-colors"
                    >
                      {run.status === 'running' ? 'Live' : 'Log'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
