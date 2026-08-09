// Static stress fixtures for the /design/logs mock (ui-redesign.md piece
// 6c). Deterministic — same render every load. Nine streams across four
// pods exercise the palette (it wraps past slot 5), the status states,
// prefix truncation, duplicate container names across pods, and the
// marker concepts; the line mix covers JSON logs, access-log noise,
// long queries, tabs, and unicode.

export interface LogStreamFixture {
  key: string; // pod/container
  pod: string;
  container: string;
  status: "live" | "reconnecting" | "waiting" | "ended";
  statusReason?: string;
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

export const logStreamFixtures: LogStreamFixture[] = [
  { key: `${API_POD}/api`, pod: API_POD, container: "api", status: "live" },
  { key: `${API_POD}/istio-proxy`, pod: API_POD, container: "istio-proxy", status: "live" },
  {
    key: `${API_POD}/init-db-migrate`,
    pod: API_POD,
    container: "init-db-migrate",
    status: "ended",
  },
  {
    key: `${WORKER_POD}/worker`,
    pod: WORKER_POD,
    container: "worker",
    status: "waiting",
    statusReason: "CrashLoopBackOff",
  },
  // Second istio-proxy on purpose: duplicate container names across
  // pods are why chips carry their pod name untruncated.
  { key: `${WEB_POD}/web`, pod: WEB_POD, container: "web", status: "live" },
  { key: `${WEB_POD}/istio-proxy`, pod: WEB_POD, container: "istio-proxy", status: "live" },
  { key: `${WEB_POD}/assets-sync`, pod: WEB_POD, container: "assets-sync", status: "live" },
  { key: `${PG_POD}/postgres`, pod: PG_POD, container: "postgres", status: "live" },
  {
    key: `${OTEL_POD}/otel-collector`,
    pod: OTEL_POD,
    container: "otel-collector",
    status: "reconnecting",
  },
];

const BASE = Date.UTC(2026, 7, 9, 14, 30, 0);

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
  push(-421_000, `${API_POD}/init-db-migrate`, "waiting for database to accept connections...");
  push(
    -419_400,
    `${API_POD}/init-db-migrate`,
    "applying migration 0041_backfill_order_totals... done in 0.8s",
  );
  push(
    -418_900,
    `${API_POD}/init-db-migrate`,
    "applying migration 0042_add_checkout_index... done in 1.2s",
  );
  push(-418_800, `${API_POD}/init-db-migrate`, "migrations complete, exiting");

  // Steady interleave: api ~350ms cadence, proxy pairs around it, worker
  // sparse, postgres occasional, otel unicode/tabs occasionally.
  for (let i = 0; i < 46; i++) {
    const t = i * 350;
    push(t, `${API_POD}/api`, apiLine(i));
    push(t + 12, `${API_POD}/istio-proxy`, proxyLine(i));
    if (i % 3 === 0) push(t + 40, `${API_POD}/istio-proxy`, proxyLine(i + 100));
    if (i % 5 === 2) push(t + 90, `${WORKER_POD}/worker`, workerLine(i));
    if (i % 4 === 1) {
      push(t + 55, `${WEB_POD}/web`, `GET /product/${8800 + i} 200 ${12 + ((i * 5) % 60)}ms`);
      push(t + 67, `${WEB_POD}/istio-proxy`, proxyLine(i + 200));
    }
    if (i % 13 === 6)
      push(
        t + 210,
        `${WEB_POD}/assets-sync`,
        `synced ${18 + (i % 30)} assets in ${(i % 9) + 1}.2s`,
      );
    if (i % 11 === 7) push(t + 160, `${PG_POD}/postgres`, `LOG:  checkpoint starting: time`);
    if (i % 9 === 4)
      push(
        t + 130,
        `${OTEL_POD}/otel-collector`,
        `2026-08-09T14:30:${String(i % 60).padStart(2, "0")}Z\tinfo\texporterhelper/retry_sender.go:129\tExporting failed. Will retry the request after interval.\t{"kind": "exporter", "data_type": "traces", "name": "otlp/tempo", "interval": "5.52s"} → retry №${i}`,
      );
  }

  // Worker crash + restart divider, then recovery lines.
  push(
    9_030,
    `${WORKER_POD}/worker`,
    "panic: runtime error: invalid memory address or nil pointer dereference",
  );
  push(9_031, `${WORKER_POD}/worker`, "goroutine 1 [running]:");
  push(9_032, `${WORKER_POD}/worker`, "main.processJob(0x0?, 0xc000112340)");
  push(9_033, `${WORKER_POD}/worker`, "\t/src/worker/jobs.go:214 +0x1a4");
  push(9_600, `${WORKER_POD}/worker`, "", { marker: "restart", exitCode: 2 });
  push(10_400, `${WORKER_POD}/worker`, "worker starting, queues=[emails invoices webhooks]");

  // The long postgres line, mid-flow.
  push(11_300, `${PG_POD}/postgres`, PG_LONG);

  // Eviction-gap marker concept: ring wrapped while paused.
  push(12_700, `${API_POD}/istio-proxy`, "", { marker: "gap", evicted: 1204 });

  return lines.sort((a, b) => a.t - b.t);
})();
