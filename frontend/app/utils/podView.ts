import type { BadgeProps } from "@nuxt/ui";

// Display projection for the pod detail page: the raw pod object becomes
// the shapes the page components render (container state, sidecar
// grouping, ephemeral containers, ports/env/probes/resources, conditions,
// labels/annotations). Status-strip facts (status, ready,
// restarts, ...) are NOT derived here — they come from ObjectDetail.row,
// the same backend projection the list shows.

// cAdvisor-shaped usage for the future metrics piece; meters and charts
// stay dormant until it lands.
export interface ContainerMetrics {
  cpuRequest?: number;
  cpuLimit?: number;
  memoryRequest?: number;
  memoryLimit?: number;
  cpu: number[]; // millicores
  memory: number[]; // MiB
}

export interface PodContainerPort {
  name?: string;
  port: number;
  protocol?: string;
}

export interface PodEnvVar {
  name: string;
  value?: string;
  // Source description when the value lives elsewhere ("secret x / key",
  // "configmap x (all keys)"); secret values never render.
  from?: string;
}

export interface PodProbe {
  kind: string; // liveness | readiness | startup
  summary: string; // "http-get :8080/healthz · every 10s"
}

export interface PodContainerView {
  name: string;
  image: string;
  state: string;
  color: BadgeProps["color"];
  restarts: number;
  since?: number;
  detail?: string;
  // Native sidecar (init container with restartPolicy: Always) — grouped
  // with the running containers, tagged.
  sidecar?: boolean;
  // Ephemeral containers only: the container the debug session targets.
  target?: string;
  ports?: PodContainerPort[];
  env?: PodEnvVar[];
  probes?: PodProbe[];
  // Requests/Limits rows from the spec ("100m · 128Mi") — independent of
  // live metrics.
  resources?: [string, string][];
  metrics?: ContainerMetrics;
}

export interface PodContainerGroup {
  title: string;
  items: PodContainerView[];
}

export interface PodConditionView {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  time: number;
}

export interface PodView {
  controlledBy: string;
  serviceAccount: string;
  priorityClass: string;
  uid: string;
  containerGroups: PodContainerGroup[];
  conditions: PodConditionView[];
  labels: [string, string][];
  annotations: [string, string][];
}

// ---- raw pod shapes (only the fields the projection reads) ----

interface RawProbe {
  httpGet?: { path?: string; port?: number | string };
  tcpSocket?: { port?: number | string };
  grpc?: { port?: number };
  exec?: { command?: string[] };
  periodSeconds?: number;
}

interface RawEnvVar {
  name: string;
  value?: string;
  valueFrom?: {
    secretKeyRef?: { name?: string; key?: string };
    configMapKeyRef?: { name?: string; key?: string };
    fieldRef?: { fieldPath?: string };
    resourceFieldRef?: { resource?: string };
  };
}

interface RawEnvFrom {
  prefix?: string;
  configMapRef?: { name?: string };
  secretRef?: { name?: string };
}

interface RawContainer {
  name: string;
  image?: string;
  ports?: { name?: string; containerPort?: number; protocol?: string }[];
  env?: RawEnvVar[];
  envFrom?: RawEnvFrom[];
  resources?: { requests?: Record<string, string>; limits?: Record<string, string> };
  livenessProbe?: RawProbe;
  readinessProbe?: RawProbe;
  startupProbe?: RawProbe;
  // Init containers: "Always" marks a native sidecar.
  restartPolicy?: string;
  // Ephemeral containers: whose process namespace the debug session joins.
  targetContainerName?: string;
}

interface RawContainerState {
  waiting?: { reason?: string; message?: string };
  running?: { startedAt?: string };
  terminated?: { reason?: string; exitCode?: number };
}

interface RawContainerStatus {
  name: string;
  image?: string;
  ready?: boolean;
  restartCount?: number;
  state?: RawContainerState;
  lastState?: RawContainerState;
}

interface RawPod {
  metadata?: {
    uid?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    ownerReferences?: { kind?: string; name?: string; controller?: boolean }[];
  };
  spec?: {
    serviceAccountName?: string;
    priorityClassName?: string;
    containers?: RawContainer[];
    initContainers?: RawContainer[];
    ephemeralContainers?: RawContainer[];
  };
  status?: {
    conditions?: {
      type?: string;
      status?: string;
      reason?: string;
      message?: string;
      lastTransitionTime?: string;
    }[];
    containerStatuses?: RawContainerStatus[];
    initContainerStatuses?: RawContainerStatus[];
    ephemeralContainerStatuses?: RawContainerStatus[];
  };
}

// ---- projection ----

// Waiting reasons that mean broken rather than merely not-yet-started.
const waitingErrors = new Set([
  "CrashLoopBackOff",
  "ImagePullBackOff",
  "ErrImagePull",
  "InvalidImageName",
  "CreateContainerError",
  "CreateContainerConfigError",
]);

function portRows(spec: RawContainer): PodContainerPort[] | undefined {
  const rows = (spec.ports ?? [])
    .filter((p) => p.containerPort !== undefined)
    .map((p) => ({ name: p.name, port: p.containerPort!, protocol: p.protocol }));
  return rows.length ? rows : undefined;
}

function describeValueFrom(vf: RawEnvVar["valueFrom"]): string {
  if (vf?.secretKeyRef) return `secret ${vf.secretKeyRef.name} / ${vf.secretKeyRef.key}`;
  if (vf?.configMapKeyRef) return `configmap ${vf.configMapKeyRef.name} / ${vf.configMapKeyRef.key}`;
  if (vf?.fieldRef) return `field ${vf.fieldRef.fieldPath}`;
  if (vf?.resourceFieldRef) return `resource ${vf.resourceFieldRef.resource}`;
  return "unknown source";
}

// Bulk envFrom imports first (matching precedence: explicit env overrides
// imported keys), as wildcard rows — the imported names live inside the
// configmap/secret, not the pod spec.
function envRows(spec: RawContainer): PodEnvVar[] | undefined {
  const rows: PodEnvVar[] = [];
  for (const ef of spec.envFrom ?? []) {
    const src = ef.configMapRef?.name
      ? `configmap ${ef.configMapRef.name} (all keys)`
      : ef.secretRef?.name
        ? `secret ${ef.secretRef.name} (all keys)`
        : "";
    if (!src) continue;
    rows.push({ name: ef.prefix ? `${ef.prefix}*` : "*", from: src });
  }
  for (const e of spec.env ?? []) {
    if (e.valueFrom) rows.push({ name: e.name, from: describeValueFrom(e.valueFrom) });
    else rows.push({ name: e.name, value: e.value ?? "" });
  }
  return rows.length ? rows : undefined;
}

function probeSummary(p: RawProbe): string {
  let handler: string;
  if (p.httpGet) handler = `http-get :${p.httpGet.port ?? "?"}${p.httpGet.path ?? "/"}`;
  else if (p.tcpSocket) handler = `tcp :${p.tcpSocket.port ?? "?"}`;
  else if (p.grpc) handler = `grpc :${p.grpc.port ?? "?"}`;
  else if (p.exec) handler = `exec ${(p.exec.command ?? []).join(" ")}`;
  else return "—";
  return `${handler} · every ${p.periodSeconds ?? 10}s`;
}

function probeRows(spec: RawContainer): PodProbe[] | undefined {
  const rows: PodProbe[] = [];
  if (spec.livenessProbe) rows.push({ kind: "liveness", summary: probeSummary(spec.livenessProbe) });
  if (spec.readinessProbe)
    rows.push({ kind: "readiness", summary: probeSummary(spec.readinessProbe) });
  if (spec.startupProbe) rows.push({ kind: "startup", summary: probeSummary(spec.startupProbe) });
  return rows.length ? rows : undefined;
}

// Quantity strings render as the spec wrote them ("100m", "1Gi") — no
// normalisation until something needs to do arithmetic on them.
function resourceRows(spec: RawContainer): [string, string][] | undefined {
  const fmt = (r?: Record<string, string>) =>
    r && (r.cpu || r.memory) ? `${r.cpu ?? "—"} · ${r.memory ?? "—"}` : "";
  const rows: [string, string][] = [];
  const requests = fmt(spec.resources?.requests);
  const limits = fmt(spec.resources?.limits);
  if (requests) rows.push(["Requests", requests]);
  if (limits) rows.push(["Limits", limits]);
  return rows.length ? rows : undefined;
}

interface ContainerExtra {
  sidecar?: boolean;
  target?: string;
  // Ephemeral containers have no readiness by definition; without this a
  // healthy debug shell would render "Running (not ready)" as a warning.
  ephemeral?: boolean;
}

// Spec is the authoritative container list (statuses lag on Pending pods);
// state comes from the matching status when it exists.
function projectContainer(
  spec: RawContainer,
  status: RawContainerStatus | undefined,
  extra: ContainerExtra,
): PodContainerView {
  const restarts = status?.restartCount ?? 0;

  let state = "Pending";
  let color: BadgeProps["color"] = "neutral";
  let since: number | undefined;
  let detail = "";

  const s = status?.state;
  if (s?.running) {
    const ready = extra.ephemeral || status?.ready !== false;
    state = ready ? "Running" : "Running (not ready)";
    color = ready ? "success" : "warning";
    since = s.running.startedAt ? Date.parse(s.running.startedAt) : undefined;
  } else if (s?.waiting) {
    state = s.waiting.reason || "Waiting";
    color = waitingErrors.has(state) ? "error" : "warning";
    detail = s.waiting.message ?? "";
  } else if (s?.terminated) {
    state = s.terminated.reason || "Terminated";
    color = s.terminated.exitCode === 0 ? "neutral" : "error";
    if (s.terminated.exitCode !== 0) detail = `Exit code ${s.terminated.exitCode ?? "?"}`;
  }

  const last = status?.lastState?.terminated;
  if (restarts > 0 && last?.reason) {
    const note = `Last restart: ${last.reason}`;
    detail = detail ? `${detail} — ${note}` : note;
  }

  return {
    name: spec.name,
    image: status?.image || spec.image || "",
    state,
    color,
    restarts,
    since,
    detail: detail || undefined,
    sidecar: extra.sidecar,
    target: extra.target,
    ports: portRows(spec),
    env: envRows(spec),
    probes: probeRows(spec),
    resources: resourceRows(spec),
  };
}

export function projectPodView(object: Record<string, unknown>): PodView {
  const pod = object as RawPod;

  const byName = (list?: RawContainerStatus[]) =>
    new Map((list ?? []).map((s) => [s.name, s]));
  const mainStatuses = byName(pod.status?.containerStatuses);
  const initStatuses = byName(pod.status?.initContainerStatuses);
  const ephemeralStatuses = byName(pod.status?.ephemeralContainerStatuses);

  // Grouped by behavior, not spec field: native sidecars live with the
  // running containers; Init keeps only run-to-completion; Ephemeral sits
  // between them in triage order and renders only when present.
  const inits = pod.spec?.initContainers ?? [];
  const running = [
    ...inits
      .filter((c) => c.restartPolicy === "Always")
      .map((c) => projectContainer(c, initStatuses.get(c.name), { sidecar: true })),
    ...(pod.spec?.containers ?? []).map((c) => projectContainer(c, mainStatuses.get(c.name), {})),
  ];
  const ephemeral = (pod.spec?.ephemeralContainers ?? []).map((c) =>
    projectContainer(c, ephemeralStatuses.get(c.name), {
      target: c.targetContainerName,
      ephemeral: true,
    }),
  );
  const initOnly = inits
    .filter((c) => c.restartPolicy !== "Always")
    .map((c) => projectContainer(c, initStatuses.get(c.name), {}));

  const containerGroups = [
    { title: "Containers", items: running },
    { title: "Ephemeral Containers", items: ephemeral },
    { title: "Init Containers", items: initOnly },
  ].filter((g) => g.items.length);

  const owners = pod.metadata?.ownerReferences ?? [];
  const owner = owners.find((o) => o.controller) ?? owners[0];

  const sortedPairs = (rec?: Record<string, string>): [string, string][] =>
    Object.entries(rec ?? {}).sort(([a], [b]) => a.localeCompare(b));

  return {
    controlledBy: owner?.kind && owner?.name ? `${owner.kind}/${owner.name}` : "",
    serviceAccount: pod.spec?.serviceAccountName ?? "",
    priorityClass: pod.spec?.priorityClassName ?? "",
    uid: pod.metadata?.uid ?? "",
    containerGroups,
    conditions: (pod.status?.conditions ?? []).map((c) => ({
      type: c.type ?? "",
      status: c.status ?? "",
      reason: c.reason || undefined,
      message: c.message || undefined,
      time: c.lastTransitionTime ? Date.parse(c.lastTransitionTime) : 0,
    })),
    labels: sortedPairs(pod.metadata?.labels),
    annotations: sortedPairs(pod.metadata?.annotations),
  };
}
