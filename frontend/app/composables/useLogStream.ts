import { StartLogStream, StopLogStream } from "#services/logs/service";
import type { LogStreamOptions } from "#services/logs/models";

import { Events } from "@wailsio/runtime";

export interface LogLine {
  t: number;
  text: string;
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

  let sessionId: string | null = null;
  let offChunk: (() => void) | null = null;
  let offEnded: (() => void) | null = null;
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

  async function stop() {
    offChunk?.();
    offChunk = null;
    offEnded?.();
    offEnded = null;
    running.value = false;

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
    });
  }

  onScopeDispose(() => {
    stop();
  });

  return { lines, running, ended, endedError, startError, truncated, start, stop };
}
