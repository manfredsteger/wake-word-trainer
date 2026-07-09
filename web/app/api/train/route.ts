import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import { LOGS_DIR, PYTHON, TRAIN_SCRIPT } from '@/lib/paths';

export async function GET() {
  const runs = await db.trainingRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return NextResponse.json(runs);
}

export async function POST(req: Request) {
  const { wakeWord, samples, steps, full } = await req.json() as {
    wakeWord: string;
    samples: number;
    steps: number;
    full: boolean;
  };

  if (!wakeWord?.trim()) return NextResponse.json({ error: 'wakeWord required' }, { status: 400 });

  const modelName = wakeWord.toLowerCase().replace(/[\s,!.]+/g, '_').replace(/_+/g, '_');

  const run = await db.trainingRun.create({
    data: { wakeWord, modelName, samples, steps, fullMode: full, status: 'running' },
  });

  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const logFile = path.join(LOGS_DIR, `run_${run.id}.log`);
  fs.writeFileSync(logFile, '');

  await db.trainingRun.update({ where: { id: run.id }, data: { logFile } });

  const args = [TRAIN_SCRIPT, wakeWord, '--samples', String(samples), '--steps', String(steps)];
  if (full) args.push('--full');

  const logFd = fs.openSync(logFile, 'a');
  const child = spawn(PYTHON, args, {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, PYTHONUNBUFFERED: '1', FORCE_COLOR: '0' },
  });
  child.unref();

  await db.trainingRun.update({ where: { id: run.id }, data: { pid: child.pid } });

  // Watch for process exit to update status
  child.on('close', async (code) => {
    fs.closeSync(logFd);
    const status = code === 0 ? 'done' : 'failed';
    await db.trainingRun.update({
      where: { id: run.id },
      data: { status, finishedAt: new Date() },
    });
    // Append sentinel to log
    try {
      fs.appendFileSync(logFile, `\n__${status.toUpperCase()}__\n`);
    } catch {}
  });

  return NextResponse.json({ id: run.id });
}
