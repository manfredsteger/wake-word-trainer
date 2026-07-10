'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Package, Download, Trash2, Home, FileAudio } from 'lucide-react';
import { Header } from '@/components/header';
import { useI18n } from '@/lib/i18n';
import { formatBytes, formatDate } from '@/lib/utils';

interface Model {
  name: string;
  size: number;
  mtime: string;
  path: string;
}

export default function ModelsPage() {
  const { t } = useI18n();
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const res = await fetch('/api/models');
    if (res.ok) setModels(await res.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const remove = async (name: string) => {
    if (!confirm(t('models.deleteConfirm'))) return;
    await fetch('/api/models', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    load();
  };

  const download = (name: string) => {
    const a = document.createElement('a');
    a.href = `/api/models/download?name=${encodeURIComponent(name)}`;
    a.download = name;
    a.click();
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-emerald-500" />
            {t('models.title')}
          </h1>
        </div>

        {/* Model grid */}
        {loading ? (
          <p className="text-slate-400">{t('common.loading')}</p>
        ) : models.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="inline-flex p-4 bg-slate-100 dark:bg-slate-800 rounded-full mb-4">
              <Package className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-400 dark:text-slate-500">{t('models.noModels')}</p>
            <Link href="/training" className="mt-3 inline-block text-sm text-emerald-600 dark:text-emerald-400 hover:underline">
              {t('models.startTraining')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {models.map(m => (
              <div key={m.name} className="card p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950 rounded-xl shrink-0">
                    <FileAudio className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">{m.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatBytes(m.size)} · {formatDate(m.mtime)}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => download(m.name)}
                    className="btn-secondary flex items-center gap-1.5 text-sm flex-1 justify-center"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t('models.download')}
                  </button>
                  <button
                    onClick={() => remove(m.name)}
                    className="btn-danger flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* HA Install Guide */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Home className="w-5 h-5 text-emerald-500" />
            <h2 className="font-semibold text-slate-900 dark:text-white">{t('models.installTitle')}</h2>
          </div>
          <ol className="space-y-3">
            {(['installStep1', 'installStep2', 'installStep3'] as const).map((k, i) => (
              <li key={k} className="flex items-start gap-3">
                <span className="w-6 h-6 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                  {i + 1}
                </span>
                <p className="text-sm text-slate-600 dark:text-slate-300">{t(`models.${k}`)}</p>
              </li>
            ))}
          </ol>
          <div className="mt-4 p-3 bg-slate-900 dark:bg-black rounded-lg font-mono text-xs text-emerald-400">
            scp output/hey_dobbi.onnx homeassistant:/share/openwakeword/
          </div>
        </div>
      </main>
    </div>
  );
}
