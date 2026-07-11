'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, Trash2, Info, Users, PlusCircle, ChevronDown, ChevronUp, Volume2, ShieldAlert, Upload, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Header } from '@/components/header';
import { Recorder } from '@/components/recorder';
import { BackgroundRecorder } from '@/components/background-recorder';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface Speaker { id: string; speaker: string; wakeWord: string; count: number; }
interface WakeWordGroup { wakeWord: string; speakers: Speaker[]; totalRecordings: number; }
interface NegPhrase { phrase: string; count: number; }

function toSlug(s: string) {
  return s.toLowerCase().replace(/[\s,!.]+/g, '_').replace(/_+/g, '_');
}

// ── Recordings grouped by wake word ──────────────────────────────────────────

function SpeakerRow({ s, onContinue, onDelete }: { s: Speaker; onContinue: (s: Speaker) => void; onDelete: (id: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-4 py-3 px-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg transition-colors">
      <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center shrink-0">
        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{s.speaker.charAt(0).toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-900 dark:text-white text-sm">{s.speaker}</p>
        <div className="flex items-center gap-2 mt-1">
          <div className="h-1.5 w-20 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, (s.count / Math.max(s.count, 20)) * 100)}%` }} />
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{s.count} {t('recordings.count_label')}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => onContinue(s)} className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 font-medium transition-colors">
          <PlusCircle className="w-3.5 h-3.5" />{t('recordings.addMore')}
        </button>
        <button onClick={() => onDelete(s.id)} className="btn-danger !py-1 !px-1.5"><Trash2 className="w-3 h-3" /></button>
      </div>
    </div>
  );
}

function WakeWordCard({ group, onContinue, onDelete }: { group: WakeWordGroup; onContinue: (s: Speaker) => void; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
        <div className="p-1.5 bg-emerald-100 dark:bg-emerald-950 rounded-lg">
          <Mic className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="font-semibold text-slate-900 dark:text-white truncate">&ldquo;{group.wakeWord}&rdquo;</p>
          <p className="text-xs text-slate-400">{group.speakers.length} Sprecher · {group.totalRecordings} Aufnahmen</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex -space-x-2">
            {group.speakers.slice(0, 4).map(s => (
              <div key={s.id} className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-slate-900 flex items-center justify-center" title={s.speaker}>
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{s.speaker.charAt(0).toUpperCase()}</span>
              </div>
            ))}
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2 space-y-1">
          {group.speakers.map(s => <SpeakerRow key={s.id} s={s} onContinue={onContinue} onDelete={onDelete} />)}
        </div>
      )}
    </div>
  );
}

// ── Stimmen Tab ───────────────────────────────────────────────────────────────

function VoicesTab() {
  const { t } = useI18n();
  const [wakeWord, setWakeWord] = useState('Hey Dobbi');
  const [speaker, setSpeaker] = useState('');
  const [targetCount, setTargetCount] = useState(20);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [recording, setRecording] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const loadSpeakers = useCallback(async () => {
    const res = await fetch('/api/recordings');
    if (res.ok) setSpeakers(await res.json());
  }, []);

  useEffect(() => { loadSpeakers(); }, [loadSpeakers]);

  const groups: WakeWordGroup[] = Object.values(
    speakers.reduce<Record<string, WakeWordGroup>>((acc, s) => {
      const key = toSlug(s.wakeWord);
      if (!acc[key]) acc[key] = { wakeWord: s.wakeWord, speakers: [], totalRecordings: 0 };
      acc[key].speakers.push(s);
      acc[key].totalRecordings += s.count;
      return acc;
    }, {})
  );

  const continueRecording = (s: Speaker) => {
    setWakeWord(s.wakeWord); setSpeaker(s.speaker); setTargetCount(10); setRecording(false);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const deleteSpeaker = async (id: string) => {
    if (!confirm(t('models.deleteConfirm'))) return;
    await fetch(`/api/recordings/${encodeURIComponent(id)}`, { method: 'DELETE' });
    loadSpeakers();
  };

  return (
    <div className="space-y-6">
      <div ref={formRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6 space-y-5">
          <div>
            <label className="label">{t('recordings.wakeWord')}</label>
            <input className="input" value={wakeWord} onChange={e => setWakeWord(e.target.value)} placeholder={t('recordings.wakeWordPlaceholder')} disabled={recording} />
          </div>
          <div>
            <label className="label">{t('recordings.speaker')}</label>
            <input className="input" value={speaker} onChange={e => setSpeaker(e.target.value)} placeholder={t('recordings.speakerPlaceholder')} disabled={recording} />
          </div>
          <div>
            <label className="label">{t('recordings.targetCount')}: <span className="text-emerald-600 dark:text-emerald-400 font-bold">{targetCount}</span></label>
            <input type="range" min={5} max={50} step={5} value={targetCount} onChange={e => setTargetCount(Number(e.target.value))} disabled={recording} className="w-full accent-emerald-500" />
            <div className="flex justify-between text-xs text-slate-400 mt-0.5"><span>5</span><span>50</span></div>
          </div>
          {!recording ? (
            <button onClick={() => { if (wakeWord.trim() && speaker.trim()) setRecording(true); }} disabled={!wakeWord.trim() || !speaker.trim()} className="btn-primary w-full flex items-center justify-center gap-2">
              <Mic className="w-4 h-4" />{t('recordings.startRecording')}
            </button>
          ) : (
            <button onClick={() => { setRecording(false); loadSpeakers(); }} className="btn-secondary w-full">← Fertig</button>
          )}
          <div className="flex items-start gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('recordings.tip')}</p>
          </div>
        </div>
        <div className="card p-6">
          {recording ? (
            <Recorder wakeWord={wakeWord} speaker={speaker} target={targetCount} onProgress={() => {}} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-12">
              <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full"><Mic className="w-8 h-8 text-slate-400 dark:text-slate-500" /></div>
              <p className="text-slate-400 dark:text-slate-500 text-sm">Sprecher eingeben und Aufnahme starten →</p>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-slate-400" />
          <h2 className="font-semibold text-slate-900 dark:text-white">{t('recordings.existing')}</h2>
        </div>
        {groups.length === 0 ? (
          <div className="card px-5 py-8 text-center"><p className="text-slate-400 dark:text-slate-500">{t('recordings.noRecordings')}</p></div>
        ) : (
          <div className="space-y-3">
            {groups.map(g => <WakeWordCard key={toSlug(g.wakeWord)} group={g} onContinue={continueRecording} onDelete={deleteSpeaker} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Umgebung Tab ─────────────────────────────────────────────────────────────

function BackgroundTab() {
  const [clips, setClips] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await fetch('/api/recordings/background');
    if (res.ok) { const d = await res.json(); setClips(d.files ?? []); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteClip = async (file: string) => {
    await fetch('/api/recordings/background', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file }) });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-950 rounded-lg shrink-0">
              <Volume2 className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Umgebungsgeräusche aufnehmen</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Nimm 30s typischen Lärm in deinem Zuhause auf — TV läuft, Gespräch, Küche. Das Modell lernt dadurch, Wake Words in <em>deiner</em> Umgebung zu erkennen.
              </p>
            </div>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <strong>Tipps:</strong> TV im Hintergrund · normale Gespräche · Küchen&shy;geräusche · Musikanlage · mehrere Aufnahmen aus verschiedenen Räumen
            </p>
          </div>
        </div>
        <div className="card p-6">
          <BackgroundRecorder
            label="home_background"
            durationSeconds={30}
            apiPath="/api/recordings/background"
            onSaved={load}
          />
        </div>
      </div>

      {clips.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="font-semibold text-slate-900 dark:text-white">{clips.length} Umgebungsaufnahme{clips.length !== 1 ? 'n' : ''} gespeichert</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {clips.map(file => (
              <div key={file} className="px-5 py-3 flex items-center gap-4">
                <Volume2 className="w-4 h-4 text-orange-500 shrink-0" />
                <span className="flex-1 text-sm text-slate-600 dark:text-slate-300 font-mono truncate">{file}</span>
                <button onClick={() => deleteClip(file)} className="btn-danger"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Negativ-Phrasen Tab ───────────────────────────────────────────────────────

function NegativesTab() {
  const { t } = useI18n();
  const [wakeWord, setWakeWord] = useState('Hey Dobbi');
  const [phrase, setPhrase] = useState('');
  const [recording, setRecording] = useState(false);
  const [negPhrases, setNegPhrases] = useState<NegPhrase[]>([]);

  const load = useCallback(async (ww: string) => {
    const res = await fetch(`/api/recordings/negative?wakeWord=${encodeURIComponent(ww)}`);
    if (res.ok) setNegPhrases(await res.json());
  }, []);

  useEffect(() => { load(wakeWord); }, [wakeWord, load]);

  const deletePhrase = async (p: string) => {
    if (!confirm(t('models.deleteConfirm'))) return;
    await fetch('/api/recordings/negative', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wakeWord, phrase: p }) });
    load(wakeWord);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-950 rounded-lg shrink-0">
              <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Negativ-Phrasen aufnehmen</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Sprich Wörter ein, die ähnlich klingen aber <em>nicht</em> als Wake Word erkannt werden sollen. Das verhindert False Positives.
              </p>
            </div>
          </div>

          <div>
            <label className="label">{t('recordings.wakeWord')} (Trainingsmodell)</label>
            <input className="input" value={wakeWord} onChange={e => setWakeWord(e.target.value)} placeholder="Hey Dobbi" disabled={recording} />
          </div>

          <div>
            <label className="label">Negativ-Phrase</label>
            <input className="input" value={phrase} onChange={e => setPhrase(e.target.value)} placeholder='z.B. "Hey Bobby", "Hey Hobby", "Hei Dobbi"' disabled={recording} />
            <p className="text-xs text-slate-400 mt-1">Klingt ähnlich wie das Wake Word, soll aber <em>nicht</em> triggern</p>
          </div>

          {!recording ? (
            <button onClick={() => { if (wakeWord.trim() && phrase.trim()) setRecording(true); }} disabled={!wakeWord.trim() || !phrase.trim()} className="btn-primary w-full flex items-center justify-center gap-2">
              <Mic className="w-4 h-4" />10 × &ldquo;{phrase || '…'}&rdquo; aufnehmen
            </button>
          ) : (
            <button onClick={() => { setRecording(false); load(wakeWord); }} className="btn-secondary w-full">← Fertig</button>
          )}
        </div>

        <div className="card p-6">
          {recording ? (
            <Recorder
              wakeWord={phrase}
              speaker="neg"
              target={10}
              onProgress={() => {}}
              apiPath="/api/recordings/negative"
              extraFields={{ wakeWord, phrase }}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-12">
              <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full">
                <ShieldAlert className="w-8 h-8 text-slate-400 dark:text-slate-500" />
              </div>
              <p className="text-slate-400 dark:text-slate-500 text-sm">Phrase eingeben und aufnehmen →</p>
            </div>
          )}
        </div>
      </div>

      {negPhrases.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="font-semibold text-slate-900 dark:text-white">Negativ-Phrasen für &ldquo;{wakeWord}&rdquo;</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {negPhrases.map(np => (
              <div key={np.phrase} className="px-5 py-3 flex items-center gap-4">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">&ldquo;{np.phrase}&rdquo;</p>
                  <p className="text-xs text-slate-400">{np.count} Aufnahmen</p>
                </div>
                <button onClick={() => deletePhrase(np.phrase)} className="btn-danger"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Upload Tab (kein HTTPS nötig) ─────────────────────────────────────────────

type FileStatus = 'pending' | 'uploading' | 'done' | 'error';
interface UploadFile { file: File; status: FileStatus; saved?: number; error?: string; }

function UploadTab() {
  const { t } = useI18n();
  const [wakeWord, setWakeWord] = useState('Hey Dobbi');
  const [speaker, setSpeaker] = useState('');
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setFiles(prev => [...prev, ...Array.from(incoming).map(f => ({ file: f, status: 'pending' as FileStatus }))]);
  };

  const upload = async () => {
    if (!wakeWord.trim() || !speaker.trim() || uploading) return;
    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      if (files[i].status === 'done') continue;
      setFiles(prev => prev.map((f, j) => j === i ? { ...f, status: 'uploading' } : f));
      try {
        const form = new FormData();
        form.append('audio', files[i].file);
        form.append('wakeWord', wakeWord.trim());
        form.append('speaker', speaker.trim());
        form.append('mode', 'auto');
        const res = await fetch('/api/recordings/upload', { method: 'POST', body: form });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setFiles(prev => prev.map((f, j) => j === i ? { ...f, status: 'done', saved: data.saved } : f));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Fehler';
        setFiles(prev => prev.map((f, j) => j === i ? { ...f, status: 'error', error: msg } : f));
      }
    }
    setUploading(false);
  };

  const pending = files.filter(f => f.status === 'pending' || f.status === 'error').length;
  const totalSaved = files.reduce((s, f) => s + (f.saved ?? 0), 0);

  return (
    <div className="space-y-6">

      {/* Erklär-Box */}
      <div className="card p-5 space-y-4 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
        <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Upload className="w-4 h-4 text-blue-500" />
          So funktioniert der Upload
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-slate-600 dark:text-slate-300">
          <div className="space-y-2">
            <p className="font-medium text-slate-800 dark:text-slate-200">Option A — Eine Datei pro Ausruf</p>
            <p className="text-slate-500 dark:text-slate-400">
              20× einzeln in Voice Memos aufnehmen, alle 20 Dateien auf einmal hochladen. Jede Datei wird als ein Trainingsclip gespeichert.
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-slate-800 dark:text-slate-200">Option B — Eine lange Datei (empfohlen)</p>
            <p className="text-slate-500 dark:text-slate-400">
              Einmal aufnehmen, 20× hintereinander &ldquo;Hey Dobbi&rdquo; sprechen, kurze Pause zwischen jedem Ausruf. Der Server erkennt die Pausen automatisch und schneidet jeden Ausruf als einzelnen Clip heraus.
            </p>
          </div>
        </div>
        <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-xs text-blue-800 dark:text-blue-200">
          <strong>Tipp für Option B:</strong> Ca. 0.5–1s Pause zwischen jedem Ausruf. Nicht zu laut und nicht zu leise sprechen. Unterstützte Formate: M4A · WAV · MP3 · AAC · FLAC · OGG — alles was ffmpeg kennt.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: config */}
        <div className="card p-6 space-y-5">
          <div>
            <label className="label">{t('recordings.wakeWord')}</label>
            <input className="input" value={wakeWord} onChange={e => setWakeWord(e.target.value)} placeholder="Hey Dobbi" disabled={uploading} />
          </div>
          <div>
            <label className="label">{t('recordings.speaker')}</label>
            <input className="input" value={speaker} onChange={e => setSpeaker(e.target.value)} placeholder="z.B. Manfred" disabled={uploading} />
          </div>

          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
            className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
          >
            <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Dateien auswählen oder hierher ziehen</p>
            <p className="text-xs text-slate-400 mt-1">Alle Audioformate · einzelne Clips oder lange Sammelaufnahme</p>
            <input ref={inputRef} type="file" accept="audio/*,video/mp4,.m4a,.caf" multiple className="hidden" onChange={e => addFiles(e.target.files)} />
          </div>

          {files.length > 0 && (
            <button
              onClick={upload}
              disabled={uploading || pending === 0 || !wakeWord.trim() || !speaker.trim()}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Verarbeite…' : `${pending} Datei${pending !== 1 ? 'en' : ''} hochladen`}
            </button>
          )}

          {totalSaved > 0 && !uploading && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 text-center font-medium">
              ✓ {totalSaved} Trainingsclip{totalSaved !== 1 ? 's' : ''} gespeichert
            </p>
          )}
        </div>

        {/* Right: file list */}
        <div className="card p-6">
          {files.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-12">
              <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full">
                <Upload className="w-8 h-8 text-slate-400 dark:text-slate-500" />
              </div>
              <div className="space-y-1">
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">iPhone → Voice Memos</p>
                <p className="text-slate-400 dark:text-slate-500 text-xs">
                  Aufnahme antippen → Teilen<br />
                  → Browser (Safari) → Datei hier ablegen
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {files.map((f, i) => (
                <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <div className="mt-0.5 shrink-0">
                    {f.status === 'done'      && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                    {f.status === 'error'     && <XCircle className="w-4 h-4 text-red-500" />}
                    {f.status === 'uploading' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                    {f.status === 'pending'   && <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{f.file.name}</p>
                    <p className="text-xs text-slate-400">{(f.file.size / 1024).toFixed(0)} KB</p>
                    {f.status === 'done' && f.saved !== undefined && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        → {f.saved} Clip{f.saved !== 1 ? 's' : ''} erkannt &amp; gespeichert
                      </p>
                    )}
                    {f.error && <p className="text-xs text-red-500">{f.error}</p>}
                  </div>
                  {f.status !== 'uploading' && (
                    <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-400 transition-colors shrink-0 mt-0.5">
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* HTTPS-Hinweis */}
      <div className="card p-4 flex items-start gap-3 bg-slate-50 dark:bg-slate-800/40">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          <strong>Live-Recorder direkt im Browser:</strong> Dafür ist HTTPS nötig (Browser-Policy, nicht umgehbar).
          Einmalig <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">make mobile-setup</code> ausführen — erstellt ein lokales Zertifikat ohne Internet. Danach <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">make mobile</code> und die angezeigte HTTPS-URL auf dem iPhone öffnen.
        </p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'voices' | 'upload' | 'background' | 'negatives';

export default function RecordingsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('voices');

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'voices',     label: t('recordings.tabVoices'),     icon: <Mic className="w-4 h-4" /> },
    { id: 'upload',     label: t('recordings.tabUpload'),     icon: <Upload className="w-4 h-4" /> },
    { id: 'background', label: t('recordings.tabBackground'), icon: <Volume2 className="w-4 h-4" /> },
    { id: 'negatives',  label: t('recordings.tabNegatives'),  icon: <ShieldAlert className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Mic className="w-6 h-6 text-emerald-500" />
            {t('recordings.title')}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t('recordings.subtitle')}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
          {tabs.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === id
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              )}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        {tab === 'voices'     && <VoicesTab />}
        {tab === 'upload'     && <UploadTab />}
        {tab === 'background' && <BackgroundTab />}
        {tab === 'negatives'  && <NegativesTab />}
      </main>
    </div>
  );
}
