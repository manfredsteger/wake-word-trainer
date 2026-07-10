'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Trash2, Info, Users, PlusCircle } from 'lucide-react';
import { Header } from '@/components/header';
import { Recorder } from '@/components/recorder';
import { useI18n } from '@/lib/i18n';

interface Speaker {
  id: string;
  speaker: string;
  wakeWord: string;
  count: number;
}

export default function RecordingsPage() {
  const { t } = useI18n();
  const [wakeWord, setWakeWord] = useState('Hey Dobbi');
  const [speaker, setSpeaker] = useState('');
  const [targetCount, setTargetCount] = useState(20);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [recording, setRecording] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const loadSpeakers = async () => {
    const res = await fetch('/api/recordings');
    if (res.ok) setSpeakers(await res.json());
  };

  useEffect(() => { loadSpeakers(); }, []);

  const startSession = () => {
    if (!wakeWord.trim() || !speaker.trim()) return;
    setRecording(true);
  };

  const continueRecording = (s: Speaker) => {
    setWakeWord(s.wakeWord);
    setSpeaker(s.speaker);
    setTargetCount(10);
    setRecording(false);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const deleteSpeaker = async (id: string) => {
    if (!confirm(t('models.deleteConfirm'))) return;
    await fetch(`/api/recordings/${encodeURIComponent(id)}`, { method: 'DELETE' });
    loadSpeakers();
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Mic className="w-6 h-6 text-emerald-500" />
            {t('recordings.title')}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t('recordings.subtitle')}</p>
        </div>

        <div ref={formRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Setup form */}
          <div className="card p-6 space-y-5">
            <div>
              <label className="label">{t('recordings.wakeWord')}</label>
              <input
                className="input"
                value={wakeWord}
                onChange={e => setWakeWord(e.target.value)}
                placeholder={t('recordings.wakeWordPlaceholder')}
                disabled={recording}
              />
            </div>

            <div>
              <label className="label">{t('recordings.speaker')}</label>
              <input
                className="input"
                value={speaker}
                onChange={e => setSpeaker(e.target.value)}
                placeholder={t('recordings.speakerPlaceholder')}
                disabled={recording}
              />
            </div>

            <div>
              <label className="label">
                {t('recordings.targetCount')}: <span className="text-emerald-600 dark:text-emerald-400 font-bold">{targetCount}</span>
              </label>
              <input
                type="range" min={5} max={50} step={5}
                value={targetCount}
                onChange={e => setTargetCount(Number(e.target.value))}
                disabled={recording}
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                <span>5</span><span>50</span>
              </div>
            </div>

            {!recording ? (
              <button
                onClick={startSession}
                disabled={!wakeWord.trim() || !speaker.trim()}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <Mic className="w-4 h-4" />
                {t('recordings.startRecording')}
              </button>
            ) : (
              <button
                onClick={() => { setRecording(false); loadSpeakers(); }}
                className="btn-secondary w-full"
              >
                ← Fertig
              </button>
            )}

            <div className="flex items-start gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('recordings.tip')}</p>
            </div>
          </div>

          {/* Recorder widget */}
          <div className="card p-6">
            {recording ? (
              <Recorder
                wakeWord={wakeWord}
                speaker={speaker}
                target={targetCount}
                onProgress={() => {}}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-12">
                <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full">
                  <Mic className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="text-slate-400 dark:text-slate-500 text-sm">
                  Sprecher eingeben und Aufnahme starten →
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Existing recordings */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-slate-900 dark:text-white">{t('recordings.existing')}</h2>
          </div>
          {speakers.length === 0 ? (
            <p className="px-5 py-8 text-center text-slate-400 dark:text-slate-500">
              {t('recordings.noRecordings')}
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {speakers.map(s => {
                const target = Math.max(s.count, 20);
                const pct = Math.min(100, Math.round((s.count / target) * 100));
                return (
                  <div key={s.id} className="px-5 py-3 flex items-center gap-4">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {s.speaker.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white">{s.speaker}</p>
                      <p className="text-xs text-slate-400">&ldquo;{s.wakeWord}&rdquo;</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="hidden sm:block">
                        <div className="h-2 w-24 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                          {s.count} {t('recordings.count_label')}
                        </p>
                      </div>
                      <button
                        onClick={() => continueRecording(s)}
                        title={t('recordings.addMore')}
                        className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors font-medium"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span className="hidden sm:inline">{t('recordings.addMore')}</span>
                      </button>
                      <button onClick={() => deleteSpeaker(s.id)} className="btn-danger">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
