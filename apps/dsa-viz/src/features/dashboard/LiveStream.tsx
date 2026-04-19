import { useEffect, useState } from "react";

type StreamEvent = { type: string; data: unknown; ts: string };

const SSE_URL = "/api/v1/analysis/tasks/stream";
const MAX_EVENTS = 50;
const MAX_RECONNECT = 3;
const RECONNECT_DELAY_MS = 5000;

export function LiveStream({ enabled }: { enabled: boolean }) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let attempts = 0;
    let es: EventSource | null = null;
    let timer: number | null = null;

    const handleEvent = (eventType: string, raw: string) => {
      try {
        const parsed = JSON.parse(raw);
        setEvents((prev) => [{ type: eventType, data: parsed, ts: new Date().toISOString() }, ...prev].slice(0, MAX_EVENTS));
      } catch {
        setEvents((prev) => [{ type: eventType, data: raw, ts: new Date().toISOString() }, ...prev].slice(0, MAX_EVENTS));
      }
      setError(null);
    };

    const connect = () => {
      es = new EventSource(SSE_URL);
      ["connected", "task_created", "task_started", "task_completed", "task_failed", "heartbeat"].forEach((t) => {
        es!.addEventListener(t, (ev: MessageEvent) => handleEvent(t, ev.data));
      });
      es.onerror = () => {
        es?.close();
        if (attempts >= MAX_RECONNECT) {
          setError("SSE 连接失败，已停止自动重试");
          return;
        }
        attempts += 1;
        timer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();
    return () => {
      es?.close();
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div className="rounded border border-slate-800 p-3">
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-sm text-slate-300">盘中事件流</h4>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
      <ul className="text-xs text-slate-400 space-y-1 max-h-48 overflow-auto">
        {events.map((e, i) => (
          <li key={i}><span className="text-slate-500">{e.ts.slice(11, 19)}</span> {e.type} · {JSON.stringify(e.data).slice(0, 120)}</li>
        ))}
      </ul>
    </div>
  );
}
