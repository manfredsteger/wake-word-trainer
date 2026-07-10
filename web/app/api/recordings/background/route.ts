import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import os from 'os';
import { DATA_DIR } from '@/lib/paths';

const BG_DIR = path.join(DATA_DIR, 'custom_background');

export async function GET() {
  try {
    if (!fs.existsSync(BG_DIR)) return NextResponse.json({ count: 0, files: [] });
    const files = fs.readdirSync(BG_DIR).filter(f => f.endsWith('.wav'));
    return NextResponse.json({ count: files.length, files });
  } catch {
    return NextResponse.json({ count: 0, files: [] });
  }
}

export async function POST(req: Request) {
  const form = await req.formData();
  const audio = form.get('audio') as File | null;
  if (!audio) return NextResponse.json({ error: 'No audio' }, { status: 400 });

  fs.mkdirSync(BG_DIR, { recursive: true });

  const name = `bg_${Date.now()}.wav`;
  const outPath = path.join(BG_DIR, name);
  const tmpIn = path.join(os.tmpdir(), `bg_in_${Date.now()}.wav`);
  fs.writeFileSync(tmpIn, Buffer.from(await audio.arrayBuffer()));

  try {
    execFileSync('ffmpeg', [
      '-y', '-i', tmpIn,
      '-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le', outPath,
    ], { stdio: 'ignore' });
    fs.unlinkSync(tmpIn);
  } catch {
    fs.renameSync(tmpIn, outPath);
  }

  return NextResponse.json({ ok: true, file: name });
}

export async function DELETE(req: Request) {
  const { file } = await req.json() as { file: string };
  const target = path.join(BG_DIR, path.basename(file));
  try { fs.unlinkSync(target); } catch { /* ignore */ }
  return NextResponse.json({ ok: true });
}
