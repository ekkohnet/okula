import type { BadgeProps } from "@nuxt/ui";

// Static fixtures for the /design/* mock pages. Display-level shapes (not
// raw K8s objects): the mocks explore layout, not parsing — the real page
// reuses PodSummary's projection logic.

// cAdvisor-shaped usage: per-container samples plus the spec's
// requests/limits for headroom meters. One sample per minute, oldest first.
export interface ContainerMetrics {
  cpuRequest?: number;
  cpuLimit?: number;
  memoryRequest?: number;
  memoryLimit?: number;
  cpu: number[]; // millicores
  memory: number[]; // MiB
}

export interface FixtureContainer {
  name: string;
  image: string;
  state: string;
  color: BadgeProps["color"];
  restarts: number;
  since?: number;
  detail?: string;
  metrics?: ContainerMetrics;
  // Native sidecar (init container with restartPolicy: Always) — grouped
  // with the running containers, tagged, and included in metrics.
  sidecar?: boolean;
  // Ephemeral containers only: the container whose process namespace the
  // debug session targets.
  target?: string;
  ports?: { name?: string; port: number; protocol?: string }[];
  env?: { name: string; value?: string; from?: string }[];
  probes?: { kind: string; summary: string }[];
}

export interface FixtureCondition {
  type: string;
  status: "True" | "False";
  reason?: string;
  message?: string;
  time: number;
}

export interface FixtureEvent {
  type: "Normal" | "Warning";
  reason: string;
  message: string;
  count: number;
  lastSeen: number;
  source: string;
}

export interface PodFixture {
  key: string;
  label: string;
  name: string;
  namespace: string;
  status: string;
  statusColor: BadgeProps["color"];
  ready: string;
  restarts: number;
  qos: string;
  ip: string;
  node: string;
  priorityClass: string;
  serviceAccount: string;
  controlledBy: string;
  uid: string;
  createdAt: number;
  initContainers: FixtureContainer[];
  containers: FixtureContainer[];
  // Debug attachments (kubectl debug). Usually absent; terminated ones
  // linger in the spec forever — both states need a rendering.
  ephemeralContainers?: FixtureContainer[];
  conditions: FixtureCondition[];
  labels: [string, string][];
  annotations: [string, string][];
  events: FixtureEvent[];
}

const now = Date.now();
const min = 60_000;
const hr = 3_600_000;
const day = 86_400_000;

// Deterministic wiggly series so the charts render the same every load.
const POINTS = 40;
const series = (f: (i: number) => number): number[] =>
  Array.from({ length: POINTS }, (_, i) => Math.round(Math.max(0, f(i))));

export const podFixtures: PodFixture[] = [
  {
    key: "healthy",
    label: "Healthy",
    name: "api-6d9f7b9c4d-xkq2p",
    namespace: "production",
    status: "Running",
    statusColor: "success",
    ready: "2/2",
    restarts: 0,
    qos: "Burstable",
    ip: "10.0.4.87",
    node: "ip-10-0-4-112.eu-west-2.compute.internal",
    priorityClass: "",
    serviceAccount: "api",
    controlledBy: "ReplicaSet/api-6d9f7b9c4d",
    uid: "b7a9c3e1-4f2d-4c8a-9e1b-7d3f5a2c8e94",
    createdAt: now - 3 * day,
    initContainers: [
      {
        name: "envoy-sidecar",
        image: "envoyproxy/envoy:v1.31.2",
        state: "Running",
        color: "success",
        restarts: 0,
        since: now - 3 * day,
        sidecar: true,
        ports: [{ name: "admin", port: 9901 }],
        env: [{ name: "ENVOY_LOG_LEVEL", value: "warn" }],
        probes: [{ kind: "readiness", summary: "http-get :9901/ready · every 5s" }],
        metrics: {
          cpuRequest: 100,
          cpuLimit: 200,
          memoryRequest: 128,
          memoryLimit: 256,
          cpu: series((i) => 38 + 9 * Math.sin(i / 2.4) + 4 * Math.sin(i / 1.1)),
          memory: series((i) => 92 + 3 * Math.sin(i / 3)),
        },
      },
    ],
    containers: [
      {
        name: "api",
        image: "ghcr.io/acme/api:1.42.0",
        state: "Running",
        color: "success",
        restarts: 0,
        since: now - 3 * day,
        ports: [
          { name: "http", port: 8080 },
          { name: "metrics", port: 9090 },
        ],
        env: [
          { name: "DATABASE_URL", from: "secret api-db / url" },
          { name: "STRIPE_API_KEY", from: "secret payment-keys / live" },
          { name: "LOG_LEVEL", value: "info" },
          { name: "PORT", value: "8080" },
        ],
        probes: [
          { kind: "liveness", summary: "http-get :8080/healthz · every 10s" },
          { kind: "readiness", summary: "http-get :8080/ready · every 5s" },
        ],
        metrics: {
          cpuRequest: 250,
          cpuLimit: 1000,
          memoryRequest: 256,
          memoryLimit: 512,
          cpu: series((i) => 130 + 40 * Math.sin(i / 3.2) + 18 * Math.sin(i / 1.3)),
          memory: series((i) => 218 + i * 0.4 + 6 * Math.sin(i / 2.1)),
        },
      },
    ],
    conditions: [
      { type: "PodScheduled", status: "True", time: now - 3 * day },
      { type: "Initialized", status: "True", time: now - 3 * day },
      { type: "ContainersReady", status: "True", time: now - 3 * day },
      { type: "Ready", status: "True", time: now - 3 * day },
    ],
    labels: [
      ["app", "api"],
      ["pod-template-hash", "6d9f7b9c4d"],
      ["version", "v1.42.0"],
      ["team", "payments"],
    ],
    annotations: [
      ["prometheus.io/scrape", "true"],
      ["prometheus.io/port", "9090"],
    ],
    events: [],
  },
  {
    key: "crashing",
    label: "Crashing",
    name: "billing-worker-7c9fd6b8d5-w4nlk",
    namespace: "production",
    status: "CrashLoopBackOff",
    statusColor: "error",
    ready: "0/1",
    restarts: 312,
    qos: "Guaranteed",
    ip: "10.0.7.203",
    node: "ip-10-0-7-88.eu-west-2.compute.internal",
    priorityClass: "high-priority",
    serviceAccount: "billing-worker",
    controlledBy: "ReplicaSet/billing-worker-7c9fd6b8d5",
    uid: "e2d8f5a1-9c3b-4e7d-8a2f-1b6c9d4e7f30",
    createdAt: now - 26 * hr,
    initContainers: [],
    containers: [
      {
        name: "worker",
        image: "ghcr.io/acme/billing-worker:2.3.1",
        state: "CrashLoopBackOff",
        color: "error",
        restarts: 312,
        detail: "Back-off 5m0s restarting failed container — Last restart: Error (exit 1)",
        env: [
          { name: "QUEUE_URL", from: "secret billing-queue / url" },
          { name: "BATCH_SIZE", value: "500" },
        ],
        probes: [{ kind: "liveness", summary: "exec ./healthcheck · every 30s" }],
        // Sawtooth: climbs while running, drops to zero on each crash.
        metrics: {
          cpuRequest: 500,
          cpuLimit: 500,
          memoryRequest: 256,
          memoryLimit: 256,
          cpu: series((i) => (i % 13 < 9 ? 30 + (i % 13) * 55 : 0)),
          memory: series((i) => (i % 13 < 9 ? 42 + (i % 13) * 26 : 0)),
        },
      },
    ],
    conditions: [
      { type: "PodScheduled", status: "True", time: now - 26 * hr },
      { type: "Initialized", status: "True", time: now - 26 * hr },
      {
        type: "ContainersReady",
        status: "False",
        reason: "ContainersNotReady",
        message: "containers with unready status: [worker]",
        time: now - 25 * hr,
      },
      {
        type: "Ready",
        status: "False",
        reason: "ContainersNotReady",
        message: "containers with unready status: [worker]",
        time: now - 25 * hr,
      },
    ],
    labels: [
      ["app", "billing-worker"],
      ["pod-template-hash", "7c9fd6b8d5"],
    ],
    annotations: [["prometheus.io/scrape", "true"]],
    ephemeralContainers: [
      {
        name: "debugger-x7ln4",
        image: "nicolaka/netshoot:v0.13",
        state: "Running",
        color: "success",
        restarts: 0,
        since: now - 4 * min,
        target: "worker",
        env: [{ name: "TERM", value: "xterm-256color" }],
      },
    ],
    events: [
      {
        type: "Warning",
        reason: "BackOff",
        message: "Back-off restarting failed container worker",
        count: 1543,
        lastSeen: now - 2 * min,
        source: "kubelet, ip-10-0-7-88.eu-west-2.compute.internal",
      },
      {
        type: "Normal",
        reason: "Pulled",
        message: 'Container image "ghcr.io/acme/billing-worker:2.3.1" already present on machine',
        count: 313,
        lastSeen: now - 7 * min,
        source: "kubelet, ip-10-0-7-88.eu-west-2.compute.internal",
      },
      {
        type: "Normal",
        reason: "Created",
        message: "Created container worker",
        count: 313,
        lastSeen: now - 7 * min,
        source: "kubelet, ip-10-0-7-88.eu-west-2.compute.internal",
      },
      {
        type: "Normal",
        reason: "Started",
        message: "Started container worker",
        count: 313,
        lastSeen: now - 7 * min,
        source: "kubelet, ip-10-0-7-88.eu-west-2.compute.internal",
      },
    ],
  },
  {
    key: "ugly",
    label: "Ugly",
    name: "opentelemetry-collector-contrib-agent-daemonset-x7z2m",
    namespace: "observability-system",
    status: "Running",
    statusColor: "success",
    ready: "4/5",
    restarts: 3,
    qos: "Burstable",
    ip: "10.0.12.44",
    node: "ip-10-0-12-201.eu-west-2.compute.internal",
    priorityClass: "system-node-critical",
    serviceAccount: "otel-collector",
    controlledBy: "DaemonSet/opentelemetry-collector-contrib-agent",
    uid: "4c1f8e2a-7b5d-4a9c-b3e6-9f2d5c8a1e47",
    createdAt: now - 41 * day,
    initContainers: [
      {
        name: "init-config",
        image: "busybox:1.36",
        state: "Completed",
        color: "neutral",
        restarts: 0,
      },
      {
        name: "init-certs",
        image: "ghcr.io/acme/cert-init:0.9.1",
        state: "Completed",
        color: "neutral",
        restarts: 0,
      },
      {
        name: "fluent-bit",
        image: "cr.fluentbit.io/fluent/fluent-bit:3.1.9",
        state: "Running",
        color: "success",
        restarts: 0,
        since: now - 41 * day,
        sidecar: true,
        ports: [{ name: "metrics", port: 2020 }],
        env: [{ name: "FLB_LOG_LEVEL", value: "info" }],
        metrics: {
          cpuRequest: 100,
          cpuLimit: 200,
          memoryRequest: 128,
          memoryLimit: 256,
          cpu: series((i) => 55 + 25 * Math.sin(i / 1.8)),
          memory: series((i) => 118 + 8 * Math.sin(i / 3.1)),
        },
      },
    ],
    containers: [
      {
        name: "otc-container",
        image:
          "ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib:0.142.0",
        state: "Running",
        color: "success",
        restarts: 3,
        since: now - 6 * day,
        detail: "Last restart: OOMKilled",
        ports: [
          { name: "otlp-grpc", port: 4317 },
          { name: "otlp-http", port: 4318 },
          { name: "metrics", port: 8888 },
        ],
        env: [
          { name: "GOMEMLIMIT", value: "1100MiB" },
          { name: "K8S_NODE_NAME", from: "fieldRef spec.nodeName" },
          { name: "OTEL_CONFIG", value: "/conf/relay.yaml" },
        ],
        probes: [
          { kind: "liveness", summary: "http-get :13133/ · every 10s" },
          { kind: "readiness", summary: "http-get :13133/ · every 10s" },
        ],
        // Memory creeping toward the limit again after the OOMKill.
        metrics: {
          cpuRequest: 400,
          cpuLimit: 800,
          memoryRequest: 768,
          memoryLimit: 1200,
          cpu: series((i) => 380 + 180 * Math.sin(i / 2.6) + 90 * Math.sin(i / 1.2)),
          memory: series((i) => 920 + i * 6 + 20 * Math.sin(i / 2)),
        },
      },
      {
        name: "config-reloader",
        image: "jimmidyson/configmap-reload:v0.12.0",
        state: "Running",
        color: "success",
        restarts: 0,
        since: now - 41 * day,
        metrics: {
          cpuRequest: 10,
          memoryRequest: 24,
          memoryLimit: 64,
          cpu: series((i) => 3 + 2 * Math.sin(i / 2)),
          memory: series(() => 30),
        },
      },
      {
        name: "prometheus-sidecar",
        image: "quay.io/prometheus/prometheus:v2.53.0",
        state: "Running (not ready)",
        color: "warning",
        restarts: 0,
        since: now - 41 * day,
        detail: "Readiness probe failing: HTTP 503",
        ports: [{ name: "web", port: 9090 }],
        probes: [{ kind: "readiness", summary: "http-get :9090/-/ready · every 10s" }],
        metrics: {
          cpuRequest: 250,
          cpuLimit: 500,
          memoryRequest: 512,
          memoryLimit: 512,
          cpu: series((i) => 130 + 40 * Math.sin(i / 2.2)),
          memory: series((i) => 470 + 15 * Math.sin(i / 4)),
        },
      },
      {
        name: "node-exporter",
        image: "quay.io/prometheus/node-exporter:v1.8.2",
        state: "Running",
        color: "success",
        restarts: 0,
        since: now - 41 * day,
        metrics: {
          cpuRequest: 50,
          cpuLimit: 100,
          memoryRequest: 64,
          memoryLimit: 128,
          cpu: series((i) => 12 + 6 * Math.sin(i / 2)),
          memory: series(() => 42),
        },
      },
    ],
    conditions: [
      { type: "PodScheduled", status: "True", time: now - 41 * day },
      { type: "Initialized", status: "True", time: now - 41 * day },
      {
        type: "ContainersReady",
        status: "False",
        reason: "ContainersNotReady",
        message: "containers with unready status: [prometheus-sidecar]",
        time: now - 32 * min,
      },
      {
        type: "Ready",
        status: "False",
        reason: "ContainersNotReady",
        message: "containers with unready status: [prometheus-sidecar]",
        time: now - 32 * min,
      },
    ],
    labels: [
      ["app.kubernetes.io/name", "opentelemetry-collector"],
      ["app.kubernetes.io/instance", "agent"],
      ["app.kubernetes.io/version", "0.142.0"],
      ["app.kubernetes.io/managed-by", "Helm"],
      ["app.kubernetes.io/part-of", "observability"],
      ["helm.sh/chart", "opentelemetry-collector-0.142.1"],
      ["component", "agent-collector"],
      ["release", "agent"],
      ["heritage", "Helm"],
      ["pod-template-generation", "4"],
    ],
    annotations: [
      ["checksum/config", "8f4b2e9d7c1a5f3e6b8d2c4a9e7f1b3d5c8a2e4f6b9d1c3e5a7f2b4d6c8e0a9f"],
      ["kubectl.kubernetes.io/default-container", "otc-container"],
      ["prometheus.io/scrape", "true"],
      [
        "kubectl.kubernetes.io/last-applied-configuration",
        '{"apiVersion":"v1","kind":"Pod","metadata":{"annotations":{},"labels":{"app.kubernetes.io/name":"opentelemetry-collector"},"name":"opentelemetry-collector-contrib-agent-daemonset-x7z2m","namespace":"observability-system"},"spec":{"containers":[...]}}',
      ],
      ["kubernetes.io/config.seen", "2026-06-25T09:14:02.118437261Z"],
      ["kubernetes.io/psp", "eks.privileged"],
      ["container.apparmor.security.beta.kubernetes.io/otc-container", "runtime/default"],
      ["cluster-autoscaler.kubernetes.io/safe-to-evict", "false"],
      ["fluentbit.io/exclude", "true"],
    ],
    ephemeralContainers: [
      {
        name: "debugger-q2r8p",
        image: "busybox:1.36",
        state: "Terminated",
        color: "neutral",
        restarts: 0,
        target: "otc-container",
        detail: "Exited with code 0 — debug session ended",
      },
    ],
    events: [
      {
        type: "Warning",
        reason: "Unhealthy",
        message: "Readiness probe failed: HTTP probe failed with statuscode: 503",
        count: 18,
        lastSeen: now - 45_000,
        source: "kubelet, ip-10-0-12-201.eu-west-2.compute.internal",
      },
      {
        type: "Warning",
        reason: "OOMKilling",
        message: "Memory cgroup out of memory: Killed process 8471 (otelcol-contrib)",
        count: 1,
        lastSeen: now - 6 * day,
        source: "kernel-monitor, ip-10-0-12-201.eu-west-2.compute.internal",
      },
      {
        type: "Normal",
        reason: "Pulled",
        message:
          'Container image "ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib:0.142.0" already present on machine',
        count: 4,
        lastSeen: now - 6 * day,
        source: "kubelet, ip-10-0-12-201.eu-west-2.compute.internal",
      },
    ],
  },
];
