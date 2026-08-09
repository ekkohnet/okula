import { StartLogStream, StopLogStream } from "#services/logs/service";
import type { LogStreamOptions } from "#services/logs/models";

import { Events } from "@wailsio/runtime";

import { LogBuffer, MAX_LOG_LINES } from "~/utils/logBuffer";
import type { BufferLine, BufferView } from "~/utils/logBuffer";

// What the backend reopen loop is doing. Anything but "live" means the
// stream is between connections rather than tailing.
export type LogStreamState = "live" | "reconnecting" | "waiting";

// Payload of the per-session LogStreamStatus event. Emitted on
// transitions, ordered against LogChunk — no generated binding for it.
interface LogStreamStatus {
  state: LogStreamState;
  reason?: string;
  restarted?: boolean;
  exitCode?: number;
}

export interface StreamSpec {
  namespace: string;
  pod: string;
  container: string;
  previous?: boolean;
  tailLines?: number;
}

// One stream's chip-facing state. Records are plain objects; the
// `streams` ref republishes a fresh array on lifecycle/status changes.
export interface StreamInfo {
  key: string; // namespace/pod/container
  pod: string;
  container: string;
  status: LogStreamState;
  statusReason: string | null;
  running: boolean;
  ended: boolean;
  endedError: string | null;
  startError: string | null;
}

interface StreamRecord extends StreamInfo {
  sessionId: string | null;
  offs: (() => void)[];
  // Per-stream monotonic order key tail (see BufferLine.ot).
  lastOt: number;
  // Diagnostics (perf-gated silence check).
  lastChunkAt: number;
  silenceLogged: boolean;
}

interface IncomingLine {
  t: number;
  text: string;
  marker?: "restart";
  exitCode?: number;
}

// useLogStreams owns the viewer's whole stream layer: one backend
// session per stream, arrivals coalesced through ONE shared rAF flush
// into the merged buffer (one insert + one reactive bump per frame,
// however many streams), line ids minted centrally. open() replaces
// every running stream; state is per-instance.
export function useLogStreams() {
  const buffer = new LogBuffer();
  const view = shallowRef<BufferView>({ rev: 0, lines: buffer.lines });
  const streams = shallowRef<StreamInfo[]>([]);
  // Longest line seen, in characters — pins the pane's horizontal
  // scroll range so the scrollbar doesn't jitter as the window slides.
  const maxLineLength = ref(0);

  let records: StreamRecord[] = [];
  let generation = 0;
  let lineSeq = 0;
  let rev = 0;

  function publishView() {
    view.value = { rev: ++rev, lines: buffer.lines };
  }
  function publishStreams() {
    streams.value = [...records];
  }

  function debugLog(msg: string) {
    if (perfEnabled()) console.debug(`[logstream] ${msg}`);
  }

  // --- Arrival path: enqueue per chunk, flush once per frame ---

  let pending: { rec: StreamRecord; lines: IncomingLine[]; dropped: number }[] = [];
  let pendingCount = 0;
  let rafId: number | null = null;
  // Lines lost to pending-queue overflow (hidden window) fold into the
  // owning stream's gap total at the next flush.
  const asideDropped = new Map<string, number>();

  function enqueue(rec: StreamRecord, incoming: IncomingLine[], dropped = 0) {
    if (!incoming?.length && !dropped) return;
    pending.push({ rec, lines: incoming ?? [], dropped });
    pendingCount += incoming?.length ?? 0;
    // Ring-cap the queue: with rAF suspended (hidden window) it can't
    // grow unbounded, and the overflow would be evicted on insert
    // anyway — but it still counts as loss.
    while (pendingCount > MAX_LOG_LINES * 2 && pending.length > 1) {
      const shed = pending.shift()!;
      pendingCount -= shed.lines.length;
      asideDropped.set(
        shed.rec.key,
        (asideDropped.get(shed.rec.key) ?? 0) + shed.lines.length + shed.dropped,
      );
    }
    if (rafId === null) rafId = requestAnimationFrame(flush);
  }

  function flush() {
    rafId = null;
    if (!pending.length && !asideDropped.size) return;
    const t0 = perfEnabled() ? performance.now() : 0;
    const chunks = pending;
    pending = [];
    pendingCount = 0;

    const batch: BufferLine[] = [];
    let widest = maxLineLength.value;
    for (const { rec, lines } of chunks) {
      for (const raw of lines) {
        // Payload objects are fresh JSON, so stamping in place is safe;
        // markers ride the same path.
        const line = raw as BufferLine;
        line.id = ++lineSeq;
        line.stream = rec.key;
        line.ot = Math.max(line.t, rec.lastOt) || Date.now();
        rec.lastOt = line.ot;
        if (line.text.length > widest) widest = line.text.length;
        batch.push(line);
      }
    }
    // Stable sort: within-stream order survives (ot is non-decreasing
    // per stream), cross-stream ties keep arrival order.
    batch.sort((a, b) => a.ot - b.ot);
    buffer.insert(batch);
    for (const { rec, dropped } of chunks) {
      if (dropped) buffer.recordDropped(rec.key, dropped);
    }
    if (asideDropped.size) {
      for (const [key, n] of asideDropped) buffer.recordDropped(key, n);
      asideDropped.clear();
    }
    maxLineLength.value = widest;
    publishView();

    if (t0) {
      const ms = performance.now() - t0;
      if (ms > 8) {
        debugLog(
          `flush ${batch.length} lines in ${ms.toFixed(1)}ms (buffer ${buffer.lines.length})`,
        );
      }
    }
  }

  // --- Session lifecycle ---

  let silenceTimer: ReturnType<typeof setInterval> | undefined;

  function stopAll() {
    // Invalidates in-flight open()s: a session resolving after this
    // point is discarded, not leaked.
    generation++;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    pending = [];
    pendingCount = 0;
    asideDropped.clear();
    clearInterval(silenceTimer);
    silenceTimer = undefined;

    const stopping = records;
    records = [];
    for (const rec of stopping) {
      for (const off of rec.offs) off();
      rec.offs = [];
      if (rec.sessionId) {
        const id = rec.sessionId;
        rec.sessionId = null;
        debugLog(`${id} stop`);
        StopLogStream(id).catch(() => {
          // The backend ends orphaned sessions with the connection anyway.
        });
      }
    }
    publishStreams();
  }

  // open replaces every running stream with the given set and clears
  // the buffer — sources address different content, nothing carries
  // over.
  async function open(specs: StreamSpec[]) {
    stopAll();
    const gen = ++generation;

    buffer.clear();
    maxLineLength.value = 0;
    publishView();

    records = specs.map((spec) => ({
      key: `${spec.namespace}/${spec.pod}/${spec.container}`,
      pod: spec.pod,
      container: spec.container,
      status: "live" as LogStreamState,
      statusReason: null,
      running: false,
      ended: false,
      endedError: null,
      startError: null,
      sessionId: null,
      offs: [],
      lastOt: 0,
      lastChunkAt: Date.now(),
      silenceLogged: false,
    }));
    publishStreams();
    startSilenceWatch();

    await Promise.all(records.map((rec, i) => startStream(rec, specs[i]!, gen)));
  }

  async function startStream(rec: StreamRecord, spec: StreamSpec, gen: number) {
    let id: string;
    try {
      const opts: LogStreamOptions = {
        namespace: spec.namespace,
        pod: spec.pod,
        container: spec.container,
        previous: spec.previous ?? false,
        tailLines: spec.tailLines ?? 0,
      };
      id = await StartLogStream(opts);
    } catch (err) {
      if (gen !== generation) return;
      rec.startError = toErrorString(err);
      publishStreams();
      return;
    }

    if (gen !== generation) {
      // Superseded while awaiting; discard the session.
      StopLogStream(id).catch(() => {});
      return;
    }

    rec.sessionId = id;
    rec.running = true;
    rec.lastChunkAt = Date.now();
    debugLog(`${id} start ${rec.key}`);
    publishStreams();

    rec.offs.push(
      Events.On(`LogChunk:${id}`, (ev) => {
        rec.lastChunkAt = Date.now();
        rec.silenceLogged = false;
        const chunk = ev?.data ?? ev;
        enqueue(rec, chunk?.lines ?? [], chunk?.dropped ?? 0);
      }),
    );
    rec.offs.push(
      Events.On(`LogStreamEnded:${id}`, (ev) => {
        const payload = ev?.data ?? ev;
        debugLog(`${id} ended${payload?.error ? `: ${payload.error}` : ""}`);
        rec.ended = true;
        rec.endedError = payload?.error || null;
        rec.running = false;
        rec.status = "live";
        rec.statusReason = null;
        publishStreams();
      }),
    );
    rec.offs.push(
      Events.On(`LogStreamStatus:${id}`, (ev) => {
        const payload: LogStreamStatus | undefined = ev?.data ?? ev;
        if (!payload) return;
        debugLog(
          `${id} status ${payload.state}${payload.reason ? ` ${payload.reason}` : ""}${payload.restarted ? " (restarted)" : ""}`,
        );
        // The divider goes through the same queue as chunks, so it
        // lands between the old container's lines and whatever the
        // reopened stream sends next.
        if (payload.restarted) {
          enqueue(rec, [{ t: 0, text: "", marker: "restart", exitCode: payload.exitCode }]);
        }
        rec.status = payload.state ?? "live";
        rec.statusReason = payload.reason || null;
        publishStreams();
      }),
    );
  }

  // Stream diagnostics, perf-gated (okulaPerf): a silence check fires
  // when a running stream delivers nothing for 10s — separates
  // "backend went quiet" from "frontend lost the events".
  function startSilenceWatch() {
    if (!perfEnabled()) return;
    silenceTimer = setInterval(() => {
      for (const rec of records) {
        if (!rec.running || !rec.sessionId) continue;
        const quiet = Date.now() - rec.lastChunkAt;
        if (quiet >= 10_000 && !rec.silenceLogged) {
          rec.silenceLogged = true;
          debugLog(`${rec.sessionId} silent ${Math.round(quiet / 1000)}s (status=${rec.status})`);
        }
      }
    }, 5_000);
  }

  // Clear empties the output; sessions keep flowing, so new lines
  // arrive from the next flush on.
  function clear() {
    pending = [];
    pendingCount = 0;
    asideDropped.clear();
    buffer.clear();
    maxLineLength.value = 0;
    publishView();
  }

  onScopeDispose(() => {
    stopAll();
  });

  return {
    view,
    streams,
    maxLineLength,
    open,
    stop: stopAll,
    clear,
  };
}
