'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Package, Mic, Zap, Clock, ArrowRight } from 'lucide-react';
import { Header } from '@/components/header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { useI18n } from '@/lib/i18n';
import { formatDate } from '@/lib/utils';

interface Run {
  id: number;
  wakeWord: string;
  samples: number;
  steps: number;
  status: string;
  createdAt: string;
  finishedAt: string | null;
}

interface Model {
  name: string;
  size: number;
  mtime: string;
}

interface Speaker {
  id: string;
  speaker: string;
  count: number;
}

export default function DashboardPage() {
  const { t } = useI18n();
  const [runs, setRuns] = useState<Run[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);

  useEffect(() => {
    fetch('/api/train').then(r => r.json()).then(setRuns).catch(() => {});
    fetch('/api/models').then(r => r.json()).then(setModels).catch(() => {});
    fetch('/api/recordings').then(r => r.json()).then(setSpeakers).catch(() => {});
  }, []);

  const lastRun = runs[0];
  const totalRecordings = speakers.reduce((s, x) => s + x.count, 0);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('dashboard.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Wake Word Trainer for Home Assistant</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label={t('dashboard.modelsCount')}
            value={models.length}
            icon={Package}
            accent={models.length > 0}
          />
          <StatCard
            label={t('dashboard.recordingsCount')}
            value={totalRecordings}
            icon={Mic}
            accent={totalRecordings > 0}
            sub={speakers.map(s => s.speaker).join(', ') || undefined}
          />
          <StatCard
            label={t('dashboard.lastTraining')}
            value={lastRun ? formatDate(lastRun.createdAt) : t('dashboard.noTraining')}
            icon={Clock}
            sub={lastRun?.wakeWord}
          />
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/training"
            className="card p-5 flex items-center gap-4 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors group"
          >
            <div className="p-3 bg-emerald-100 dark:bg-emerald-950 rounded-xl text-emerald-600 dark:text-emerald-400">
              <Zap className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900 dark:text-white">{t('dashboard.btnTrain')}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">TTS + echte Stimmen → .onnx</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors" />
          </Link>

          <Link
            href="/recordings"
            className="card p-5 flex items-center gap-4 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors group"
          >
            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400">
              <Mic className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900 dark:text-white">{t('dashboard.btnRecord')}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Familie aufnehmen, 20× pro Person</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors" />
          </Link>
        </div>

        {/* Recent training runs */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="font-semibold text-slate-900 dark:text-white">{t('dashboard.recentRuns')}</h2>
          </div>
          {runs.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-slate-400 dark:text-slate-500">{t('dashboard.noRuns')}</p>
              <Link href="/training" className="mt-3 inline-block text-sm text-emerald-600 dark:text-emerald-400 hover:underline">
                {t('dashboard.startFirst')}
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {runs.slice(0, 8).map(run => (
                <div key={run.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white truncate">&ldquo;{run.wakeWord}&rdquo;</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{formatDate(run.createdAt)}</p>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 shrink-0 hidden sm:block">
                    {run.samples}×{run.steps}
                  </div>
                  <StatusBadge status={run.status} label={t(`status.${run.status}` as 'status.done')} />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
