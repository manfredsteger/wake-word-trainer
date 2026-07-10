'use client';

import { useState, useRef, useCallback } from 'react';
import { Mic, StopCircle, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Phase = 'idle' | 'countdown' | 'recording' | 'saving' | 'saved' | 'error';

function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const write = (off: number, str: string) =>
    [...str].forEach((c, i) => view.setUint8(off + i, c.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++)
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([buf], { type: 'audio/wav' });
}

interface RecorderProps {
  wakeWord: string;
  speaker: string;
  target: number;
  onProgress: (saved: number) => void;
  apiPath?: string;
  extraFields?: Record<string, string>;
}

export function Recorder({ wakeWord, speaker, target, onProgress, apiPath = '/api/recordings', extraFields }: RecorderProps) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('idle');
  const [countdown, setCountdown] = useState(3);
  const [saved, setSaved] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const stopRef = useRef(false);

  const record = useCallback(async () => {
    if (!wakeWord.trim() || !speaker.trim()) return;
    stopRef.current = false;
    let n = 0;

    while (n < target && !stopRef.current) {
      // Countdown
      setPhase('countdown');
      for (let i = 3; i >= 1; i--) {
        if (stopRef.current) break;
        setCountdown(i);
        await new Promise(r => setTimeout(r, 700));
      }
      if (stopRef.current) break;

      // Record via Web Audio API
      setPhase('recording');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ctx = new AudioContext({ sampleRate: 16000 });
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        const chunks: Float32Array[] = [];

        source.connect(processor);
        processor.connect(ctx.destination);

        await new Promise<void>((resolve) => {
          processor.onaudioprocess = (e) => {
            chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
          };
          setTimeout(resolve, 2500);
        });

        processor.disconnect();
        source.disconnect();
        stream.getTracks().forEach(t => t.stop());
        await ctx.close();

        const total = chunks.reduce((a, c) => a + c.length, 0);
        const merged = new Float32Array(total);
        let off = 0;
        for (const c of chunks) { merged.set(c, off); off += c.length; }

        const rms = Math.sqrt(merged.reduce((s, x) => s + x * x, 0) / merged.length);
        if (rms < 0.004) {
          setPhase('error');
          setErrorMsg(t('recordings.tooQuiet'));
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }

        // Save
        setPhase('saving');
        const wav = encodeWAV(merged, 16000);
        const form = new FormData();
        form.append('audio', wav, 'recording.wav');
        form.append('wakeWord', wakeWord);
        form.append('speaker', speaker);
        if (extraFields) {
          for (const [k, v] of Object.entries(extraFields)) form.append(k, v);
        }

        const res = await fetch(apiPath, { method: 'POST', body: form });
        if (!res.ok) throw new Error(await res.text());

        n++;
        setSaved(n);
        onProgress(n);
        setPhase('saved');
        await new Promise(r => setTimeout(r, 600));
      } catch (e) {
        setPhase('error');
        setErrorMsg(e instanceof Error ? e.message : t('common.error'));
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    setPhase('idle');
  }, [wakeWord, speaker, target, t, onProgress]);

  const stop = () => { stopRef.current = true; };

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Big mic button */}
      <div className="relative">
        <button
          onClick={phase === 'idle' ? record : stop}
          disabled={phase === 'saving'}
          className={cn(
            'w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg',
            phase === 'idle'
              ? 'bg-emerald-500 hover:bg-emerald-600 hover:scale-105'
              : phase === 'recording'
                ? 'bg-red-500 hover:bg-red-600 scale-110 ring-4 ring-red-500/30 animate-pulse'
                : phase === 'saved'
                  ? 'bg-emerald-500 scale-105'
                  : 'bg-slate-400 dark:bg-slate-600 cursor-not-allowed'
          )}
        >
          {phase === 'saving' ? (
            <Loader2 className="w-10 h-10 text-white animate-spin" />
          ) : phase === 'recording' ? (
            <StopCircle className="w-10 h-10 text-white" />
          ) : phase === 'saved' ? (
            <CheckCircle className="w-10 h-10 text-white" />
          ) : (
            <Mic className="w-10 h-10 text-white" />
          )}
        </button>
      </div>

      {/* Status label */}
      <div className="text-center min-h-[3rem]">
        {phase === 'countdown' && (
          <div className="text-6xl font-bold text-emerald-500 tabular-nums">{countdown}</div>
        )}
        {phase === 'recording' && (
          <p className="text-lg font-semibold text-red-500 dark:text-red-400">
            &ldquo;{wakeWord}&rdquo;
          </p>
        )}
        {phase === 'saved' && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
            {t('recordings.saved')}
          </p>
        )}
        {phase === 'error' && (
          <p className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4" /> {errorMsg}
          </p>
        )}
        {phase === 'idle' && saved > 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('recordings.done', { count: saved })}
          </p>
        )}
      </div>

      {/* Progress bar */}
      {(phase !== 'idle' || saved > 0) && (
        <div className="w-full max-w-xs">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
            <span>{t('recordings.progress')}</span>
            <span>{saved} / {target}</span>
          </div>
          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${(saved / target) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
