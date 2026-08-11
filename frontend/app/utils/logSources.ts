import type { LocationQueryValue } from "vue-router";

// A log source is a selector, not a fixed stream: it resolves to a set of
// pod/container streams. The kind prefix in the encoding is the
// discriminant future selector kinds (workloads) extend; only the
// single-pod kind exists today.
export interface PodLogSource {
  kind: "pod";
  namespace: string;
  pod: string;
  // Absent means every container of the pod (init included); present
  // narrows the source to one container.
  container?: string;
}

export type LogSource = PodLogSource;

// Encoded form: `pod:<namespace>/<pod>[/<container>]`. K8s names are
// DNS-1123, so `:` and `/` cannot appear inside a segment.
export function formatLogSource(src: LogSource): string {
  const path = [src.namespace, src.pod];
  if (src.container) path.push(src.container);
  return `${src.kind}:${path.join("/")}`;
}

export function parseLogSource(raw: string): LogSource | null {
  const sep = raw.indexOf(":");
  if (sep < 0 || raw.slice(0, sep) !== "pod") return null;

  const segments = raw.slice(sep + 1).split("/");
  if (segments.length < 2 || segments.length > 3) return null;
  const [namespace, pod, container] = segments;
  if (!namespace || !pod || container === "") return null;

  return { kind: "pod", namespace, pod, container };
}

// Reduces a source list to the minimal non-overlapping set: a bare pod
// subsumes its narrowed sources, duplicates collapse — so a stale
// spawn address plus an add can never duplicate streams.
// Order-preserving: survivors keep their positions (order assigns
// color slots on a fresh mount).
export function normalizeLogSources(sources: LogSource[]): LogSource[] {
  const bare = new Set<string>();
  for (const s of sources) {
    if (!s.container) bare.add(`${s.namespace}/${s.pod}`);
  }
  const seen = new Set<string>();
  const out: LogSource[] = [];
  for (const s of sources) {
    if (s.container && bare.has(`${s.namespace}/${s.pod}`)) continue;
    const key = formatLogSource(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

// Reads every `src` query param, keeping the invalid ones for the page
// to report — a URL is an address, and addresses can be stale or
// mistyped.
export function parseLogSources(value: LocationQueryValue | LocationQueryValue[] | undefined): {
  sources: LogSource[];
  invalid: string[];
} {
  const raws = Array.isArray(value) ? value : [value];
  const sources: LogSource[] = [];
  const invalid: string[] = [];
  for (const raw of raws) {
    if (!raw) continue;
    const parsed = parseLogSource(raw);
    if (parsed) sources.push(parsed);
    else invalid.push(raw);
  }
  return { sources, invalid };
}
