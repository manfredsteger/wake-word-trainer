'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface TrainingMonitorProps {
  runId: number;
  onDone?: () => void;
}

export function TrainingMonitor({ runId, onDone }: TrainingMonitorProps) {
  const { t } = useI18n();
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<'running' | 'done' | 'failed'>('running');
  const [progress, setProgress] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource(`/api/train/${runId}/stream`);

    es.onmessage = (e) => {
      const data = e.data as string;
      if (data === '__DONE__') {
        setStatus('done');
        es.close();
        onDone?.();
        return;
      }
      if (data === '__FAILED__') {
        setStatus('failed');
        es.close();
        onDone?.();
        return;
      }
      setLines(prev => [...prev.slice(-500), data]);

      // Parse tqdm progress from "N/M" pattern
      const m = data.match(/(\d+)\/(\d+)/);
      if (m) {
        const pct = Math.round((parseInt(m[1]) / parseInt(m[2])) * 100);
        if (pct >= 0 && pct <= 100) setProgress(pct);
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => es.close();
  }, [runId, onDone]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
          <span>{status === 'running' ? t('training.running') : status === 'done' ? t('training.done') : t('training.failed')}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              status === 'failed' ? 'bg-red-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${status === 'done' ? 100 : progress}%` }}
          />
        </div>
      </div>

      {/* Status badge */}
      {status !== 'running' && (
        <div className={`flex items-center gap-2 text-sm font-medium ${
          status === 'done' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
        }`}>
          {status === 'done'
            ? <><CheckCircle className="w-4 h-4" /> {t('training.done')}</>
            : <><XCircle className="w-4 h-4" /> {t('training.failed')}</>
          }
        </div>
      )}

      {/* Log output */}
      <div ref={logRef} className="log-output">
        {lines.length === 0
          ? <span className="text-slate-600">{t('training.logEmpty')}</span>
          : lines.map((l, i) => <div key={i}>{l}</div>)
        }
      </div>
    </div>
  );
}
