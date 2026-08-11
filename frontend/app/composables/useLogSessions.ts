// Session memory for the log viewer (ui-redesign piece 6e3): the last
// viewer address (the sidebar entry's target) and recent compositions
// (the palette's restore path). Deliberately session-scoped: recents
// reference pod names, which rollouts churn — persistence reopens with
// workload selectors. One global memory, cluster-relative like history
// itself: a remembered address after a cluster switch lands on empty
// results, the accepted semantics.

export interface RecentLogSession {
  // Formatted source strings, normalized order (the URL's src values).
  srcs: string[];
  // Displacement time (Unix ms) — shown relative in the palette.
  at: number;
}

const RECENTS_CAP = 8;

export function useLogSessions() {
  const lastUrl = useState<string | null>("log-viewer:last-url", () => null);
  // The last composition seen on the page — displacement detection
  // compares against this, surviving page remounts (a pod-page Logs
  // click replaces a composition the new mount never saw).
  const lastSrcs = useState<string[]>("log-viewer:last-srcs", () => []);
  const recents = useState<RecentLogSession[]>("log-viewer:recents", () => []);

  function noteUrl(fullPath: string) {
    lastUrl.value = fullPath;
  }

  // Records a displaced composition, deduped by set identity, most
  // recent first, capped.
  function recordDisplaced(srcs: string[]) {
    if (!srcs.length) return;
    const key = [...srcs].sort().join("&");
    const next = recents.value.filter((r) => [...r.srcs].sort().join("&") !== key);
    next.unshift({ srcs: [...srcs], at: Date.now() });
    recents.value = next.slice(0, RECENTS_CAP);
  }

  return { lastUrl, lastSrcs, recents, noteUrl, recordDisplaced };
}
