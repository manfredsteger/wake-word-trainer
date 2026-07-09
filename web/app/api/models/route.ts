import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { OUTPUT_DIR } from '@/lib/paths';

export async function GET() {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) return NextResponse.json([]);

    const models: { name: string; size: number; mtime: string; path: string }[] = [];

    // Scan output/ for .onnx files (flat and one level deep)
    const scan = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          scan(path.join(dir, entry.name));
        } else if (entry.name.endsWith('.onnx')) {
          const full = path.join(dir, entry.name);
          const stat = fs.statSync(full);
          models.push({
            name: entry.name,
            size: stat.size,
            mtime: stat.mtime.toISOString(),
            path: full,
          });
        }
      }
    };

    scan(OUTPUT_DIR);
    models.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
    return NextResponse.json(models);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { name } = await req.json() as { name: string };
  if (!name || name.includes('..')) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  try {
    // Find the file
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
    if (!filePath) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    fs.unlinkSync(filePath);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
