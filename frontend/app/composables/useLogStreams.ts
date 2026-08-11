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
  namespace: string;
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
  // Reconcile removed this stream; an in-flight start discards its
  // session on resolution instead of leaking it.
  closed: boolean;
  // The session witnessed a restart (and emitted its divider) — a
  // previous-logs backfill must not emit a second boundary.
  sawRestart: boolean;
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
// however many streams), line ids minted centrally. open() RECONCILES
// to the given set (piece 6e1): unchanged streams keep running with
// their buffers intact, removed streams close and drop their lines,
// added streams start. State is per-instance.
export function useLogStreams() {
  const buffer = new LogBuffer();
  const view = shallowRef<BufferView>({ rev: 0, lines: buffer.lines });
  const streams = shallowRef<StreamInfo[]>([]);
  // Longest line seen, in characters — pins the pane's horizontal
  // scroll range so the scrollbar doesn't jitter as the window slides.
  const maxLineLength = ref(0);

  let records: StreamRecord[] = [];
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

  function closeRecord(rec: StreamRecord) {
    rec.closed = true;
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

  function stopAll() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    pending = [];
    pendingCount = 0;
    asideDropped.clear();
    clearInterval(silenceTimer);
    silenceTimer = undefined;

    const stopping = records;
    records = [];
    for (const rec of stopping) closeRecord(rec);
    publishStreams();
  }

  // Reconciles the running set to `specs`: streams already running (or
  // ended — reconcile never restarts; callers restart explicitly via
  // stop + clear + open) keep their records and buffered lines,
  // removed streams close and drop their lines, added streams start.
  // Callers always pass the full desired set.
  async function open(specs: StreamSpec[]) {
    const desired = new Set(specs.map((s) => `${s.namespace}/${s.pod}/${s.container}`));

    const kept = new Map<string, StreamRecord>();
    let removedAny = false;
    for (const rec of records) {
      if (desired.has(rec.key)) {
        kept.set(rec.key, rec);
      } else {
        closeRecord(rec);
        buffer.removeStream(rec.key);
        removedAny = true;
      }
    }
    if (removedAny) {
      pending = pending.filter((p) => {
        if (desired.has(p.rec.key)) return true;
        pendingCount -= p.lines.length;
        return false;
      });
      for (const key of [...asideDropped.keys()]) {
        if (!desired.has(key)) asideDropped.delete(key);
      }
      publishView();
    }

    const toStart: [StreamRecord, StreamSpec][] = [];
    const next: StreamRecord[] = [];
    const seen = new Set<string>();
    for (const spec of specs) {
      const key = `${spec.namespace}/${spec.pod}/${spec.container}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const existing = kept.get(key);
      if (existing) {
        next.push(existing);
        continue;
      }
      const rec: StreamRecord = {
        key,
        namespace: spec.namespace,
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
        closed: false,
        sawRestart: false,
        lastOt: 0,
        lastChunkAt: Date.now(),
        silenceLogged: false,
      };
      next.push(rec);
      toStart.push([rec, spec]);
    }
    records = next;
    publishStreams();
    startSilenceWatch();

    await Promise.all(toStart.map(([rec, spec]) => startStream(rec, spec)));
  }

  async function startStream(rec: StreamRecord, spec: StreamSpec) {
    // Client-generated session id (the piece-5 pattern): handlers
    // register BEFORE the call, so nothing a fast session emits can
    // slip through the registration gap.
    const id = `log-${crypto.randomUUID()}`;
    registerHandlers(rec, id);

    try {
      const opts: LogStreamOptions = {
        namespace: spec.namespace,
        pod: spec.pod,
        container: spec.container,
        previous: spec.previous ?? false,
        tailLines: spec.tailLines ?? 0,
        sessionId: id,
      };
      await StartLogStream(opts);
    } catch (err) {
      if (rec.closed) return;
      for (const off of rec.offs) off();
      rec.offs = [];
      rec.startError = toErrorString(err);
      publishStreams();
      return;
    }

    if (rec.closed) {
      // Removed while awaiting; discard the session.
      StopLogStream(id).catch(() => {});
      return;
    }

    rec.sessionId = id;
    // A finite session (completed init container's replay) can end
    // before the call resolves — its handler already ran; don't
    // resurrect it as running.
    if (!rec.ended) rec.running = true;
    rec.lastChunkAt = Date.now();
    debugLog(`${id} start ${rec.key}`);
    publishStreams();
  }

  function registerHandlers(rec: StreamRecord, id: string) {
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
          rec.sawRestart = true;
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
    if (!perfEnabled() || silenceTimer) return;
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

  // One-shot previous-instance backfill (piece 6e4): fetches the prior
  // instance's logs and inserts only lines older than the stream's
  // retention floor — cutoff insertion, duplicate-free whatever the
  // session witnessed (un-witnessed restart: everything lands;
  // partial-witness: exactly the missing earlier part; fully
  // witnessed: nothing). Returns the number of inserted lines.
  async function loadPrevious(key: string, exitCode?: number): Promise<number> {
    const rec = records.find((r) => r.key === key);
    if (!rec || rec.closed) throw new Error("stream is no longer open");

    // Handlers register before the call (the piece-5 pattern): a
    // previous fetch is finite and can replay + end entirely inside
    // the registration gap. Resolution rides the FINAL CHUNK, not the
    // ended event — event emits can reorder by payload size (a huge
    // chunk marshals slower than the tiny ended), so finalizing on
    // ended could resolve before the lines arrive. Ended is the error
    // path only; after a clean ended the handlers stay registered
    // until the final chunk lands.
    const id = `logprev-${crypto.randomUUID()}`;
    const incoming: IncomingLine[] = [];
    const offs: (() => void)[] = [];
    const result = new Promise<number>((resolve, reject) => {
      offs.push(
        Events.On(`LogChunk:${id}`, (ev) => {
          const chunk = ev?.data ?? ev;
          for (const raw of chunk?.lines ?? []) incoming.push(raw);
          if (chunk?.final) {
            for (const off of offs) off();
            if (rec.closed) resolve(0);
            else resolve(insertBackfill(rec, incoming, exitCode));
          }
        }),
      );
      offs.push(
        Events.On(`LogStreamEnded:${id}`, (ev) => {
          const payload = ev?.data ?? ev;
          if (payload?.error) {
            for (const off of offs) off();
            reject(new Error(payload.error));
          }
        }),
      );
    });

    try {
      const opts: LogStreamOptions = {
        namespace: rec.namespace,
        pod: rec.pod,
        container: rec.container,
        previous: true,
        tailLines: MAX_LOG_LINES,
        sessionId: id,
      };
      await StartLogStream(opts);
      debugLog(`${id} previous ${key}`);
    } catch (err) {
      for (const off of offs) off();
      throw err;
    }
    return result;
  }

  function insertBackfill(rec: StreamRecord, incoming: IncomingLine[], exitCode?: number): number {
    const floor = buffer.earliestT(rec.key) ?? Number.POSITIVE_INFINITY;
    const batch: BufferLine[] = [];
    // Backfill lines are deliberately older than the stream's live
    // tail, so they bypass the per-stream monotonic clamp and carry
    // their own ordering seed.
    let ot = 0;
    let widest = maxLineLength.value;
    for (const raw of incoming) {
      if (!raw.t || raw.t >= floor) continue;
      const line = raw as BufferLine;
      line.id = ++lineSeq;
      line.stream = rec.key;
      ot = Math.max(line.t, ot);
      line.ot = ot;
      if (line.text.length > widest) widest = line.text.length;
      batch.push(line);
    }
    debugLog(
      `previous backfill ${rec.key}: ${incoming.length} fetched, ${batch.length} kept (floor ${floor})`,
    );
    if (!batch.length) return 0;
    // The backfill's end is the restart the session didn't see — a
    // standard restart divider, emitted only when un-witnessed (the
    // witnessed divider already marks the boundary). Same ot as the
    // last backfill line: the batch is stable-sorted, so it lands
    // after it and before the retained floor.
    if (!rec.sawRestart) {
      batch.push({
        id: ++lineSeq,
        stream: rec.key,
        t: 0,
        ot,
        text: "",
        marker: "restart",
        exitCode,
      } as BufferLine);
    }
    const inserted = rec.sawRestart ? batch.length : batch.length - 1;
    buffer.insert(batch);
    maxLineLength.value = widest;
    publishView();
    return inserted;
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
    loadPrevious,
  };
}
