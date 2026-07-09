import { NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { OUTPUT_DIR } from '@/lib/paths';

// GET: list all speakers and their recording counts
export async function GET() {
  const speakers: Record<string, { count: number; wakeWord: string }> = {};

  if (!fs.existsSync(OUTPUT_DIR)) return NextResponse.json([]);

  for (const model of fs.readdirSync(OUTPUT_DIR, { withFileTypes: true })) {
    if (!model.isDirectory()) continue;
    const trainDir = path.join(OUTPUT_DIR, model.name, 'positive_train');
    if (!fs.existsSync(trainDir)) continue;

    for (const file of fs.readdirSync(trainDir)) {
      const m = file.match(/^real_([^_]+(?:_[^_]+)*)_\d+\.wav$/);
      if (!m) continue;
      const speaker = m[1].replace(/_/g, ' ');
      const key = `${model.name}::${speaker}`;
      if (!speakers[key]) speakers[key] = { count: 0, wakeWord: model.name.replace(/_/g, ' ') };
      speakers[key].count++;
    }
  }

  return NextResponse.json(
    Object.entries(speakers).map(([key, v]) => ({ id: key, speaker: key.split('::')[1], ...v }))
  );
}

// POST: receive WAV blob, save to positive_train/
export async function POST(req: Request) {
  const form = await req.formData();
  const audio = form.get('audio') as File | null;
  const wakeWord = form.get('wakeWord') as string;
  const speaker = form.get('speaker') as string;

  if (!audio || !wakeWord || !speaker)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const modelName = wakeWord.toLowerCase().replace(/[\s,!.]+/g, '_').replace(/_+/g, '_');
  const personSlug = speaker.toLowerCase().replace(/\s+/g, '_');
  const trainDir = path.join(OUTPUT_DIR, modelName, 'positive_train');
  fs.mkdirSync(trainDir, { recursive: true });

  // Get next index
  const existing = fs.readdirSync(trainDir).filter(f => f.startsWith(`real_${personSlug}_`));
  const idx = existing.length + 1;

  // Save raw WAV (browser already encodes at 16kHz mono)
  const outPath = path.join(trainDir, `real_${personSlug}_${String(idx).padStart(3, '0')}.wav`);
  const buf = Buffer.from(await audio.arrayBuffer());

  // Re-encode via ffmpeg to ensure correct format
  const tmpIn = path.join(os.tmpdir(), `rec_in_${Date.now()}.wav`);
  fs.writeFileSync(tmpIn, buf);
  try {
    execFileSync('ffmpeg', [
      '-y', '-i', tmpIn,
      '-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le', outPath
    ], { stdio: 'ignore' });
    fs.unlinkSync(tmpIn);
  } catch {
    fs.renameSync(tmpIn, outPath); // fallback: use raw
  }

  return NextResponse.json({ ok: true, file: path.basename(outPath) });
}
