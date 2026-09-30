import type { Request, Response } from 'express';

/**
 * Tiny in-process pub/sub pushed to browsers with Server-Sent Events.
 * Messages only say *what changed* (topic + year); clients then refetch through
 * the normal, permission-checked REST endpoints. No data travels over SSE, so a
 * public listener cannot learn anything private from it.
 *
 * For multiple API instances, replace `publish` with Postgres NOTIFY and have each
 * instance LISTEN and forward to its local clients.
 */
export interface ChangeMessage {
  topic: string;
  year: number | null;
  at: string;
}

interface Client {
  res: Response;
  audience: 'team' | 'public';
}

const clients = new Set<Client>();

export function publish(msg: ChangeMessage) {
  const data = `event: change\ndata: ${JSON.stringify(msg)}\n\n`;
  for (const c of clients) {
    // The public stream only needs finance, sarees and media changes.
    if (c.audience === 'public' && !['finance', 'sarees', 'media', 'events'].includes(msg.topic)) continue;
    c.res.write(data);
  }
}

export function subscribe(req: Request, res: Response, audience: 'team' | 'public') {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`retry: 5000\n\n`);
  const client: Client = { res, audience };
  clients.add(client);
  // Heartbeat keeps proxies from closing idle connections.
  const ping = setInterval(() => res.write(`: ping\n\n`), 25_000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(client);
  });
}

export const connectedClients = () => clients.size;
