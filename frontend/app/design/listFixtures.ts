import type { Severity } from "~/resources/columns";

// Static fixtures for the list page mock (/design/list). Pod-shaped rows —
// the widest, most varied kind — with a steady cluster, a messy one for
// stress (long names, crash loops, odd phases), and an empty result.

export interface ListFixtureRow {
  name: string;
  namespace: string;
  ready: string;
  restarts: number;
  status: string;
  statusSeverity: Severity;
  qos: string;
  ip: string;
  node: string;
  createdAt: number;
}

export interface ListFixture {
  key: string;
  label: string;
  rows: ListFixtureRow[];
}

const now = Date.now();
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const steady: ListFixtureRow[] = [
  // prettier-ignore
  ...[
    ["api-gateway-5f7d9c6b8-k2xzq", "production", "1/1", 0, "Running", "ok", "Burstable", "10.42.3.17", "k8s-worker-01", 12 * DAY],
    ["api-gateway-5f7d9c6b8-m8vwp", "production", "1/1", 0, "Running", "ok", "Burstable", "10.42.5.101", "k8s-worker-03", 12 * DAY],
    ["api-gateway-5f7d9c6b8-r4tnb", "production", "1/1", 1, "Running", "ok", "Burstable", "10.42.1.88", "k8s-worker-02", 9 * DAY],
    ["checkout-service-64b9d7f5c-hd8mq", "production", "2/2", 0, "Running", "ok", "Guaranteed", "10.42.2.34", "k8s-worker-01", 34 * DAY],
    ["checkout-service-64b9d7f5c-ztl4k", "production", "2/2", 0, "Running", "ok", "Guaranteed", "10.42.4.56", "k8s-worker-04", 34 * DAY],
    ["payments-worker-7c8f6d4b9-fj2sx", "production", "1/1", 0, "Running", "ok", "Burstable", "10.42.3.201", "k8s-worker-02", 6 * DAY],
    ["postgres-0", "production", "1/1", 0, "Running", "ok", "Guaranteed", "10.42.1.10", "k8s-worker-01", 87 * DAY],
    ["postgres-1", "production", "1/1", 0, "Running", "ok", "Guaranteed", "10.42.2.11", "k8s-worker-03", 87 * DAY],
    ["redis-cache-0", "production", "1/1", 0, "Running", "ok", "Guaranteed", "10.42.5.9", "k8s-worker-04", 87 * DAY],
    ["session-cleanup-29147520-x8dwm", "production", "0/1", 0, "Completed", "ok", "BestEffort", "10.42.4.144", "k8s-worker-02", 2 * HOUR],
    ["api-gateway-6d8e0d7c9-p3qrs", "staging", "1/1", 0, "Running", "ok", "Burstable", "10.42.6.23", "k8s-worker-04", 3 * HOUR],
    ["checkout-service-75c0e8f6d-b6nvt", "staging", "2/2", 0, "Running", "ok", "Guaranteed", "10.42.6.71", "k8s-worker-03", 5 * HOUR],
    ["coredns-76f75df574-4slbg", "kube-system", "1/1", 0, "Running", "ok", "Burstable", "10.42.0.3", "k8s-control-01", 87 * DAY],
    ["coredns-76f75df574-tw9hd", "kube-system", "1/1", 0, "Running", "ok", "Burstable", "10.42.0.4", "k8s-control-01", 87 * DAY],
    ["kube-proxy-b2xkr", "kube-system", "1/1", 2, "Running", "ok", "BestEffort", "10.40.0.11", "k8s-worker-01", 87 * DAY],
    ["metrics-server-557ff575fb-9tcqe", "kube-system", "1/1", 0, "Running", "ok", "Burstable", "10.42.0.19", "k8s-worker-02", 87 * DAY],
    ["prometheus-kube-stack-0", "monitoring", "2/2", 0, "Running", "ok", "Burstable", "10.42.3.77", "k8s-worker-03", 21 * DAY],
    ["grafana-59d658cd75-fkzpn", "monitoring", "1/1", 0, "Running", "ok", "Burstable", "10.42.2.90", "k8s-worker-04", 21 * DAY],
    ["node-exporter-hl6bw", "monitoring", "1/1", 0, "Running", "ok", "BestEffort", "10.40.0.12", "k8s-worker-02", 21 * DAY],
    ["ingest-batch-29147581-qkd7z", "production", "1/1", 0, "Running", "ok", "BestEffort", "10.42.1.203", "k8s-worker-01", 4 * MIN],
  ].map(([name, namespace, ready, restarts, status, statusSeverity, qos, ip, node, age]) => ({
    name, namespace, ready, restarts, status, statusSeverity, qos, ip, node,
    createdAt: now - (age as number),
  }) as ListFixtureRow),
];

const messy: ListFixtureRow[] = [
  // prettier-ignore
  ...[
    ["customer-data-export-pipeline-cronjob-29147582-manual-trigger-x7ktq", "data-platform-services", "0/1", 247, "CrashLoopBackOff", "error", "BestEffort", "10.42.118.201", "ip-10-42-118-203.eu-west-2.compute.internal", 14 * DAY],
    ["legacy-billing-reconciliation-adapter-6c49dd8f7b-mn2lp", "finance-integrations", "0/1", 0, "ImagePullBackOff", "error", "Burstable", "10.42.117.66", "ip-10-42-117-45.eu-west-2.compute.internal", 3 * HOUR],
    ["api-gateway-5f7d9c6b8-k2xzq", "production", "1/1", 12, "Running", "ok", "Burstable", "10.42.118.17", "ip-10-42-118-203.eu-west-2.compute.internal", 12 * DAY],
    ["ml-feature-store-warmup-job-29147311-h8skq", "data-platform-services", "0/1", 0, "Pending", "pending", "BestEffort", "", "", 26 * MIN],
    ["checkout-service-64b9d7f5c-hd8mq", "production", "1/2", 34, "Running", "warn", "Guaranteed", "10.42.119.34", "ip-10-42-119-12.eu-west-2.compute.internal", 34 * DAY],
    ["order-events-consumer-84dd96c5b7-w4jfn", "production", "0/1", 12, "OOMKilled", "error", "Burstable", "10.42.117.90", "ip-10-42-117-45.eu-west-2.compute.internal", 2 * DAY],
    ["session-cleanup-29147520-x8dwm", "production", "0/1", 0, "Completed", "ok", "BestEffort", "10.42.118.144", "ip-10-42-118-203.eu-west-2.compute.internal", 2 * HOUR],
    ["payments-worker-7c8f6d4b9-fj2sx", "production", "1/1", 0, "Terminating", "pending", "Burstable", "10.42.119.201", "ip-10-42-119-12.eu-west-2.compute.internal", 6 * DAY],
    ["notification-dispatch-58c7b9d6f4-t2mkr", "customer-comms", "0/1", 3, "Error", "error", "Burstable", "10.42.117.155", "ip-10-42-117-45.eu-west-2.compute.internal", 41 * MIN],
    ["search-indexer-bluegreen-preview-7f6c5d9b48-q9wnv", "search-and-discovery", "0/2", 0, "Init:1/3", "pending", "Burstable", "", "ip-10-42-118-203.eu-west-2.compute.internal", 8 * MIN],
    ["ancient-debug-shell-do-not-delete", "default", "0/1", 0, "Evicted", "warn", "BestEffort", "", "", 212 * DAY],
    ["cert-manager-webhook-7b5d8c6f9-z3xlt", "cert-manager", "0/1", 8, "CreateContainerConfigError", "error", "Burstable", "10.42.119.12", "ip-10-42-119-12.eu-west-2.compute.internal", 55 * MIN],
    ["postgres-0", "production", "1/1", 0, "Running", "ok", "Guaranteed", "10.42.117.10", "ip-10-42-117-45.eu-west-2.compute.internal", 87 * DAY],
    ["a", "default", "1/1", 0, "Running", "ok", "BestEffort", "10.42.118.222", "ip-10-42-118-203.eu-west-2.compute.internal", 30 * MIN],
  ].map(([name, namespace, ready, restarts, status, statusSeverity, qos, ip, node, age]) => ({
    name, namespace, ready, restarts, status, statusSeverity, qos, ip, node,
    createdAt: now - (age as number),
  }) as ListFixtureRow),
];

export const listFixtures: ListFixture[] = [
  { key: "steady", label: "Steady", rows: steady },
  { key: "messy", label: "Messy", rows: messy },
  { key: "empty", label: "Empty", rows: [] },
];
