import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync, execFileSync } from 'child_process';
import { OUTPUT_DIR } from '@/lib/paths';

interface Segment { start: number; end: number; }

function detectSegments(filePath: string): Segment[] {
  // Run ffmpeg silencedetect — output is on stderr
  const result = spawnSync('ffmpeg', [
    '-i', filePath,
    '-af', 'silencedetect=noise=-38dB:d=0.25',
    '-f', 'null', '-',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  const out = result.stderr ?? '';

  // Parse total duration
  const durMatch = out.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const totalDur = durMatch
    ? parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3])
    : 0;

  if (totalDur === 0) return [];

  // Parse silence intervals
  const silenceStarts: number[] = [];
  const silenceEnds: number[] = [];
  for (const line of out.split('\n')) {
    const s = line.match(/silence_start:\s*([\d.]+)/);
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (s) silenceStarts.push(parseFloat(s[1]));
    if (e) silenceEnds.push(parseFloat(e[1]));
  }

  // If no silence detected (file is one continuous clip), return it whole
  if (silenceStarts.length === 0) {
    return totalDur >= 0.4 ? [{ start: 0, end: totalDur }] : [];
  }

  // Build speech segments between silence intervals
  const segments: Segment[] = [];
  const PAD = 0.08; // 80ms padding around each word
  let speechStart = 0;

  for (let i = 0; i < silenceStarts.length; i++) {
    const segEnd = silenceStarts[i];
    const duration = segEnd - speechStart;
    if (duration >= 0.4 && duration <= 8) {
      segments.push({
        start: Math.max(0, speechStart - PAD),
        end: Math.min(totalDur, segEnd + PAD),
      });
    }
    speechStart = silenceEnds[i] ?? totalDur;
  }

  // Last segment after final silence
  const lastDur = totalDur - speechStart;
  if (lastDur >= 0.4 && lastDur <= 8) {
    segments.push({ start: Math.max(0, speechStart - PAD), end: totalDur });
  }

  return segments;
}

function nextIndex(dir: string, personSlug: string): number {
  try {
    return fs.readdirSync(dir).filter(f => f.startsWith(`real_${personSlug}_`)).length + 1;
  } catch { return 1; }
}

export async function POST(req: Request) {
  const form = await req.formData();
  const audio = form.get('audio') as File | null;
  const wakeWord = form.get('wakeWord') as string;
  const speaker = form.get('speaker') as string;
  const mode = (form.get('mode') as string) ?? 'auto'; // 'auto' | 'single'

  if (!audio || !wakeWord || !speaker)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const modelName = wakeWord.toLowerCase().replace(/[\s,!.]+/g, '_').replace(/_+/g, '_');
  const personSlug = speaker.toLowerCase().replace(/\s+/g, '_');
  const trainDir = path.join(OUTPUT_DIR, modelName, 'positive_train');
  fs.mkdirSync(trainDir, { recursive: true });

  // Save original upload to temp file
  const ext = path.extname(audio.name) || '.bin';
  const tmpIn = path.join(os.tmpdir(), `upload_${Date.now()}${ext}`);
  fs.writeFileSync(tmpIn, Buffer.from(await audio.arrayBuffer()));

  // Convert to 16kHz mono WAV first (ffmpeg handles all formats)
  const tmpWav = path.join(os.tmpdir(), `upload_${Date.now()}.wav`);
  try {
    execFileSync('ffmpeg', [
      '-y', '-i', tmpIn,
      '-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le', tmpWav,
    ], { stdio: 'ignore' });
  } finally {
    try { fs.unlinkSync(tmpIn); } catch { /* ignore */ }
  }

  let savedCount = 0;
  const errors: string[] = [];

  try {
    // Decide: split on silence, or save as single clip?
    const stat = fs.statSync(tmpWav);
    const durationEst = stat.size / (16000 * 2); // rough estimate in seconds
    const shouldSplit = mode === 'auto' && durationEst > 5;

    if (shouldSplit) {
      const segments = detectSegments(tmpWav);
      if (segments.length === 0) {
        // Fallback: save as single clip
        const idx = nextIndex(trainDir, personSlug);
        const out = path.join(trainDir, `real_${personSlug}_${String(idx).padStart(3, '0')}.wav`);
        fs.copyFileSync(tmpWav, out);
        savedCount = 1;
      } else {
        for (const seg of segments) {
          const idx = nextIndex(trainDir, personSlug);
          const out = path.join(trainDir, `real_${personSlug}_${String(idx).padStart(3, '0')}.wav`);
          try {
            execFileSync('ffmpeg', [
              '-y', '-i', tmpWav,
              '-ss', String(seg.start),
              '-to', String(seg.end),
              '-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le', out,
            ], { stdio: 'ignore' });
            savedCount++;
          } catch (e) {
            errors.push(`Segment ${seg.start.toFixed(1)}s–${seg.end.toFixed(1)}s: ${e}`);
          }
        }
      }
    } else {
      // Single clip — save directly
      const idx = nextIndex(trainDir, personSlug);
      const out = path.join(trainDir, `real_${personSlug}_${String(idx).padStart(3, '0')}.wav`);
      fs.copyFileSync(tmpWav, out);
      savedCount = 1;
    }
  } finally {
    try { fs.unlinkSync(tmpWav); } catch { /* ignore */ }
  }

  return NextResponse.json({ ok: true, saved: savedCount, errors });
}
