import { useEffect, useRef, useState } from 'react';
import { authFetch } from '../../services/api';

// Live updates for a team project (contract: src/doc/webhooks-api.md section 3).
// Prefers SSE from `GET /api/team-projects/:id/events`; while the backend has no such endpoint
// (404 / 405 / 501) it falls back to light polling, so the screen works either way.

export type LiveMode = 'connecting' | 'live' | 'polling' | 'offline';

export interface LiveEvent {
  id?: string;
  type: string;
  /** Task key (e.g. NEXQ-12) when the event is about one task */
  taskKey?: string;
  data?: any;
}

const POLL_MS = 20_000;
const REPROBE_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 30_000;

// fetch has no EventSource-style parsing, and EventSource cannot send the Authorization header
const readSse = async (body: ReadableStream<Uint8Array>, onFrame: (frame: { id?: string; event: string; data: string }) => void) => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let id: string | undefined;
      let event = 'message';
      const data: string[] = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith(':')) continue; // keepalive comment
        const i = line.indexOf(':');
        const field = i < 0 ? line : line.slice(0, i);
        const val = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
        if (field === 'id') id = val;
        else if (field === 'event') event = val;
        else if (field === 'data') data.push(val);
      }
      if (data.length) onFrame({ id, event, data: data.join('\n') });
    }
  }
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = window.setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { window.clearTimeout(t); resolve(); }, { once: true });
  });

/**
 * Calls `onEvent` whenever the project changes elsewhere. In polling mode it fires a
 * synthetic `{ type: 'poll' }` event (consumers should refetch). Returns the connection mode.
 */
export const useProjectLive = (projectId: string | undefined, onEvent: (event: LiveEvent) => void): LiveMode => {
  const [mode, setMode] = useState<LiveMode>('connecting');
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!projectId) return;
    const ctrl = new AbortController();
    const { signal } = ctrl;
    let lastId = '';
    // Several events often land together (bulk create): refetch once
    let pending: LiveEvent[] = [];
    let flushTimer = 0;
    const emit = (event: LiveEvent) => {
      pending.push(event);
      window.clearTimeout(flushTimer);
      flushTimer = window.setTimeout(() => {
        const batch = pending;
        pending = [];
        batch.forEach((e) => handler.current(e));
      }, 250);
    };

    const poll = async (ms: number) => {
      const until = Date.now() + ms;
      while (!signal.aborted && Date.now() < until) {
        await sleep(POLL_MS, signal);
        if (!signal.aborted && document.visibilityState === 'visible') emit({ type: 'poll' });
      }
    };

    const run = async () => {
      let backoff = 1000;
      while (!signal.aborted) {
        setMode('connecting');
        try {
          const headers: Record<string, string> = { Accept: 'text/event-stream' };
          if (lastId) headers['Last-Event-ID'] = lastId;
          const res = await authFetch(`/api/team-projects/${projectId}/events`, { headers, signal });
          if ([404, 405, 501].includes(res.status)) {
            // Backend without SSE yet
            setMode('polling');
            await poll(REPROBE_MS);
            continue;
          }
          if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);
          setMode('live');
          backoff = 1000;
          await readSse(res.body, ({ id, event, data }) => {
            if (id) lastId = id;
            if (event === 'reset') { lastId = ''; emit({ type: 'reset' }); return; }
            try {
              const env = JSON.parse(data);
              emit({ id, type: env.type || event, taskKey: env.data?.task?.key, data: env });
            } catch {
              emit({ type: event });
            }
          });
          // Stream closed by the server (restart, proxy timeout): reconnect and catch up via Last-Event-ID
        } catch {
          if (signal.aborted) return;
          setMode('offline');
          await sleep(backoff, signal);
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        }
      }
    };
    run();

    // Coming back to the tab: catch up immediately instead of waiting for the next tick
    const onVisible = () => { if (document.visibilityState === 'visible') emit({ type: 'poll' }); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      ctrl.abort();
      window.clearTimeout(flushTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [projectId]);

  return mode;
};
