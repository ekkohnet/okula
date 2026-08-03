import { StartLogStream, StopLogStream } from "#services/logs/service";
import type { LogStreamOptions } from "#services/logs/models";

import { Events } from "@wailsio/runtime";

export interface LogLine {
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

// Ring buffer cap for the viewer; older lines fall off. No virtualization
// yet — this bounds DOM size too.
export const MAX_LOG_LINES = 5000;

// useLogStream owns one backend streaming session at a time: start() replaces
// any running session. State is per-instance — each viewer has its own.
export function useLogStream() {
  const lines = shallowRef<LogLine[]>([]);
  const running = ref(false);
  const ended = ref(false);
  const endedError = ref<string | null>(null);
  const startError = ref<string | null>(null);
  const truncated = ref(false);
  const status = ref<LogStreamState>("live");
  const statusReason = ref<string | null>(null);

  let sessionId: string | null = null;
  let offChunk: (() => void) | null = null;
  let offEnded: (() => void) | null = null;
  let offStatus: (() => void) | null = null;
  let generation = 0;

  function append(newLines: LogLine[]) {
    if (!newLines?.length) return;

    let next = lines.value.concat(newLines);
    if (next.length > MAX_LOG_LINES) {
      next = next.slice(next.length - MAX_LOG_LINES);
      truncated.value = true;
    }
    lines.value = next;
  }

  // Status describes a running stream only; anything else is idle.
  function clearStatus() {
    status.value = "live";
    statusReason.value = null;
  }

  async function stop() {
    offChunk?.();
    offChunk = null;
    offEnded?.();
    offEnded = null;
    offStatus?.();
    offStatus = null;
    running.value = false;
    clearStatus();

    if (sessionId) {
      const id = sessionId;
      sessionId = null;
      await StopLogStream(id).catch(() => {
        // The backend ends orphaned sessions with the connection anyway.
      });
    }
  }

  async function start(opts: LogStreamStart) {
    const gen = ++generation;
    await stop();

    lines.value = [];
    truncated.value = false;
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

    offChunk = Events.On(`LogChunk:${id}`, (ev) => {
      const chunk = ev?.data ?? ev;
      append(chunk?.lines ?? []);
    });
    offEnded = Events.On(`LogStreamEnded:${id}`, (ev) => {
      const payload = ev?.data ?? ev;
      ended.value = true;
      endedError.value = payload?.error || null;
      running.value = false;
      clearStatus();
    });
    offStatus = Events.On(`LogStreamStatus:${id}`, (ev) => {
      const payload: LogStreamStatus | undefined = ev?.data ?? ev;
      if (!payload) return;

      // Insert the divider where the event lands: between the old container's
      // last lines and whatever the reopened stream sends next.
      if (payload.restarted) {
        append([{ t: Date.now(), text: "", marker: "restart", exitCode: payload.exitCode }]);
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
    running,
    ended,
    endedError,
    startError,
    truncated,
    status,
    statusReason,
    start,
    stop,
  };
}
