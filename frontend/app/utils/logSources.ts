import type { LocationQueryValue } from "vue-router";

// A log source is a selector, not a fixed stream: it resolves to a set of
// pod/container streams. The kind prefix in the encoding is the
// discriminant future selector kinds (workloads) extend; only the
// single-pod kind exists today.
export interface PodLogSource {
  kind: "pod";
  namespace: string;
  pod: string;
  // Absent means every container of the pod. Until the merge engine
  // lands, the viewer narrows a bare source to one container and
  // rewrites the URL, so the bare form never persists as an address.
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
