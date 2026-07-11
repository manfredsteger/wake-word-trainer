'use client';

import { useState, useRef, useCallback } from 'react';
import { Mic, StopCircle, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const w = (off: number, str: string) =>
    [...str].forEach((c, i) => view.setUint8(off + i, c.charCodeAt(0)));
  w(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true);
  w(8, 'WAVE'); w(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); w(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++)
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([buf], { type: 'audio/wav' });
}

type Phase = 'idle' | 'recording' | 'saving' | 'done' | 'error';

interface Props {
  label: string;
  durationSeconds?: number;
  apiPath: string;
  extraFields?: Record<string, string>;
  onSaved?: () => void;
}

export function BackgroundRecorder({ label, durationSeconds = 30, apiPath, extraFields, onSaved }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const stopRef = useRef(false);

  const isSecure = typeof window !== 'undefined' &&
    (window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1');

  if (!isSecure) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center px-4">
        <div className="p-4 bg-amber-100 dark:bg-amber-950 rounded-full">
          <AlertCircle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="space-y-2 max-w-xs">
          <p className="font-semibold text-slate-900 dark:text-white">HTTPS erforderlich</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Starte <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">make mobile</code> und öffne den ngrok-Link auf dem iPhone.</p>
        </div>
      </div>
    );
  }

  const record = useCallback(async () => {
    stopRef.current = false;
    setElapsed(0);
    setPhase('recording');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext({ sampleRate: 16000 });
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];

      source.connect(processor);
      processor.connect(ctx.destination);

      let startTime = Date.now();
      const timer = setInterval(() => {
        const sec = Math.floor((Date.now() - startTime) / 1000);
        setElapsed(sec);
        if (sec >= durationSeconds) stopRef.current = true;
      }, 200);

      await new Promise<void>((resolve) => {
        processor.onaudioprocess = (e) => {
          chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
          if (stopRef.current) resolve();
        };
      });

      clearInterval(timer);
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach(t => t.stop());
      await ctx.close();

      if (chunks.length === 0) { setPhase('idle'); return; }

      setPhase('saving');
      const total = chunks.reduce((a, c) => a + c.length, 0);
      const merged = new Float32Array(total);
      let off = 0;
      for (const c of chunks) { merged.set(c, off); off += c.length; }

      const wav = encodeWAV(merged, 16000);
      const form = new FormData();
      form.append('audio', wav, 'recording.wav');
      form.append('label', label);
      if (extraFields) {
        for (const [k, v] of Object.entries(extraFields)) form.append(k, v);
      }

      const res = await fetch(apiPath, { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text());

      setPhase('done');
      onSaved?.();
      setTimeout(() => setPhase('idle'), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
      setPhase('error');
      setTimeout(() => setPhase('idle'), 3000);
    }
  }, [label, durationSeconds, apiPath, extraFields, onSaved]);

  const stop = () => { stopRef.current = true; };
  const pct = Math.min(100, (elapsed / durationSeconds) * 100);

  return (
    <div className="flex flex-col items-center gap-5 py-4">
      <button
        onClick={phase === 'idle' ? record : stop}
        disabled={phase === 'saving' || phase === 'done'}
        className={cn(
          'w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-lg',
          phase === 'idle'
            ? 'bg-orange-500 hover:bg-orange-600 hover:scale-105'
            : phase === 'recording'
              ? 'bg-red-500 scale-110 ring-4 ring-red-500/30 animate-pulse'
              : phase === 'done'
                ? 'bg-emerald-500'
                : 'bg-slate-400 cursor-not-allowed'
        )}
      >
        {phase === 'saving' ? <Loader2 className="w-9 h-9 text-white animate-spin" /> :
         phase === 'recording' ? <StopCircle className="w-9 h-9 text-white" /> :
         phase === 'done' ? <CheckCircle className="w-9 h-9 text-white" /> :
         <Mic className="w-9 h-9 text-white" />}
      </button>

      <div className="text-center min-h-8">
        {phase === 'idle' && <p className="text-sm text-slate-500 dark:text-slate-400">Aufnahme starten</p>}
        {phase === 'recording' && (
          <p className="text-sm font-semibold text-red-500">
            Aufnahme läuft… {elapsed}s / {durationSeconds}s
          </p>
        )}
        {phase === 'saving' && <p className="text-sm text-slate-500">Speichern…</p>}
        {phase === 'done' && <p className="text-sm text-emerald-600 font-medium">✓ Gespeichert ({elapsed}s)</p>}
        {phase === 'error' && <p className="text-sm text-red-500">{error}</p>}
      </div>

      {phase === 'recording' && (
        <div className="w-full max-w-xs">
          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 rounded-full transition-all duration-200" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-center text-slate-400 mt-1">Stopp-Button oder automatisch nach {durationSeconds}s</p>
        </div>
      )}
    </div>
  );
}
