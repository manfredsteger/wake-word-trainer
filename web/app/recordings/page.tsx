'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Trash2, Info, Users, PlusCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Header } from '@/components/header';
import { Recorder } from '@/components/recorder';
import { useI18n } from '@/lib/i18n';

interface Speaker {
  id: string;
  speaker: string;
  wakeWord: string;
  count: number;
}

interface WakeWordGroup {
  wakeWord: string;
  speakers: Speaker[];
  totalRecordings: number;
}

function toSlug(s: string) {
  return s.toLowerCase().replace(/[\s,!.]+/g, '_').replace(/_+/g, '_');
}

function SpeakerRow({
  s,
  onContinue,
  onDelete,
}: {
  s: Speaker;
  onContinue: (s: Speaker) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useI18n();
  const pct = Math.min(100, Math.round((s.count / Math.max(s.count, 20)) * 100));
  return (
    <div className="flex items-center gap-4 py-3 px-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg transition-colors">
      <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center shrink-0">
        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
          {s.speaker.charAt(0).toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-900 dark:text-white text-sm">{s.speaker}</p>
        <div className="flex items-center gap-2 mt-1">
          <div className="h-1.5 w-20 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {s.count} {t('recordings.count_label')}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onContinue(s)}
          className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium transition-colors"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          {t('recordings.addMore')}
        </button>
        <button onClick={() => onDelete(s.id)} className="btn-danger !py-1 !px-1.5">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function WakeWordCard({
  group,
  onContinue,
  onDelete,
}: {
  group: WakeWordGroup;
  onContinue: (s: Speaker) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <div className="p-1.5 bg-emerald-100 dark:bg-emerald-950 rounded-lg">
            <Mic className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-left min-w-0">
            <p className="font-semibold text-slate-900 dark:text-white truncate">
              &ldquo;{group.wakeWord}&rdquo;
            </p>
            <p className="text-xs text-slate-400">
              {group.speakers.length} {group.speakers.length === 1 ? 'Sprecher' : 'Sprecher'} · {group.totalRecordings} Aufnahmen gesamt
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Speaker avatar stack */}
          <div className="flex -space-x-2">
            {group.speakers.slice(0, 4).map(s => (
              <div
                key={s.id}
                className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-slate-900 flex items-center justify-center"
                title={s.speaker}
              >
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                  {s.speaker.charAt(0).toUpperCase()}
                </span>
              </div>
            ))}
            {group.speakers.length > 4 && (
              <div className="w-6 h-6 rounded-full bg-slate-300 dark:bg-slate-600 border-2 border-white dark:border-slate-900 flex items-center justify-center">
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">+{group.speakers.length - 4}</span>
              </div>
            )}
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2 space-y-1">
          {group.speakers.map(s => (
            <SpeakerRow key={s.id} s={s} onContinue={onContinue} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
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

  // Group speakers by wake word
  const groups: WakeWordGroup[] = Object.values(
    speakers.reduce<Record<string, WakeWordGroup>>((acc, s) => {
      const key = toSlug(s.wakeWord);
      if (!acc[key]) acc[key] = { wakeWord: s.wakeWord, speakers: [], totalRecordings: 0 };
      acc[key].speakers.push(s);
      acc[key].totalRecordings += s.count;
      return acc;
    }, {})
  );

  const startSession = () => {
    if (!wakeWord.trim() || !speaker.trim()) return;
    setRecording(true);
  };

  const continueRecording = (s: Speaker) => {
    setWakeWord(s.wakeWord);
    setSpeaker(s.speaker);
    setTargetCount(10);
    setRecording(false);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
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

        {/* Grouped recordings by wake word */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-slate-900 dark:text-white">{t('recordings.existing')}</h2>
          </div>
          {groups.length === 0 ? (
            <div className="card px-5 py-8 text-center">
              <p className="text-slate-400 dark:text-slate-500">{t('recordings.noRecordings')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map(g => (
                <WakeWordCard
                  key={toSlug(g.wakeWord)}
                  group={g}
                  onContinue={continueRecording}
                  onDelete={deleteSpeaker}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
