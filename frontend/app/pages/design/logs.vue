<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

import {
  logStreamFixtures,
  logLineFixtures,
  podFixtures,
  previousLinesByStream,
} from "~/design/logFixtures";
import type { LogStreamFixture, PodFixture } from "~/design/logFixtures";

// Design sandbox for the log viewer's composition round (ui-redesign.md
// piece 6e). The prose-settled model is hardcoded: no modes — chrome
// scales with ambiguity (single source renders the shipped (d) UI
// verbatim, multi-source grows grouping/header/colors in place); a
// session is the URL; remove is source-level. Rounds 1-2 hardcoded:
// compound groups as the ONLY band grammar at every N (flat chips and
// fused single-container chips died — one structure, group = source,
// chips = streams), ever-present three-dot source menu at the pod
// segment's trail, always-occupied header line (count + namespace
// context in multi), Clear Output + Reset Sources in the page
// actions, color axis hardcoded to the settled rule (per container at
// one pod, per source once pods differ). Displacement surfaces died
// entirely (banner, then ghost restore chip) — the one composition
// affordance is the "+ Add / Restore" chip opening the palette.
// Palette (rounds 11-12, hand-rolled): → drills in (pod containers /
// Recent Log Sessions), Enter adds (pod = bare, container =
// narrowed), Tab multi-select with one-Enter bulk commit, dim +
// check for already-added, live source-set normalization, back
// restores the drilled-from row. Dies when the (e) build ships the
// winners.

// --- Scenario -> composition ---

const [P_API, P_WEB, P_WORKER, P_PG, P_OTEL, P_PG_STG] = podFixtures as [
  PodFixture,
  PodFixture,
  PodFixture,
  PodFixture,
  PodFixture,
  PodFixture,
];
const podsById = new Map(podFixtures.map((p) => [p.id, p]));

const SCENARIOS: Record<string, string[]> = {
  single: [P_API.id],
  duo: [P_API.id, P_WEB.id],
  multi: [P_API.id, P_WEB.id, P_WORKER.id, P_PG.id, P_OTEL.id],
  twin: [P_API.id, P_WEB.id, P_WORKER.id, P_PG.id, P_OTEL.id, P_PG_STG.id],
  empty: [],
};

const scenario = ref("multi");
const scenarioItems = [
  { label: "Single pod", value: "single" },
  { label: "Two pods · one namespace", value: "duo" },
  { label: "Five pods · mixed namespaces", value: "multi" },
  { label: "Six pods · name twin", value: "twin" },
  { label: "Empty (no sources)", value: "empty" },
];

// The composition: ordered pod ids — order assigns palette slots, adds
// append (the real thing appends src params).
const sources = ref<string[]>([...SCENARIOS[scenario.value]!]);

watch(scenario, (s) => {
  sources.value = [...SCENARIOS[s]!];
  hidden.value = new Set();
  clearedT.value = 0;
  prevLoaded.value = new Set();
});

// --- Design toggles (mock panel) ---

const paused = ref(false);

// View settings — these belong to the real viewer's toolbar.
const showTimestamps = ref(true);
const alignedGutter = ref(false);

// --- Streams, identity, colors ---

// A source id is `ns/pod` (bare — every container) or
// `ns/pod/container` (narrowed). The palette's container adds made
// narrowed sources real in the mock model.
interface ParsedSource {
  id: string;
  pod: PodFixture;
  container?: string;
  streams: LogStreamFixture[];
}

const parsedSources = computed<ParsedSource[]>(() =>
  sources.value.flatMap((id) => {
    const parts = id.split("/");
    const pod = podsById.get(parts.slice(0, 2).join("/"));
    if (!pod) return [];
    const container = parts[2];
    const streams = container ? pod.streams.filter((s) => s.container === container) : pod.streams;
    return streams.length ? [{ id, pod, container, streams }] : [];
  }),
);

const activeStreams = computed(() => parsedSources.value.flatMap((s) => s.streams));
const streamsByKey = new Map(logStreamFixtures.map((s) => [s.key, s]));

const multiPod = computed(() => new Set(parsedSources.value.map((s) => s.pod.id)).size > 1);
const mixedNs = computed(() => new Set(parsedSources.value.map((s) => s.pod.namespace)).size > 1);

// Pod names appearing under more than one namespace in the composition
// — the collision that forces the ns prefix tier.
const dupNames = computed(() => {
  const seen = new Map<string, string>();
  const dups = new Set<string>();
  for (const { pod: p } of parsedSources.value) {
    const ns = seen.get(p.name);
    if (ns !== undefined && ns !== p.namespace) dups.add(p.name);
    else seen.set(p.name, p.namespace);
  }
  return dups;
});

// Shortest-unambiguous prefix, three tiers: container only while one
// pod; pod/container once pods differ; ns/pod/container only for pods
// whose name collides across namespaces.
function prefixFor(key: string): string {
  const s = streamsByKey.get(key)!;
  if (!multiPod.value) return s.container;
  if (dupNames.value.has(s.pod)) return `${s.namespace}/${s.pod}/${s.container}`;
  return `${s.pod}/${s.container}`;
}

// Color axis follows the prefix rule (settled round 3): per container
// while one pod is all the identity there is, per source once pods
// differ.
const perSourceColors = computed(() => parsedSources.value.length > 1);

const streamColor = computed(() => {
  const map = new Map<string, string>();
  if (perSourceColors.value) {
    parsedSources.value.forEach((src, i) => {
      const c = SERIES_COLORS[i % SERIES_COLORS.length]!;
      src.streams.forEach((s) => map.set(s.key, c));
    });
  } else {
    activeStreams.value.forEach((s, i) => map.set(s.key, SERIES_COLORS[i % SERIES_COLORS.length]!));
  }
  return map;
});

// --- Header identity ---

// The header line is always occupied — a sometimes-there breadcrumb
// shifts the whole header when it goes (round 1). One grammar at
// every N (round 4): count leads, context follows. N=1 reads
// "1 source · ns / pod" (pod linked to its page) — the shipped
// Pods-kind breadcrumb dies in the viewer; empty says so.
const breadcrumb = computed(() => {
  const srcs = parsedSources.value;
  if (!srcs.length) return [{ label: "No sources" }];
  if (srcs.length === 1) {
    const { pod: p, container } = srcs[0]!;
    const items: { label: string; to?: string; separator?: string }[] = [
      { label: "1 source" },
      { label: p.namespace, separator: "•" },
      { label: p.name, to: `/resources/pods/${p.namespace}/${p.name}` },
    ];
    if (container) items.push({ label: container });
    return items;
  }
  const namespaces = new Set(srcs.map((s) => s.pod.namespace));
  const context = namespaces.size === 1 ? [...namespaces][0]! : `${namespaces.size} namespaces`;
  return [{ label: `${srcs.length} sources` }, { label: context, separator: "•" }];
});

// --- Visibility: hide / solo / per-pod toggle ---

const hidden = ref(new Set<string>());
function toggleStream(key: string) {
  const next = new Set(hidden.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  hidden.value = next;
}

interface SourceGroup {
  id: string;
  pod: PodFixture;
  color: string;
  streams: LogStreamFixture[];
  anyVisible: boolean;
}

const groups = computed<SourceGroup[]>(() =>
  parsedSources.value.map((src, i) => ({
    id: src.id,
    pod: src.pod,
    color: SERIES_COLORS[i % SERIES_COLORS.length]!,
    streams: src.streams,
    anyVisible: src.streams.some((s) => !hidden.value.has(s.key)),
  })),
);

// Tri-state: any visible -> hide all; all hidden -> show all.
function togglePod(g: SourceGroup) {
  const next = new Set(hidden.value);
  if (g.anyVisible) g.streams.forEach((s) => next.add(s.key));
  else g.streams.forEach((s) => next.delete(s.key));
  hidden.value = next;
}

function solo(keys: string[]) {
  const keep = new Set(keys);
  hidden.value = new Set(activeStreams.value.filter((s) => !keep.has(s.key)).map((s) => s.key));
}

// Exactly these keys visible and every other stream hidden — the state
// solo() produces. Stateless: hand-toggling a chip breaks the state
// and the menu reverts to Solo. The hidden.size guard keeps a
// whole-composition solo (a no-op) from reading as soloed at rest.
function isSoloed(keys: string[]): boolean {
  if (!hidden.value.size) return false;
  const keep = new Set(keys);
  return activeStreams.value.every((s) => keep.has(s.key) !== hidden.value.has(s.key));
}

function unsolo() {
  hidden.value = new Set();
}

function removeSource(id: string) {
  sources.value = sources.value.filter((x) => x !== id);
}

// Statuses live on chips only (round 8) — the segment never carries
// one. This worst-of serves the show-all cell (trouble stays visible
// when chips are hidden) and the palette's pod-row status dot.
function worstStatusIcon(streams: LogStreamFixture[]): { name: string; cls: string } | null {
  if (streams.some((s) => s.startError))
    return { name: "i-lucide-triangle-alert", cls: "text-error" };
  if (streams.some((s) => s.status === "ended" && s.endedError))
    return { name: "i-lucide-circle-alert", cls: "text-error" };
  if (streams.some((s) => s.status === "waiting"))
    return { name: "i-lucide-clock", cls: "text-warning" };
  if (streams.some((s) => s.status === "reconnecting"))
    return { name: "i-lucide-loader-2", cls: "animate-spin text-muted" };
  if (streams.every((s) => s.status === "ended"))
    return { name: "i-lucide-circle-slash", cls: "text-dimmed" };
  return null;
}

// --- Menus ---

// The three-dot button is the ONLY menu surface (round 7 — right-click
// died). Per-stream actions live as per-container submenus of the
// source menu; a single-container group inlines Load Previous instead
// of nesting a submenu that would duplicate the source items.
// Streams whose previous instance has been loaded (one-shot backfill).
const prevLoaded = ref(new Set<string>());

// Enabled only when a terminated prior instance exists (restartCount >
// 0 — kubectl -p errors otherwise); loaded is terminal for the item.
function previousItem(s: LogStreamFixture): DropdownMenuItem {
  const loaded = prevLoaded.value.has(s.key);
  return {
    label: loaded ? "Previous Loaded" : "Load Previous Logs",
    icon: "i-lucide-history",
    disabled: !s.hasPrevious || loaded,
    onSelect: () => {
      prevLoaded.value = new Set([...prevLoaded.value, s.key]);
    },
  };
}

function streamChildren(s: LogStreamFixture): DropdownMenuItem[] {
  const isHidden = hidden.value.has(s.key);
  return [
    {
      label: isHidden ? "Show" : "Hide",
      icon: isHidden ? "i-lucide-eye" : "i-lucide-eye-off",
      onSelect: () => toggleStream(s.key),
    },
    isSoloed([s.key])
      ? { label: "Unsolo", icon: "i-lucide-target", onSelect: unsolo }
      : { label: "Solo", icon: "i-lucide-target", onSelect: () => solo([s.key]) },
    previousItem(s),
  ];
}

function sourceItems(g: SourceGroup): DropdownMenuItem[][] {
  const source: DropdownMenuItem[] = [
    {
      label: g.anyVisible ? "Hide All" : "Show All",
      icon: g.anyVisible ? "i-lucide-eye-off" : "i-lucide-eye",
      onSelect: () => togglePod(g),
    },
    isSoloed(g.streams.map((s) => s.key))
      ? { label: "Unsolo", icon: "i-lucide-target", onSelect: unsolo }
      : {
          label: "Solo",
          icon: "i-lucide-target",
          onSelect: () => solo(g.streams.map((s) => s.key)),
        },
    { label: "Go To Pod", icon: "i-lucide-arrow-up-right", disabled: true },
    {
      label: "Remove",
      icon: "i-lucide-x",
      color: "error",
      onSelect: () => removeSource(g.id),
    },
  ];
  if (g.streams.length === 1) {
    source.splice(2, 0, previousItem(g.streams[0]!));
    return [source];
  }
  return [source, g.streams.map((s) => ({ label: s.container, children: streamChildren(s) }))];
}

// Reset lives in the header actions beside Clear (round 1) — explicit
// nouns resolve the two-adjacent-destructive-verbs hazard.
function resetSources() {
  sources.value = [];
  hidden.value = new Set();
}

// --- Add-source palette (hand-rolled) ---

// UCommandPalette's keyboard is sealed inside Reka, and this palette's
// grammar needs it: → drills in (a pod's containers, or the recents
// list), ← backs out to the row you came from, Enter adds the
// highlighted row (pod = bare source, container = narrowed), Tab
// toggle-selects for a bulk add committed by one Enter. Selection
// survives drilling, so a cross-pod container batch is one commit.

const paletteOpen = ref(false);
const paletteQuery = ref("");
const paletteHead = useTemplateRef("paletteHead");
type PaletteDrill = { kind: "pod"; pod: PodFixture } | { kind: "recents" } | null;
const drill = ref<PaletteDrill>(null);
const selected = ref(new Set<string>());
const highlight = ref(0);

// Recent sessions: recorded on displacement as source set + when.
// Labels are GENERATED, never stored — first two names + "N more",
// names gaining the ns tier only on collision (the
// shortest-unambiguous rule again); the detail reuses the header
// line's grammar plus a relative time.
const recentCompositions = [
  { pods: [P_API.id, P_WEB.id], ago: "12m ago" },
  { pods: [P_API.id, P_WEB.id, P_WORKER.id, P_PG.id, P_OTEL.id], ago: "2h ago" },
  { pods: [P_PG.id, P_PG_STG.id], ago: "yesterday" },
];

function sessionNames(ids: string[]): string[] {
  const parts = ids.map((id) => id.split("/"));
  const seen = new Map<string, string>();
  const collides = new Set<string>();
  for (const p of parts) {
    const ns = seen.get(p[1]!);
    if (ns !== undefined && ns !== p[0]) collides.add(p[1]!);
    else seen.set(p[1]!, p[0]!);
  }
  return parts.map((p) => (collides.has(p[1]!) ? p.join("/") : p.slice(1).join("/")));
}

function sessionLabel(ids: string[]): string {
  const shown = sessionNames(ids).slice(0, 2).join(" + ");
  return ids.length > 2 ? `${shown} + ${ids.length - 2} more` : shown;
}

function sessionDetail(ids: string[], ago: string): string {
  const nss = new Set(ids.map((id) => id.split("/")[0]!));
  const context = nss.size === 1 ? [...nss][0]! : `${nss.size} namespaces`;
  return `${ids.length} ${ids.length === 1 ? "source" : "sources"} · ${context} · ${ago}`;
}

type PaletteRow =
  | { type: "header"; label: string }
  | { type: "recents" }
  | { type: "pod"; pod: PodFixture }
  | { type: "container"; pod: PodFixture; stream: LogStreamFixture }
  | { type: "session"; index: number };

const paletteRows = computed<PaletteRow[]>(() => {
  const q = paletteQuery.value.trim().toLowerCase();
  const rows: PaletteRow[] = [];
  const d = drill.value;
  if (d?.kind === "pod") {
    for (const s of d.pod.streams) {
      if (q && !s.container.toLowerCase().includes(q)) continue;
      rows.push({ type: "container", pod: d.pod, stream: s });
    }
  } else if (d?.kind === "recents") {
    recentCompositions.forEach((r, index) => {
      if (q && !r.label.toLowerCase().includes(q)) return;
      rows.push({ type: "session", index });
    });
  } else {
    if (!q) rows.push({ type: "recents" });
    for (const ns of ["production", "data", "observability", "staging"]) {
      const pods = podFixtures.filter(
        (p) => p.namespace === ns && (!q || p.name.toLowerCase().includes(q) || ns.includes(q)),
      );
      if (!pods.length) continue;
      rows.push({ type: "header", label: ns });
      for (const pod of pods) rows.push({ type: "pod", pod });
    }
  }
  return rows;
});

// Highlight is an ordinal over actionable rows (headers skipped).
const actionable = computed(() =>
  paletteRows.value
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.type !== "header"),
);

watch([paletteQuery, drill], () => {
  highlight.value = 0;
});
watch(highlight, async () => {
  await nextTick();
  document
    .querySelector(`[data-palette-row="${actionable.value[highlight.value]?.index}"]`)
    ?.scrollIntoView({ block: "nearest" });
});
watch(paletteOpen, async (open) => {
  if (!open) {
    paletteQuery.value = "";
    drill.value = null;
    selected.value = new Set();
    highlight.value = 0;
    return;
  }
  await nextTick();
  paletteHead.value?.querySelector("input")?.focus();
});

// Coverage: what the composition already contains. Covered rows dim
// with a check — line-through would collide with the chips' hidden
// grammar.
function podCoverage(p: PodFixture): "full" | "partial" | "none" {
  if (sources.value.includes(p.id)) return "full";
  const narrowed = sources.value.filter((x) => x.startsWith(`${p.id}/`)).length;
  if (!narrowed) return "none";
  return narrowed >= p.streams.length ? "full" : "partial";
}
function containerCovered(p: PodFixture, container: string): boolean {
  return sources.value.includes(p.id) || sources.value.includes(`${p.id}/${container}`);
}
function rowCovered(row: PaletteRow): boolean {
  if (row.type === "pod") return podCoverage(row.pod) === "full";
  if (row.type === "container") return containerCovered(row.pod, row.stream.container);
  return false;
}

// The source set stays minimal: bare subsumes the pod's narrowed
// sources, covered adds no-op — the settled normalization, live.
function normalizeAdd(ids: string[]) {
  let next = [...sources.value];
  for (const id of ids) {
    if (next.includes(id)) continue;
    const parts = id.split("/");
    if (parts.length === 2) {
      next = next.filter((x) => !x.startsWith(`${id}/`));
      next.push(id);
    } else if (!next.includes(parts.slice(0, 2).join("/"))) {
      next.push(id);
    }
  }
  sources.value = next;
}

function rowSelectId(row: PaletteRow): string | null {
  if (row.type === "pod") return row.pod.id;
  if (row.type === "container") return `${row.pod.id}/${row.stream.container}`;
  return null;
}

function isSelected(row: PaletteRow): boolean {
  const id = rowSelectId(row);
  return !!id && selected.value.has(id);
}

// Pending container selections inside a pod — surfaced on the root
// row (indeterminate square + count) so drilled selections stay
// visible from outside.
function podPendingCount(p: PodFixture): number {
  let n = 0;
  for (const id of selected.value) if (id.startsWith(`${p.id}/`)) n++;
  return n;
}

function toggleSelect(row: PaletteRow) {
  const id = rowSelectId(row);
  if (!id || rowCovered(row)) return;
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}

// Back returns to the row you drilled from — remembered by identity,
// not list position, since the query clears on drill and shifts rows.
let drillOrigin: string | null = null;

function drillInto(row: PaletteRow) {
  if (row.type === "pod") {
    drillOrigin = row.pod.id;
    drill.value = { kind: "pod", pod: row.pod };
  } else if (row.type === "recents") {
    drillOrigin = "recents";
    drill.value = { kind: "recents" };
  } else return;
  paletteQuery.value = "";
}

function drillBack() {
  const origin = drillOrigin;
  drillOrigin = null;
  drill.value = null;
  paletteQuery.value = "";
  // After the reset watcher zeroes the highlight, restore it to the
  // origin row's new position.
  nextTick(() => {
    if (!origin) return;
    const ord = actionable.value.findIndex(({ row }) =>
      origin === "recents" ? row.type === "recents" : row.type === "pod" && row.pod.id === origin,
    );
    if (ord >= 0) highlight.value = ord;
  });
}

function commitSelection() {
  normalizeAdd([...selected.value]);
  paletteOpen.value = false;
}

function primaryAction(row: PaletteRow) {
  if (row.type === "recents") {
    drillInto(row);
    return;
  }
  if (row.type === "session") {
    const r = recentCompositions[row.index]!;
    sources.value = [...r.pods];
    hidden.value = new Set();
    prevLoaded.value = new Set();
    paletteOpen.value = false;
    return;
  }
  if (rowCovered(row)) {
    paletteOpen.value = false;
    return;
  }
  const id = rowSelectId(row);
  if (id) {
    normalizeAdd([id]);
    paletteOpen.value = false;
  }
}

function isHighlighted(rowIndex: number): boolean {
  return actionable.value[highlight.value]?.index === rowIndex;
}
function highlightRow(rowIndex: number) {
  const ord = actionable.value.findIndex(({ index }) => index === rowIndex);
  if (ord >= 0) highlight.value = ord;
}

function onPaletteKeydown(e: KeyboardEvent) {
  const current = actionable.value[highlight.value]?.row;
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      if (actionable.value.length)
        highlight.value = (highlight.value + 1) % actionable.value.length;
      break;
    case "ArrowUp":
      e.preventDefault();
      if (actionable.value.length)
        highlight.value = (highlight.value - 1 + actionable.value.length) % actionable.value.length;
      break;
    case "ArrowRight":
      if (current && (current.type === "pod" || current.type === "recents")) {
        e.preventDefault();
        drillInto(current);
      }
      break;
    case "ArrowLeft":
      if (drill.value) {
        e.preventDefault();
        drillBack();
      }
      break;
    case "Enter":
      e.preventDefault();
      if (selected.value.size) commitSelection();
      else if (current) primaryAction(current);
      break;
    // Tab is the select key (fzf's gesture) — Space stayed with the
    // search input: stealing it felt wrong while typing (round 12).
    case "Tab":
      e.preventDefault();
      if (current) toggleSelect(current);
      break;
  }
}

// --- Filter / find (context fidelity, unchanged from the (c) mock) ---

const filterQuery = ref("");
const filterNeedle = computed(() => filterQuery.value.trim().toLowerCase());

const findQuery = ref("");
const findNeedle = computed(() => findQuery.value.trim().toLowerCase());

const findBar = useTemplateRef("findBar");

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "f") {
    e.preventDefault();
    findBar.value?.querySelector("input")?.focus();
  }
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

function clearFind(e: Event) {
  findQuery.value = "";
  (e.target as HTMLInputElement | null)?.blur();
}

const clearedT = ref(0);
function clearOutput() {
  clearedT.value = Number.MAX_SAFE_INTEGER;
}

const activeKeys = computed(() => new Set(activeStreams.value.map((s) => s.key)));

// Backfilled previous instances splice into the merge by timestamp —
// the fixtures are pre-cut to what cutoff insertion would keep (only
// lines older than the stream's retained floor).
const allLines = computed(() => {
  if (!prevLoaded.value.size) return logLineFixtures;
  const backfills = [...prevLoaded.value].flatMap((k) => previousLinesByStream[k] ?? []);
  return [...logLineFixtures, ...backfills].sort((a, b) => a.t - b.t);
});

const visible = computed(() => {
  return allLines.value.filter((l) => {
    if (!activeKeys.value.has(l.stream) || hidden.value.has(l.stream)) return false;
    if (l.t <= clearedT.value) return false;
    if (filterNeedle.value) return !l.marker && l.text.toLowerCase().includes(filterNeedle.value);
    return true;
  });
});

const matches = computed(() => {
  if (!findNeedle.value) return [];
  const out: { line: number; occ: number }[] = [];
  visible.value.forEach((l, li) => {
    if (l.marker) return;
    const t = l.text.toLowerCase();
    let idx = 0;
    let occ = 0;
    while ((idx = t.indexOf(findNeedle.value, idx)) !== -1) {
      out.push({ line: li, occ });
      occ++;
      idx += findNeedle.value.length;
    }
  });
  return out;
});

const activeMatch = ref(0);
watch([matches], () => {
  activeMatch.value = 0;
});

function stepFind(dir: number) {
  if (!matches.value.length) return;
  activeMatch.value = (activeMatch.value + dir + matches.value.length) % matches.value.length;
  const m = matches.value[activeMatch.value]!;
  document.getElementById(`mockline-${m.line}`)?.scrollIntoView({ block: "center" });
}

function lineParts(text: string, li: number) {
  if (!findNeedle.value) return [{ text, hit: false, active: false }];
  const active = matches.value[activeMatch.value];
  const lower = text.toLowerCase();
  const parts: { text: string; hit: boolean; active: boolean }[] = [];
  let pos = 0;
  let occ = 0;
  let idx: number;
  while ((idx = lower.indexOf(findNeedle.value, pos)) !== -1) {
    if (idx > pos) parts.push({ text: text.slice(pos, idx), hit: false, active: false });
    parts.push({
      text: text.slice(idx, idx + findNeedle.value.length),
      hit: true,
      active: active?.line === li && active?.occ === occ,
    });
    pos = idx + findNeedle.value.length;
    occ++;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), hit: false, active: false });
  return parts;
}

// Gutter sized to the longest prefix on show, bounded so one absurd
// name can't take half the pane.
const gutterCh = computed(() => {
  let n = 0;
  for (const s of activeStreams.value) {
    if (!hidden.value.has(s.key)) n = Math.max(n, prefixFor(s.key).length);
  }
  return Math.min(n, 44);
});

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
  hour12: false,
});
</script>

<template>
  <div class="h-full min-h-0 flex flex-col px-3">
    <PageHeader title="Logs" :breadcrumb="breadcrumb" back-fallback="/resources/pods">
      <template #title-trailing>
        <UBadge
          v-if="paused"
          color="warning"
          variant="subtle"
          size="sm"
          icon="i-lucide-square-pause"
          class="ml-1"
        >
          Paused
        </UBadge>
      </template>
      <template #actions>
        <UButton icon="i-lucide-eraser" color="neutral" variant="soft" @click="clearOutput">
          Clear Output
        </UButton>
        <UButton icon="i-lucide-list-x" color="error" variant="soft" @click="resetSources">
          Reset Sources
        </UButton>
      </template>
    </PageHeader>

    <!-- Toolbar: persistent filter left, view toggles, find bar right. -->
    <div class="flex items-center gap-4 mb-4">
      <UInput
        v-model="filterQuery"
        icon="i-lucide-list-filter"
        placeholder="Filter lines..."
        class="w-128"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        :ui="{ base: 'ring-default', leadingIcon: 'size-4', trailing: 'pe-1' }"
      >
        <template v-if="filterQuery" #trailing>
          <UButton
            color="neutral"
            variant="link"
            size="sm"
            icon="i-lucide-circle-x"
            aria-label="Clear filter"
            @click="filterQuery = ''"
          />
        </template>
      </UInput>
      <span v-if="filterNeedle" class="text-xs text-muted whitespace-nowrap">
        {{ visible.length }} {{ visible.length === 1 ? "match" : "matches" }}
      </span>

      <USwitch v-model="showTimestamps" label="Timestamps" size="sm" />
      <USwitch v-model="alignedGutter" label="Aligned Gutter" size="sm" />

      <div ref="findBar" class="ml-auto flex items-center gap-1.5">
        <UInput
          v-model="findQuery"
          icon="i-lucide-search"
          placeholder="Find in logs..."
          size="sm"
          class="w-84"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          :ui="{ base: 'ring-default', leadingIcon: 'size-4', trailing: 'pe-1' }"
          @keydown.enter.exact.prevent="stepFind(1)"
          @keydown.shift.enter.prevent="stepFind(-1)"
          @keydown.esc.prevent="clearFind"
        >
          <template v-if="findQuery" #trailing>
            <span
              v-if="findNeedle"
              class="text-xs text-muted tabular-nums whitespace-nowrap pointer-events-none"
            >
              {{ matches.length ? activeMatch + 1 : 0 }}/{{ matches.length }}
            </span>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              icon="i-lucide-circle-x"
              aria-label="Clear find"
              @click="findQuery = ''"
            />
          </template>
        </UInput>
        <UButton
          icon="i-lucide-chevron-up"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Previous match"
          :disabled="!matches.length"
          @click="stepFind(-1)"
        />
        <UButton
          icon="i-lucide-chevron-down"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Next match"
          :disabled="!matches.length"
          @click="stepFind(1)"
        />
      </div>
    </div>

    <!-- Sources band + pane -->
    <div class="flex-1 min-h-0 flex flex-col">
      <div
        class="flex items-start gap-3 px-3 py-3 border border-b-0 border-default rounded-t-md shrink-0"
      >
        <SectionTitle class="h-6 flex items-center shrink-0">Sources</SectionTitle>
        <div class="flex items-center gap-1.5 flex-wrap min-w-0">
          <!-- One grammar at every N (round 2): group = source, chips
          = streams. The band's structure is constant — only the count
          changes; a future workload source spans pods and needs the
          group header anyway. The identity dot rides the color axis:
          on the segment when colors are per source, on the chips when
          per container. -->
          <template v-for="g in groups" :key="g.id">
            <div
              class="inline-flex items-center rounded-md border border-accented/70 bg-elevated/40 overflow-hidden text-xs"
            >
              <div class="inline-flex items-center bg-elevated">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 h-6 pl-2 cursor-pointer"
                  :title="g.pod.id"
                  @click="togglePod(g)"
                >
                  <span
                    v-if="perSourceColors"
                    class="size-2 rounded-full shrink-0"
                    :style="{ backgroundColor: g.color }"
                  />
                  <span class="font-mono font-medium">{{ g.pod.name }}</span>
                  <span v-if="mixedNs" class="font-mono text-dimmed">
                    {{ g.pod.namespace }}
                  </span>
                </button>
                <!-- size="sm" drops the menu to the band's text-xs
                scale — the default md reads a size class bigger than
                the chips it serves. -->
                <UDropdownMenu :items="sourceItems(g)" size="sm" :content="{ align: 'start' }">
                  <button
                    type="button"
                    class="inline-flex items-center justify-center h-6 px-1.5 cursor-pointer text-muted hover:text-default transition-colors"
                    aria-label="Source menu"
                  >
                    <UIcon name="i-lucide-ellipsis-vertical" class="size-3.5" />
                  </button>
                </UDropdownMenu>
              </div>
              <template v-if="g.anyVisible">
                <button
                  v-for="s in g.streams"
                  :key="s.key"
                  type="button"
                  class="inline-flex items-center gap-1.5 h-6 px-2 border-l border-default hover:bg-elevated transition-colors cursor-pointer"
                  :class="hidden.has(s.key) ? 'opacity-50' : ''"
                  :title="s.startError ?? s.endedError ?? s.statusReason ?? s.key"
                  @click="toggleStream(s.key)"
                >
                  <span
                    v-if="!perSourceColors"
                    class="size-2 rounded-full shrink-0"
                    :style="{ backgroundColor: streamColor.get(s.key) }"
                  />
                  <span class="font-mono" :class="hidden.has(s.key) ? 'line-through' : ''">
                    {{ s.container }}
                  </span>
                  <UIcon
                    v-if="hidden.has(s.key)"
                    name="i-lucide-eye-off"
                    class="size-3 text-dimmed"
                  />
                  <UIcon
                    v-else-if="s.startError"
                    name="i-lucide-triangle-alert"
                    class="size-3 text-error"
                  />
                  <!-- Ended with an error is not a clean end: error
                  tint, message in the tooltip. -->
                  <UIcon
                    v-else-if="s.status === 'ended' && s.endedError"
                    name="i-lucide-circle-alert"
                    class="size-3 text-error"
                  />
                  <UIcon
                    v-else-if="s.status === 'reconnecting'"
                    name="i-lucide-loader-2"
                    class="size-3 animate-spin text-muted"
                  />
                  <UIcon
                    v-else-if="s.status === 'waiting'"
                    name="i-lucide-clock"
                    class="size-3 text-warning"
                  />
                  <UIcon
                    v-else-if="s.status === 'ended'"
                    name="i-lucide-circle-slash"
                    class="size-3 text-dimmed"
                  />
                </button>
              </template>
              <!-- Fully hidden: the chips' place is taken by one
              show-all cell — the segment itself stays untouched. -->
              <button
                v-else
                type="button"
                class="inline-flex items-center gap-1.5 h-6 px-2 border-l border-default hover:bg-elevated transition-colors cursor-pointer text-dimmed"
                :title="`${g.streams.length} hidden — click to show`"
                @click="togglePod(g)"
              >
                <UIcon name="i-lucide-eye-off" class="size-3" />
                {{ g.streams.length }}
                <UIcon
                  v-if="worstStatusIcon(g.streams)"
                  :name="worstStatusIcon(g.streams)!.name"
                  class="size-3"
                  :class="worstStatusIcon(g.streams)!.cls"
                />
              </button>
            </div>
          </template>

          <!-- Ghost add chip: the one composition affordance — the
          label names both palette verbs (pods to add, recents to
          restore), so the restore path is discoverable without any
          displacement state or conditional chrome. -->
          <button
            type="button"
            class="inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs border border-dashed border-accented text-muted hover:text-default hover:border-inverted/40 transition-colors cursor-pointer"
            @click="paletteOpen = true"
          >
            <UIcon name="i-lucide-plus" class="size-3" />
            Add / Restore
          </button>
        </div>
      </div>

      <!-- Log pane -->
      <div class="relative flex-1 min-h-0 border border-default rounded-b-md bg-sunken">
        <div class="h-full overflow-auto font-mono text-xs leading-5 p-3">
          <div
            v-if="!sources.length"
            class="h-full flex flex-col items-center justify-center gap-3 text-dimmed"
          >
            <span>No log sources.</span>
            <UButton
              icon="i-lucide-plus"
              color="neutral"
              variant="soft"
              size="sm"
              @click="paletteOpen = true"
            >
              Add Source
            </UButton>
          </div>

          <div
            v-else-if="!visible.length"
            class="h-full flex items-center justify-center text-dimmed"
          >
            {{ filterNeedle ? "No lines match the filter." : "No log output." }}
          </div>

          <template v-for="(line, i) in visible" :key="i">
            <!-- Restart divider, stream-attributed via the prefix rule. -->
            <div v-if="line.marker === 'restart'" class="flex items-center gap-3 h-5 select-none">
              <span class="flex-1 border-t border-default" />
              <span class="text-dimmed">
                <span :style="{ color: streamColor.get(line.stream) }">
                  {{ prefixFor(line.stream) }}
                </span>
                restarted<template v-if="line.exitCode !== undefined">
                  (exit {{ line.exitCode }})</template
                >
              </span>
              <span class="flex-1 border-t border-default" />
            </div>

            <!-- Eviction-gap divider, stream-attributed (the d4 shape). -->
            <div v-else-if="line.marker === 'gap'" class="flex items-center gap-3 h-5 select-none">
              <span class="flex-1 border-t border-dashed border-default" />
              <span class="text-dimmed">
                <span :style="{ color: streamColor.get(line.stream) }">
                  {{ prefixFor(line.stream) }}
                </span>
                — {{ line.evicted?.toLocaleString() }} lines evicted
              </span>
              <span class="flex-1 border-t border-dashed border-default" />
            </div>

            <div v-else :id="`mockline-${i}`" class="whitespace-pre h-5 w-max min-w-full">
              <span v-if="showTimestamps" class="text-dimmed select-none mr-3">{{
                timeFormat.format(line.t)
              }}</span
              ><span
                v-if="alignedGutter"
                class="inline-block truncate align-bottom select-none mr-3"
                :style="{ width: `${gutterCh}ch`, color: streamColor.get(line.stream) }"
                :title="line.stream"
                >{{ prefixFor(line.stream) }}</span
              ><span
                v-else
                class="select-none mr-3"
                :style="{ color: streamColor.get(line.stream) }"
                :title="line.stream"
                >{{ prefixFor(line.stream) }}</span
              ><template v-for="(p, pi) in lineParts(line.text, i)" :key="pi"
                ><span
                  v-if="p.hit"
                  :class="
                    p.active ? 'bg-warning text-inverted rounded-xs' : 'bg-warning/25 rounded-xs'
                  "
                  >{{ p.text }}</span
                ><template v-else>{{ p.text }}</template></template
              >
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Add-source palette: hand-rolled for the drill-in +
    multi-select grammar. → drills, ← backs out, Enter adds,
    Space/Tab select for bulk commit. -->
    <UModal v-model:open="paletteOpen" :ui="{ content: 'sm:max-w-4xl' }">
      <template #content>
        <div class="flex flex-col h-192">
          <div
            ref="paletteHead"
            class="flex items-center gap-2 px-3 py-1.5 border-b border-default shrink-0"
          >
            <UButton
              v-if="drill"
              icon="i-lucide-arrow-left"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="Back"
              @click="drillBack"
            />
            <span v-if="drill?.kind === 'pod'" class="font-mono text-xs text-muted shrink-0">
              {{ drill.pod.name }}
            </span>
            <span v-else-if="drill?.kind === 'recents'" class="text-xs text-muted shrink-0">
              Recent Log Sessions
            </span>
            <UInput
              v-model="paletteQuery"
              icon="i-lucide-search"
              variant="none"
              :placeholder="
                drill?.kind === 'pod'
                  ? 'Filter containers...'
                  : drill?.kind === 'recents'
                    ? 'Filter sessions...'
                    : 'Add source...'
              "
              class="flex-1"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              @keydown="onPaletteKeydown"
            />
          </div>

          <div class="flex-1 overflow-y-auto p-2">
            <template v-for="(row, i) in paletteRows" :key="i">
              <div
                v-if="row.type === 'header'"
                class="px-2 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted"
              >
                {{ row.label }}
              </div>

              <div
                v-else-if="row.type === 'recents'"
                :data-palette-row="i"
                class="flex items-center gap-2 h-9 px-2 rounded-md cursor-pointer text-sm"
                :class="isHighlighted(i) ? 'bg-elevated' : ''"
                @mousemove="highlightRow(i)"
                @click="drillInto(row)"
              >
                <UIcon name="i-lucide-history" class="size-4 text-muted shrink-0" />
                <span>Recent Log Sessions</span>
                <span class="text-xs text-dimmed">{{ recentCompositions.length }}</span>
                <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed ml-auto shrink-0" />
              </div>

              <div
                v-else-if="row.type === 'session'"
                :data-palette-row="i"
                class="flex items-center gap-2 h-9 px-2 rounded-md cursor-pointer text-sm"
                :class="isHighlighted(i) ? 'bg-elevated' : ''"
                @mousemove="highlightRow(i)"
                @click="primaryAction(row)"
              >
                <UIcon name="i-lucide-history" class="size-4 text-muted shrink-0" />
                <span
                  class="truncate font-mono text-xs"
                  :title="sessionLabel(recentCompositions[row.index]!.pods)"
                >
                  {{ sessionLabel(recentCompositions[row.index]!.pods) }}
                </span>
                <span class="text-xs text-dimmed ml-auto whitespace-nowrap">
                  {{
                    sessionDetail(
                      recentCompositions[row.index]!.pods,
                      recentCompositions[row.index]!.ago,
                    )
                  }}
                </span>
              </div>

              <div
                v-else-if="row.type === 'pod'"
                :data-palette-row="i"
                class="flex items-center gap-2 h-9 px-2 rounded-md cursor-pointer"
                :class="[
                  isHighlighted(i) ? 'bg-elevated' : '',
                  rowCovered(row) ? 'opacity-50' : '',
                ]"
                @mousemove="highlightRow(i)"
                @click="primaryAction(row)"
              >
                <UIcon
                  v-if="rowCovered(row)"
                  name="i-lucide-check"
                  class="size-4 text-success shrink-0"
                />
                <button
                  v-else
                  type="button"
                  class="shrink-0 cursor-pointer inline-flex"
                  :aria-label="isSelected(row) ? 'Deselect' : 'Select'"
                  @click.stop="toggleSelect(row)"
                >
                  <UIcon
                    :name="
                      isSelected(row)
                        ? 'i-lucide-square-check'
                        : podPendingCount(row.pod)
                          ? 'i-lucide-square-minus'
                          : 'i-lucide-square'
                    "
                    class="size-4"
                    :class="
                      isSelected(row) || podPendingCount(row.pod) ? 'text-primary' : 'text-dimmed'
                    "
                  />
                </button>
                <UIcon name="i-lucide-box" class="size-4 text-muted shrink-0" />
                <span class="font-mono text-xs truncate">{{ row.pod.name }}</span>
                <UIcon
                  v-if="worstStatusIcon(row.pod.streams)"
                  :name="worstStatusIcon(row.pod.streams)!.name"
                  class="size-3 shrink-0"
                  :class="worstStatusIcon(row.pod.streams)!.cls"
                />
                <span class="text-xs text-dimmed ml-auto whitespace-nowrap">
                  <span v-if="podPendingCount(row.pod)" class="text-primary">
                    {{ podPendingCount(row.pod) }} selected ·
                  </span>
                  <template v-if="podCoverage(row.pod) === 'partial'">
                    {{ sources.filter((x) => x.startsWith(`${row.pod.id}/`)).length }} added ·
                  </template>
                  {{ row.pod.streams.length }}
                  {{ row.pod.streams.length === 1 ? "container" : "containers" }}
                </span>
                <!-- Clickable drill, so the mouse can do everything
                the keyboard can (the select square's precedent). -->
                <button
                  type="button"
                  class="shrink-0 cursor-pointer inline-flex p-0.5 -m-0.5 text-dimmed hover:text-default transition-colors"
                  aria-label="Show containers"
                  @click.stop="drillInto(row)"
                >
                  <UIcon name="i-lucide-chevron-right" class="size-4" />
                </button>
              </div>

              <div
                v-else
                :data-palette-row="i"
                class="flex items-center gap-2 h-9 px-2 rounded-md cursor-pointer"
                :class="[
                  isHighlighted(i) ? 'bg-elevated' : '',
                  rowCovered(row) ? 'opacity-50' : '',
                ]"
                @mousemove="highlightRow(i)"
                @click="primaryAction(row)"
              >
                <UIcon
                  v-if="rowCovered(row)"
                  name="i-lucide-check"
                  class="size-4 text-success shrink-0"
                />
                <button
                  v-else
                  type="button"
                  class="shrink-0 cursor-pointer inline-flex"
                  :aria-label="isSelected(row) ? 'Deselect' : 'Select'"
                  @click.stop="toggleSelect(row)"
                >
                  <UIcon
                    :name="isSelected(row) ? 'i-lucide-square-check' : 'i-lucide-square'"
                    class="size-4"
                    :class="isSelected(row) ? 'text-primary' : 'text-dimmed'"
                  />
                </button>
                <UIcon name="i-lucide-container" class="size-4 text-muted shrink-0" />
                <span class="font-mono text-xs truncate">{{ row.stream.container }}</span>
                <UIcon
                  v-if="worstStatusIcon([row.stream])"
                  :name="worstStatusIcon([row.stream])!.name"
                  class="size-3 shrink-0"
                  :class="worstStatusIcon([row.stream])!.cls"
                />
              </div>
            </template>
            <div v-if="!actionable.length" class="px-2 py-6 text-center text-sm text-dimmed">
              No matches.
            </div>
          </div>

          <div
            class="flex items-center gap-3 h-11 px-3 border-t border-default text-xs text-muted shrink-0"
          >
            <template v-if="selected.size">
              <span>{{ selected.size }} selected</span>
              <UButton size="xs" color="primary" variant="soft" @click="commitSelection">
                Add {{ selected.size }} {{ selected.size === 1 ? "Source" : "Sources" }}
              </UButton>
            </template>
            <!-- Key names in badges — UKbd's glyph caps center
            unevenly (upstream nit); badge text flows normally. -->
            <span class="ml-auto flex items-center gap-3 whitespace-nowrap">
              <span class="flex items-center gap-1.5">
                <UBadge color="neutral" variant="soft" size="sm">TAB</UBadge>
                Select
              </span>
              <span class="text-dimmed">·</span>
              <span class="flex items-center gap-1.5">
                <UBadge color="neutral" variant="soft" size="sm">ENTER</UBadge>
                Add
              </span>
              <span class="text-dimmed">·</span>
              <span class="flex items-center gap-1.5">
                <UBadge color="neutral" variant="soft" size="sm">RIGHT</UBadge>
                Drill In
              </span>
              <span class="text-dimmed">·</span>
              <span class="flex items-center gap-1.5">
                <UBadge color="neutral" variant="soft" size="sm">LEFT</UBadge>
                Back
              </span>
              <span class="text-dimmed">·</span>
              <span class="flex items-center gap-1.5">
                <UBadge color="neutral" variant="soft" size="sm">ESCAPE</UBadge>
                Close
              </span>
            </span>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Design toggles -->
    <div
      class="fixed bottom-4 right-4 z-50 w-64 rounded-lg border border-default bg-default/90 backdrop-blur p-4 shadow-lg flex flex-col gap-3"
    >
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-sliders-horizontal" class="size-4 text-muted" />
        <span class="text-xs font-medium text-muted">Log viewer mock · piece (e)</span>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs text-muted">Scenario</span>
        <USelect v-model="scenario" :items="scenarioItems" size="sm" aria-label="Scenario" />
      </div>
      <USwitch v-model="paused" label="Paused" size="sm" />
      <UButton
        v-if="clearedT"
        size="sm"
        color="neutral"
        variant="soft"
        icon="i-lucide-rotate-ccw"
        @click="clearedT = 0"
      >
        Restore output
      </UButton>
    </div>
  </div>
</template>
