import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import { OUTPUT_DIR } from '@/lib/paths';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = parseInt(rawId);
  const { label } = await req.json() as { label: string };
  if (!label?.trim()) return NextResponse.json({ error: 'label required' }, { status: 400 });

  const run = await db.trainingRun.findUnique({ where: { id } });
  if (!run) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const newSlug = label.trim().toLowerCase().replace(/[\s,!.]+/g, '_').replace(/_+/g, '_');
  const oldSlug = run.modelName;

  // Rename output files if they exist and slug changed
  if (newSlug !== oldSlug) {
    for (const ext of ['.onnx', '.onnx.data']) {
      const oldPath = path.join(OUTPUT_DIR, `${oldSlug}${ext}`);
      const newPath = path.join(OUTPUT_DIR, `${newSlug}${ext}`);
      try {
        if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath);
      } catch { /* ignore rename errors */ }
    }
    // Rename model directory if present
    const oldDir = path.join(OUTPUT_DIR, oldSlug);
    const newDir = path.join(OUTPUT_DIR, newSlug);
    try {
      if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) fs.renameSync(oldDir, newDir);
    } catch { /* ignore */ }
  }

  const updated = await db.trainingRun.update({
    where: { id },
    data: { label: label.trim(), modelName: newSlug },
  });

  return NextResponse.json(updated);
}
