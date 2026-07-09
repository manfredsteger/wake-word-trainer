import fs from 'fs';
import { db } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const run = await db.trainingRun.findUnique({ where: { id: parseInt(params.id) } });
  if (!run?.logFile) return new Response('Not found', { status: 404 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (line: string) => {
        controller.enqueue(encoder.encode(`data: ${line}\n\n`));
      };

      let offset = 0;
      let done = false;

      const tick = async () => {
        try {
          const stat = fs.statSync(run.logFile!);
          if (stat.size > offset) {
            const buf = Buffer.alloc(stat.size - offset);
            const fd = fs.openSync(run.logFile!, 'r');
            fs.readSync(fd, buf, 0, buf.length, offset);
            fs.closeSync(fd);
            offset = stat.size;

            const text = buf.toString('utf8');
            for (const line of text.split('\n')) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              if (trimmed === '__DONE__') { send('__DONE__'); done = true; break; }
              if (trimmed === '__FAILED__') { send('__FAILED__'); done = true; break; }
              send(trimmed);
            }
          }

          if (!done) {
            // Check if process is still running via DB status
            const fresh = await db.trainingRun.findUnique({ where: { id: run.id } });
            if (fresh && fresh.status !== 'running') done = true;
          }

          if (done) {
            controller.close();
            return;
          }

          setTimeout(tick, 500);
        } catch {
          controller.close();
        }
      };

      setTimeout(tick, 200);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
