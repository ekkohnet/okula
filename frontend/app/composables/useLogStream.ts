import { StartLogStream, StopLogStream } from "#services/logs/service";
import type { LogStreamOptions } from "#services/logs/models";

import { Events } from "@wailsio/runtime";

export interface LogLine {
  // Monotonic per composable instance, stamped on arrival — stable render
  // keys, and how the viewer's scroll anchor finds a line again after
  // eviction. Never reset (a restart's stale anchor must not collide).
  id: number;
  t: number;
  text: string;
  // Marker entries are viewer-inserted dividers rather than log output; they
  // live in `lines` so they keep their position in the scroll flow.
  marker?: "restart";
  exitCode?: number;
}

// What the backend reopen loop is doing. Anything but "live" means the stream
// is between connections rather than tailing.
export type LogStreamState = "live" | "reconnecting" | "waiting";

// Payload of the per-session LogStreamStatus event. Emitted on transitions,
// ordered against LogChunk — no generated binding for it yet.
interface LogStreamStatus {
  state: LogStreamState;
  reason?: string;
  restarted?: boolean;
  exitCode?: number;
}

export interface LogStreamStart {
  namespace: string;
  pod: string;
  container: string;
  previous?: boolean;
  tailLines?: number;
}

// Ring buffer cap for the viewer — scrollback depth, purely a memory
// bound now that the pane virtualizes (the DOM no longer scales with
// it). The backend's flushRingCap mirrors this; move them together.
// The filter scans the full ring, so raising this raises that cost too.
export const MAX_LOG_LINES = 20000;

// useLogStream owns one backend streaming session at a time: start() replaces
// any running session. State is per-instance — each viewer has its own.
export function useLogStream() {
  const lines = shallowRef<LogLine[]>([]);
  // Longest line seen this stream, in characters. The viewer pins the
  // pane's horizontal scroll range to it — the widest *rendered* line
  // would make the scrollbar jitter as the virtual window slides.
  const maxLineLength = ref(0);
  const running = ref(false);
  const ended = ref(false);
  const endedError = ref<string | null>(null);
  const startError = ref<string | null>(null);
  const status = ref<LogStreamState>("live");
  const statusReason = ref<string | null>(null);

  let sessionId: string | null = null;
  let offChunk: (() => void) | null = null;
  let offEnded: (() => void) | null = null;
  let offStatus: (() => void) | null = null;
  let generation = 0;
  let lineSeq = 0;

  // Stream diagnostics, perf-gated (okulaPerf): lifecycle and status
  // transitions, plus a silence check that fires when a running stream
  // delivers nothing for 10s — separates "backend went quiet" from
  // "frontend lost the events" when a stream looks stalled.
  let lastChunkAt = 0;
  let silenceLogged = false;
  let silenceTimer: ReturnType<typeof setInterval> | undefined;

  function debugLog(msg: string) {
    if (perfEnabled()) console.debug(`[logstream] ${msg}`);
  }

  function append(incoming: Omit<LogLine, "id">[]) {
    if (!incoming?.length) return;

    // Payload objects are fresh JSON, so the stamp mutates in place;
    // markers ride the same path.
    const newLines = incoming as LogLine[];
    let widest = maxLineLength.value;
    for (const line of newLines) {
      line.id = ++lineSeq;
      if (line.text.length > widest) widest = line.text.length;
    }
    maxLineLength.value = widest;

    let next = lines.value.concat(newLines);
    if (next.length > MAX_LOG_LINES) {
      next = next.slice(next.length - MAX_LOG_LINES);
    }
    lines.value = next;
  }

  // Chunks coalesce per animation frame before touching reactivity, so
  // render work is bounded by the frame rate however fast events arrive.
  // Pending is ring-capped: with rAF suspended (hidden window) it can't
  // grow unbounded, and the overflow would be evicted on append anyway.
  let pending: Omit<LogLine, "id">[] = [];
  let rafId: number | null = null;

  function enqueue(newLines: Omit<LogLine, "id">[]) {
    if (!newLines?.length) return;
    pending = pending.concat(newLines);
    if (pending.length > MAX_LOG_LINES) pending = pending.slice(-MAX_LOG_LINES);
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const batch = pending;
        pending = [];
        append(batch);
      });
    }
  }

  // Status describes a running stream only; anything else is idle.
  function clearStatus() {
    status.value = "live";
    statusReason.value = null;
  }

  async function stop() {
    // Invalidate any in-flight start(): its snapshot goes stale, so a
    // session resolving after this point is discarded, not leaked.
    generation++;
    offChunk?.();
    offChunk = null;
    offEnded?.();
    offEnded = null;
    offStatus?.();
    offStatus = null;
    running.value = false;
    clearStatus();
    clearInterval(silenceTimer);
    silenceTimer = undefined;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    pending = [];

    if (sessionId) {
      const id = sessionId;
      sessionId = null;
      debugLog(`${id} stop`);
      await StopLogStream(id).catch(() => {
        // The backend ends orphaned sessions with the connection anyway.
      });
    }
  }

  async function start(opts: LogStreamStart) {
    // Snapshot after stop()'s bump — each start gets a unique value, so
    // of overlapping starts only the latest passes the checks below.
    await stop();
    const gen = ++generation;

    lines.value = [];
    maxLineLength.value = 0;
    ended.value = false;
    endedError.value = null;
    startError.value = null;
    clearStatus();

    let id: string;
    try {
      const streamOpts: LogStreamOptions = {
        namespace: opts.namespace,
        pod: opts.pod,
        container: opts.container,
        previous: opts.previous ?? false,
        tailLines: opts.tailLines ?? 0,
      };
      id = await StartLogStream(streamOpts);
    } catch (err) {
      if (gen === generation) startError.value = toErrorString(err);
      return;
    }

    if (gen !== generation) {
      // Superseded by another start() while awaiting; discard the session.
      StopLogStream(id).catch(() => {});
      return;
    }

    sessionId = id;
    running.value = true;

    debugLog(`${id} start ${opts.namespace}/${opts.pod}/${opts.container}`);
    lastChunkAt = Date.now();
    silenceLogged = false;
    if (perfEnabled()) {
      silenceTimer = setInterval(() => {
        const quiet = Date.now() - lastChunkAt;
        if (quiet >= 10_000 && !silenceLogged) {
          silenceLogged = true;
          debugLog(`${id} silent ${Math.round(quiet / 1000)}s (status=${status.value})`);
        }
      }, 5_000);
    }

    offChunk = Events.On(`LogChunk:${id}`, (ev) => {
      lastChunkAt = Date.now();
      silenceLogged = false;
      const chunk = ev?.data ?? ev;
      enqueue(chunk?.lines ?? []);
    });
    offEnded = Events.On(`LogStreamEnded:${id}`, (ev) => {
      const payload = ev?.data ?? ev;
      debugLog(`${id} ended${payload?.error ? `: ${payload.error}` : ""}`);
      ended.value = true;
      endedError.value = payload?.error || null;
      running.value = false;
      clearStatus();
    });
    offStatus = Events.On(`LogStreamStatus:${id}`, (ev) => {
      const payload: LogStreamStatus | undefined = ev?.data ?? ev;
      if (!payload) return;
      debugLog(
        `${id} status ${payload.state}${payload.reason ? ` ${payload.reason}` : ""}${payload.restarted ? " (restarted)" : ""}`,
      );

      // Insert the divider where the event lands: between the old container's
      // last lines and whatever the reopened stream sends next. Through the
      // same queue as chunks, so it can't jump ahead of pending lines.
      if (payload.restarted) {
        enqueue([{ t: Date.now(), text: "", marker: "restart", exitCode: payload.exitCode }]);
      }
      status.value = payload.state ?? "live";
      statusReason.value = payload.reason || null;
    });
  }

  onScopeDispose(() => {
    stop();
  });

  return {
    lines,
    maxLineLength,
    running,
    ended,
    endedError,
    startError,
    status,
    statusReason,
    start,
    stop,
  };
}
