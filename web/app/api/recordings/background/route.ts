import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import os from 'os';
import { DATA_DIR } from '@/lib/paths';

const BG_DIR = path.join(DATA_DIR, 'custom_background');

const AUDIO_EXTS = new Set(['.wav', '.flac']);

function listClips() {
  if (!fs.existsSync(BG_DIR)) return [];
  return fs.readdirSync(BG_DIR).filter(f => AUDIO_EXTS.has(path.extname(f).toLowerCase()));
}

export async function GET() {
  try {
    const files = listClips();
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

  const ext = path.extname(audio.name) || '.bin';
  const tmpIn = path.join(os.tmpdir(), `bg_in_${Date.now()}${ext}`);
  const name = `bg_${Date.now()}.flac`;
  const outPath = path.join(BG_DIR, name);

  fs.writeFileSync(tmpIn, Buffer.from(await audio.arrayBuffer()));

  try {
    execFileSync('ffmpeg', [
      '-y', '-i', tmpIn,
      '-ar', '16000', '-ac', '1', '-acodec', 'flac', outPath,
    ], { stdio: 'ignore' });
  } finally {
    try { fs.unlinkSync(tmpIn); } catch { /* ignore */ }
  }

  return NextResponse.json({ ok: true, file: name });
}

export async function PATCH(req: Request) {
  const { file, newName } = await req.json() as { file: string; newName: string };
  if (!file || !newName) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  // Keep original extension, sanitize new stem
  const ext = path.extname(file);
  const stem = newName.trim().replace(/[^a-z0-9_\-äöüÄÖÜß ]/gi, '').replace(/\s+/g, '_').slice(0, 80);
  if (!stem) return NextResponse.json({ error: 'Invalid name' }, { status: 400 });

  const oldPath = path.join(BG_DIR, path.basename(file));
  const newFile = stem + ext;
  const newPath = path.join(BG_DIR, newFile);

  if (!fs.existsSync(oldPath)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (oldPath !== newPath && fs.existsSync(newPath))
    return NextResponse.json({ error: 'Name already exists' }, { status: 409 });

  fs.renameSync(oldPath, newPath);
  return NextResponse.json({ ok: true, file: newFile });
}

export async function DELETE(req: Request) {
  const { file } = await req.json() as { file: string };
  const target = path.join(BG_DIR, path.basename(file));
  try { fs.unlinkSync(target); } catch { /* ignore */ }
  return NextResponse.json({ ok: true });
}
