// Static stress fixtures for the /design/logs mock (ui-redesign.md piece
// 6e). Deterministic — same render every load. Resurrected from the (c)
// mock and extended for the composition round: pods carry namespaces,
// a staging twin of postgres-primary-0 forces the ns prefix tier (same
// pod name, different namespace), and redis exists only as picker prey.
// The line mix covers JSON logs, access-log noise, long queries, tabs,
// and unicode.

export interface LogStreamFixture {
  key: string; // namespace/pod/container
  namespace: string;
  pod: string;
  container: string;
  status: "live" | "reconnecting" | "waiting" | "ended";
  statusReason?: string;
  // Error states, mirroring StreamInfo: a session that never started,
  // and a stream that ended on an error rather than cleanly.
  startError?: string;
  endedError?: string;
  // A terminated prior instance exists — Load Previous Logs enables.
  hasPrevious?: boolean;
}

export interface PodFixture {
  id: string; // namespace/pod
  namespace: string;
  name: string;
  streams: LogStreamFixture[];
}

export interface LogLineFixture {
  t: number;
  stream: string; // LogStreamFixture.key
  text: string;
  marker?: "restart" | "gap";
  exitCode?: number;
  evicted?: number; // gap markers: lines lost between neighbours
}

const API_POD = "checkout-api-6f7d8c9b4-x2x9v";
const WEB_POD = "checkout-web-5f5b9c7d64-tq8rn";
const WORKER_POD = "checkout-worker-7d9f64c88-k4j2q";
const PG_POD = "postgres-primary-0";
const OTEL_POD = "observability-opentelemetry-collector-contrib-7b9d54fd9c-ab1cd";
const REDIS_POD = "redis-cache-0";

const sk = (ns: string, pod: string, container: string) => `${ns}/${pod}/${container}`;

export const logStreamFixtures: LogStreamFixture[] = [
  // Un-witnessed restart: api restarted before the session opened
  // (healthy now) — Load Previous backfills the whole prior instance.
  {
    key: sk("production", API_POD, "api"),
    namespace: "production",
    pod: API_POD,
    container: "api",
    status: "live",
    hasPrevious: true,
  },
  {
    key: sk("production", API_POD, "istio-proxy"),
    namespace: "production",
    pod: API_POD,
    container: "istio-proxy",
    status: "live",
  },
  {
    key: sk("production", API_POD, "init-db-migrate"),
    namespace: "production",
    pod: API_POD,
    container: "init-db-migrate",
    status: "ended",
  },
  // Second istio-proxy on purpose: duplicate container names across
  // pods are why identity needs the pod level at all.
  {
    key: sk("production", WEB_POD, "web"),
    namespace: "production",
    pod: WEB_POD,
    container: "web",
    status: "live",
  },
  {
    key: sk("production", WEB_POD, "istio-proxy"),
    namespace: "production",
    pod: WEB_POD,
    container: "istio-proxy",
    status: "live",
  },
  // Ended-with-error case: streamed, then died uncleanly.
  {
    key: sk("production", WEB_POD, "assets-sync"),
    namespace: "production",
    pod: WEB_POD,
    container: "assets-sync",
    status: "ended",
    endedError: "stream closed: unexpected EOF",
  },
  // Witnessed restart: the crash streamed live (inline panic + restart
  // divider). Load Previous still has value — the session tailed only
  // the instance's end, so the backfill is the EARLIER part of that
  // same instance.
  {
    key: sk("production", WORKER_POD, "worker"),
    namespace: "production",
    pod: WORKER_POD,
    container: "worker",
    status: "waiting",
    statusReason: "CrashLoopBackOff",
    hasPrevious: true,
  },
  {
    key: sk("data", PG_POD, "postgres"),
    namespace: "data",
    pod: PG_POD,
    container: "postgres",
    status: "live",
  },
  // Start-failed case: the session never began, so no lines exist.
  {
    key: sk("data", PG_POD, "metrics"),
    namespace: "data",
    pod: PG_POD,
    container: "metrics",
    status: "live",
    startError:
      'pods "postgres-primary-0" is forbidden: User "okula" cannot get resource "pods/log" in namespace "data"',
  },
  {
    key: sk("observability", OTEL_POD, "otel-collector"),
    namespace: "observability",
    pod: OTEL_POD,
    container: "otel-collector",
    status: "reconnecting",
  },
  // The staging twin: identical pod name to data/postgres-primary-0.
  {
    key: sk("staging", PG_POD, "postgres"),
    namespace: "staging",
    pod: PG_POD,
    container: "postgres",
    status: "live",
  },
  // Picker-only pod: not in any scenario, exists to be added.
  {
    key: sk("data", REDIS_POD, "redis"),
    namespace: "data",
    pod: REDIS_POD,
    container: "redis",
    status: "live",
  },
];

// Pods derived from stream order — stream order within a pod is its
// palette-slot / chip order.
export const podFixtures: PodFixture[] = (() => {
  const byId = new Map<string, PodFixture>();
  for (const s of logStreamFixtures) {
    const id = `${s.namespace}/${s.pod}`;
    let p = byId.get(id);
    if (!p) {
      p = { id, namespace: s.namespace, name: s.pod, streams: [] };
      byId.set(id, p);
    }
    p.streams.push(s);
  }
  return [...byId.values()];
})();

const BASE = Date.UTC(2026, 7, 9, 14, 30, 0);

const K_API = `production/${API_POD}`;
const K_WEB = `production/${WEB_POD}`;
const K_WORKER = `production/${WORKER_POD}`;
const K_PG = `data/${PG_POD}`;
const K_OTEL = `observability/${OTEL_POD}`;
const K_PG_STG = `staging/${PG_POD}`;
const K_REDIS = `data/${REDIS_POD}`;

const ROUTES = ["/v1/checkout", "/v1/cart", "/v1/products/8812", "/healthz", "/v1/payments"];
const JOBS = ["emails", "invoices", "webhooks"];

function apiLine(i: number): string {
  const route = ROUTES[i % ROUTES.length];
  const dur = (8 + ((i * 7) % 90) + (i % 3) / 10).toFixed(1);
  const status = i % 17 === 0 ? 502 : i % 9 === 0 ? 404 : 200;
  const level = status === 502 ? "error" : "info";
  return `{"level":"${level}","ts":"2026-08-09T14:30:${String(i % 60).padStart(2, "0")}Z","msg":"handled request","route":"${route}","status":${status},"dur_ms":${dur}}`;
}

function proxyLine(i: number): string {
  const route = ROUTES[(i + 2) % ROUTES.length];
  const bytes = 200 + ((i * 131) % 4000);
  return `[2026-08-09T14:30:${String(i % 60).padStart(2, "0")}.${String((i * 37) % 1000).padStart(3, "0")}Z] "POST ${route} HTTP/1.1" 200 - via_upstream - "-" ${bytes} ${bytes + 76} ${(i * 3) % 40} ${(i * 3) % 40} "-" "checkout-web/2.14.0" "${(i * 2654435761) % 1e9}-${i}" "checkout-api:8080" "10.24.${i % 8}.${(i * 13) % 250}:8080"`;
}

function workerLine(i: number): string {
  return `processed job id=${8400 + i} queue=${JOBS[i % JOBS.length]} attempt=1 in ${40 + ((i * 53) % 900)}ms`;
}

// One deliberately huge line (horizontal-scroll stress) plus tabs.
const PG_LONG = `LOG:  duration: 1250.183 ms  statement: SELECT o.id, o.status, o.total_cents, c.email, c.locale, a.line1, a.city, a.postcode, p.provider, p.captured_at FROM orders o JOIN customers c ON c.id = o.customer_id JOIN addresses a ON a.id = o.shipping_address_id LEFT JOIN payments p ON p.order_id = o.id WHERE o.status IN ('pending', 'paid', 'packed') AND o.created_at > now() - interval '7 days' ORDER BY o.created_at DESC LIMIT 500 -- plan: Limit (cost=1.14..872.11 rows=500 width=201) -> Nested Loop Left Join (cost=1.14..48231.09 rows=27704 width=201)`;

export const logLineFixtures: LogLineFixture[] = (() => {
  const lines: LogLineFixture[] = [];
  const push = (t: number, stream: string, text: string, extra?: Partial<LogLineFixture>) =>
    lines.push({ t: BASE + t, stream, text, ...extra });

  // Finished init stream — oldest content, few lines.
  push(-421_000, `${K_API}/init-db-migrate`, "waiting for database to accept connections...");
  push(
    -419_400,
    `${K_API}/init-db-migrate`,
    "applying migration 0041_backfill_order_totals... done in 0.8s",
  );
  push(
    -418_900,
    `${K_API}/init-db-migrate`,
    "applying migration 0042_add_checkout_index... done in 1.2s",
  );
  push(-418_800, `${K_API}/init-db-migrate`, "migrations complete, exiting");

  // Steady interleave: api ~350ms cadence, proxy pairs around it, worker
  // sparse, postgres occasional, otel unicode/tabs occasionally.
  for (let i = 0; i < 46; i++) {
    const t = i * 350;
    push(t, `${K_API}/api`, apiLine(i));
    push(t + 12, `${K_API}/istio-proxy`, proxyLine(i));
    if (i % 3 === 0) push(t + 40, `${K_API}/istio-proxy`, proxyLine(i + 100));
    if (i % 5 === 2) push(t + 90, `${K_WORKER}/worker`, workerLine(i));
    if (i % 4 === 1) {
      push(t + 55, `${K_WEB}/web`, `GET /product/${8800 + i} 200 ${12 + ((i * 5) % 60)}ms`);
      push(t + 67, `${K_WEB}/istio-proxy`, proxyLine(i + 200));
    }
    if (i % 13 === 6)
      push(t + 210, `${K_WEB}/assets-sync`, `synced ${18 + (i % 30)} assets in ${(i % 9) + 1}.2s`);
    if (i % 11 === 7) push(t + 160, `${K_PG}/postgres`, `LOG:  checkpoint starting: time`);
    if (i % 9 === 4)
      push(
        t + 130,
        `${K_OTEL}/otel-collector`,
        `2026-08-09T14:30:${String(i % 60).padStart(2, "0")}Z\tinfo\texporterhelper/retry_sender.go:129\tExporting failed. Will retry the request after interval.\t{"kind": "exporter", "data_type": "traces", "name": "otlp/tempo", "interval": "5.52s"} → retry №${i}`,
      );
  }

  // Worker crash + restart divider, then recovery lines.
  push(
    9_030,
    `${K_WORKER}/worker`,
    "panic: runtime error: invalid memory address or nil pointer dereference",
  );
  push(9_031, `${K_WORKER}/worker`, "goroutine 1 [running]:");
  push(9_032, `${K_WORKER}/worker`, "main.processJob(0x0?, 0xc000112340)");
  push(9_033, `${K_WORKER}/worker`, "\t/src/worker/jobs.go:214 +0x1a4");
  push(9_600, `${K_WORKER}/worker`, "", { marker: "restart", exitCode: 2 });
  push(10_400, `${K_WORKER}/worker`, "worker starting, queues=[emails invoices webhooks]");

  // The long postgres line, mid-flow.
  push(11_300, `${K_PG}/postgres`, PG_LONG);

  // Staging twin lines — sparse, distinct content so the ns tier is
  // visibly earning its keep in the twin scenario.
  push(
    2_100,
    `${K_PG_STG}/postgres`,
    `LOG:  automatic vacuum of table "app.sessions": index scans: 1, pages: removed 0, remain 214`,
  );
  push(
    6_800,
    `${K_PG_STG}/postgres`,
    `LOG:  checkpoint complete: wrote 88 buffers (0.5%); 0 WAL file(s) added, 0 removed, 1 recycled`,
  );
  push(13_100, `${K_PG_STG}/postgres`, `ERROR:  deadlock detected`);
  push(
    13_101,
    `${K_PG_STG}/postgres`,
    `DETAIL:  Process 4181 waits for ShareLock on transaction 88123; blocked by process 4177.`,
  );

  // Redis: picker-only pod, a few lines for when it gets added.
  push(3_400, `${K_REDIS}/redis`, `10 changes in 300 seconds. Saving...`);
  push(3_405, `${K_REDIS}/redis`, `Background saving started by pid 88`);
  push(3_612, `${K_REDIS}/redis`, `Background saving terminated with success`);

  // Eviction-gap marker concept: ring wrapped while paused.
  push(12_700, `${K_API}/istio-proxy`, "", { marker: "gap", evicted: 1204 });

  return lines.sort((a, b) => a.t - b.t);
})();

// Previous-instance backfills (Load Previous Logs), keyed by stream.
// These arrays are what cutoff insertion produces — only lines older
// than the stream's retained floor — so the two demos differ exactly
// where they should. worker (witnessed restart): the backfill is the
// earlier part of the SAME instance whose end we tailed; it merges
// below the retained lines with NO divider — the witnessed restart
// divider stays the only boundary. api (un-witnessed restart): the
// backfill is a whole prior instance and closes with a standard
// restart divider — the restart we didn't see. Exit 137 with no fatal
// output is the OOM-kill signature: normal traffic, then silence.
export const previousLinesByStream: Record<string, LogLineFixture[]> = (() => {
  const w = `${K_WORKER}/worker`;
  const a = `${K_API}/api`;
  return {
    [w]: [
      { t: BASE - 45_000, stream: w, text: "worker starting, queues=[emails invoices webhooks]" },
      {
        t: BASE - 44_600,
        stream: w,
        text: "processed job id=8390 queue=emails attempt=1 in 412ms",
      },
      {
        t: BASE - 43_900,
        stream: w,
        text: "processed job id=8391 queue=invoices attempt=1 in 96ms",
      },
      {
        t: BASE - 42_500,
        stream: w,
        text: "processed job id=8392 queue=webhooks attempt=1 in 233ms",
      },
      {
        t: BASE - 41_800,
        stream: w,
        text: "processed job id=8393 queue=emails attempt=1 in 187ms",
      },
    ],
    [a]: [
      {
        t: BASE - 92_000,
        stream: a,
        text: `{"level":"info","ts":"2026-08-09T14:28:28Z","msg":"handled request","route":"/v1/checkout","status":200,"dur_ms":41.2}`,
      },
      {
        t: BASE - 89_000,
        stream: a,
        text: `{"level":"info","ts":"2026-08-09T14:28:31Z","msg":"handled request","route":"/v1/cart","status":200,"dur_ms":12.9}`,
      },
      {
        t: BASE - 86_000,
        stream: a,
        text: `{"level":"warn","ts":"2026-08-09T14:28:34Z","msg":"slow query","query":"orders_by_customer","dur_ms":1874.0}`,
      },
      {
        t: BASE - 84_500,
        stream: a,
        text: `{"level":"info","ts":"2026-08-09T14:28:35Z","msg":"handled request","route":"/v1/products/8812","status":200,"dur_ms":9.4}`,
      },
      { t: BASE - 84_000, stream: a, text: "", marker: "restart", exitCode: 137 },
    ],
  };
})();
