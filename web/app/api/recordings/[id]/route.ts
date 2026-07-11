import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { OUTPUT_DIR } from '@/lib/paths';

// DELETE all recordings for a speaker+model combo (id = "modelName::speaker name")
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [modelName, speaker] = decodeURIComponent(id).split('::');
  if (!modelName || !speaker) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const personSlug = speaker.replace(/\s+/g, '_');
  const trainDir = path.join(OUTPUT_DIR, modelName.replace(/\s+/g, '_'), 'positive_train');

  if (!fs.existsSync(trainDir)) return NextResponse.json({ ok: true, deleted: 0 });

  let deleted = 0;
  for (const file of fs.readdirSync(trainDir)) {
    if (file.startsWith(`real_${personSlug}_`) && file.endsWith('.wav')) {
      fs.unlinkSync(path.join(trainDir, file));
      deleted++;
    }
  }

  return NextResponse.json({ ok: true, deleted });
}
