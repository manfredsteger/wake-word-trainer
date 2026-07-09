import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { OUTPUT_DIR } from '@/lib/paths';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name');
  if (!name || name.includes('..')) return new Response('Invalid', { status: 400 });

  const find = (dir: string): string | null => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const r = find(path.join(dir, entry.name));
        if (r) return r;
      } else if (entry.name === name) {
        return path.join(dir, entry.name);
      }
    }
    return null;
  };

  const filePath = find(OUTPUT_DIR);
  if (!filePath) return new Response('Not found', { status: 404 });

  const buf = fs.readFileSync(filePath);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  });
}
