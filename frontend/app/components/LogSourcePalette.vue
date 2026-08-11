<script setup lang="ts">
import { GetPodContainers } from "#services/logs/service";

import type { RecentLogSession } from "~/composables/useLogSessions";
import type { PodRow } from "~/resources/pods";
import { podsResource } from "~/resources/pods";
import type { PodLogSource } from "~/utils/logSources";

// The add-source palette (ui-redesign piece 6e3), hand-rolled — the
// drill-in + multi-select grammar needs keyboard control
// UCommandPalette doesn't expose. → drills in (a pod's containers, or
// the recents list), ← backs out to the row you came from, Enter adds
// the highlighted row (pod = bare source, container = narrowed), Tab
// toggle-selects for a bulk add committed by one Enter; selection
// survives drilling. Already-added rows dim with a check; pods with
// pending container selections show the tree-picker indeterminate
// state.

const props = defineProps<{
  // The current composition — coverage marks and no-op adds.
  sources: PodLogSource[];
}>();

const emit = defineEmits<{
  // Add these sources to the composition (the page normalizes).
  add: [sources: PodLogSource[]];
  // Replace the composition with a recent session's source strings.
  restore: [srcs: string[]];
}>();

const open = defineModel<boolean>("open", { required: true });

// Pods come from the same informer machinery as the list pages,
// unfiltered by the navbar selection — the palette browses everything,
// with the selected namespaces ordered first.
const { allRows: pods, synced } = useResource(podsResource);
const { selectedNamespaces } = useNamespaces();
const { recents } = useLogSessions();

const query = ref("");
const head = useTemplateRef("head");
type Drill = { kind: "pod"; row: PodRow } | { kind: "recents" } | null;
const drill = ref<Drill>(null);
const selected = ref(new Set<string>());
const highlight = ref(0);

// Browse render cap — the palette is search-first; at cluster scale
// browsing 2500 rows serves nobody. Type-to-filter is the path.
const BROWSE_CAP = 50;
const QUERY_CAP = 100;

// --- Container resolution (lazy, per drilled pod) ---

interface PodContainers {
  containers: string[];
  initContainers: string[];
}
const containerCache = shallowRef(new Map<string, PodContainers | "loading" | { error: string }>());

async function fetchContainers(row: PodRow) {
  const key = `${row.namespace}/${row.name}`;
  if (containerCache.value.has(key)) return;
  const set = (v: PodContainers | "loading" | { error: string }) => {
    const next = new Map(containerCache.value);
    next.set(key, v);
    containerCache.value = next;
  };
  set("loading");
  try {
    const pc = await GetPodContainers(row.namespace, row.name);
    set({ containers: pc.containers ?? [], initContainers: pc.initContainers ?? [] });
  } catch (err) {
    set({ error: toErrorString(err) });
  }
}

// --- Rows ---

type PaletteRow =
  | { type: "header"; label: string }
  | { type: "recents" }
  | { type: "pod"; row: PodRow }
  | { type: "container"; row: PodRow; container: string; init: boolean }
  | { type: "session"; index: number }
  | { type: "note"; label: string };

// Namespace order: the navbar-selected namespaces first, the rest
// alphabetical (settled round 13).
const namespaceOrder = computed(() => {
  const all = [...new Set(pods.value.map((p) => p.namespace))].sort();
  const selectedSet = new Set(selectedNamespaces.value);
  if (selectedSet.has(ALL_NAMESPACES)) return all;
  return [...all.filter((ns) => selectedSet.has(ns)), ...all.filter((ns) => !selectedSet.has(ns))];
});

const paletteRows = computed<PaletteRow[]>(() => {
  const q = query.value.trim().toLowerCase();
  const rows: PaletteRow[] = [];
  const d = drill.value;

  if (d?.kind === "pod") {
    const cached = containerCache.value.get(`${d.row.namespace}/${d.row.name}`);
    if (!cached || cached === "loading") {
      rows.push({ type: "note", label: "Loading containers..." });
    } else if ("error" in cached) {
      rows.push({ type: "note", label: cached.error });
    } else {
      for (const c of cached.containers) {
        if (q && !c.toLowerCase().includes(q)) continue;
        rows.push({ type: "container", row: d.row, container: c, init: false });
      }
      for (const c of cached.initContainers) {
        if (q && !c.toLowerCase().includes(q)) continue;
        rows.push({ type: "container", row: d.row, container: c, init: true });
      }
    }
    return rows;
  }

  if (d?.kind === "recents") {
    recents.value.forEach((r, index) => {
      if (q && !sessionLabel(r.srcs).toLowerCase().includes(q)) return;
      rows.push({ type: "session", index });
    });
    if (!rows.length) rows.push({ type: "note", label: "No recent sessions." });
    return rows;
  }

  if (!q && recents.value.length) rows.push({ type: "recents" });
  const cap = q ? QUERY_CAP : BROWSE_CAP;
  let shown = 0;
  let hiddenCount = 0;
  for (const ns of namespaceOrder.value) {
    const members = pods.value.filter(
      (p) => p.namespace === ns && (!q || p.name.toLowerCase().includes(q) || ns.includes(q)),
    );
    if (!members.length) continue;
    if (shown >= cap) {
      hiddenCount += members.length;
      continue;
    }
    rows.push({ type: "header", label: ns });
    for (const p of members) {
      if (shown >= cap) {
        hiddenCount++;
        continue;
      }
      rows.push({ type: "pod", row: p });
      shown++;
    }
  }
  if (hiddenCount) rows.push({ type: "note", label: `${hiddenCount} more - type to filter` });
  if (!shown && synced.value) rows.push({ type: "note", label: q ? "No matches." : "No pods." });
  return rows;
});

// Highlight is an ordinal over actionable rows (headers/notes skipped).
const actionable = computed(() =>
  paletteRows.value
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.type !== "header" && row.type !== "note"),
);

watch([query, drill], () => {
  highlight.value = 0;
});
watch(highlight, async () => {
  await nextTick();
  document
    .querySelector(`[data-palette-row="${actionable.value[highlight.value]?.index}"]`)
    ?.scrollIntoView({ block: "nearest" });
});
watch(open, async (isOpen) => {
  if (!isOpen) {
    query.value = "";
    drill.value = null;
    selected.value = new Set();
    highlight.value = 0;
    return;
  }
  await nextTick();
  head.value?.querySelector("input")?.focus();
});

// --- Coverage: what the composition already contains ---

const bareSet = computed(
  () => new Set(props.sources.filter((s) => !s.container).map((s) => `${s.namespace}/${s.pod}`)),
);
const sourceSet = computed(() => new Set(props.sources.map((s) => formatLogSource(s))));

function rowSelectId(row: PaletteRow): string | null {
  if (row.type === "pod") return `pod:${row.row.namespace}/${row.row.name}`;
  if (row.type === "container") return `pod:${row.row.namespace}/${row.row.name}/${row.container}`;
  return null;
}

function rowCovered(row: PaletteRow): boolean {
  if (row.type === "pod") return sourceSet.value.has(`pod:${row.row.namespace}/${row.row.name}`);
  if (row.type === "container")
    return (
      bareSet.value.has(`${row.row.namespace}/${row.row.name}`) ||
      sourceSet.value.has(`pod:${row.row.namespace}/${row.row.name}/${row.container}`)
    );
  return false;
}

// Narrowed sources of a pod already in the composition — the "n added"
// suffix on its root row.
function podNarrowedCount(row: PodRow): number {
  const prefix = `pod:${row.namespace}/${row.name}/`;
  let n = 0;
  for (const s of props.sources) if (formatLogSource(s).startsWith(prefix)) n++;
  return n;
}

// Pending container selections inside a pod — the indeterminate state.
function podPendingCount(row: PodRow): number {
  const prefix = `pod:${row.namespace}/${row.name}/`;
  let n = 0;
  for (const id of selected.value) if (id.startsWith(prefix)) n++;
  return n;
}

function isSelected(row: PaletteRow): boolean {
  const id = rowSelectId(row);
  return !!id && selected.value.has(id);
}

function toggleSelect(row: PaletteRow) {
  const id = rowSelectId(row);
  if (!id || rowCovered(row)) return;
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}

// --- Navigation and actions ---

// Back returns to the row you drilled from — remembered by identity,
// not list position, since the query clears on drill and shifts rows.
let drillOrigin: string | null = null;

function drillInto(row: PaletteRow) {
  if (row.type === "pod") {
    drillOrigin = `${row.row.namespace}/${row.row.name}`;
    drill.value = { kind: "pod", row: row.row };
    fetchContainers(row.row);
  } else if (row.type === "recents") {
    drillOrigin = "recents";
    drill.value = { kind: "recents" };
  } else return;
  query.value = "";
}

function drillBack() {
  const origin = drillOrigin;
  drillOrigin = null;
  drill.value = null;
  query.value = "";
  nextTick(() => {
    if (!origin) return;
    const ord = actionable.value.findIndex(({ row }) =>
      origin === "recents"
        ? row.type === "recents"
        : row.type === "pod" && `${row.row.namespace}/${row.row.name}` === origin,
    );
    if (ord >= 0) highlight.value = ord;
  });
}

function commitSelection() {
  const sources = [...selected.value]
    .map((id) => parseLogSource(id))
    .filter((s): s is PodLogSource => !!s);
  if (sources.length) emit("add", sources);
  open.value = false;
}

function primaryAction(row: PaletteRow) {
  if (row.type === "recents") {
    drillInto(row);
    return;
  }
  if (row.type === "session") {
    emit("restore", recents.value[row.index]!.srcs);
    open.value = false;
    return;
  }
  if (rowCovered(row)) {
    open.value = false;
    return;
  }
  const id = rowSelectId(row);
  const src = id ? parseLogSource(id) : null;
  if (src) {
    emit("add", [src]);
    open.value = false;
  }
}

function isHighlighted(rowIndex: number): boolean {
  return actionable.value[highlight.value]?.index === rowIndex;
}
function highlightRow(rowIndex: number) {
  const ord = actionable.value.findIndex(({ index }) => index === rowIndex);
  if (ord >= 0) highlight.value = ord;
}

function onKeydown(e: KeyboardEvent) {
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
    // Tab is the select key (fzf's gesture) — Space stays with the
    // search input.
    case "Tab":
      e.preventDefault();
      if (current) toggleSelect(current);
      break;
  }
}

// --- Recents presentation (settled round 13): labels are generated —
// first two names + "N more", names gaining the ns tier only on
// collision; detail reuses the header grammar plus a relative time ---

function sessionNames(srcs: string[]): string[] {
  const parsed = srcs.map((raw) => parseLogSource(raw)).filter((s): s is PodLogSource => !!s);
  const seen = new Map<string, string>();
  const collides = new Set<string>();
  for (const s of parsed) {
    const ns = seen.get(s.pod);
    if (ns !== undefined && ns !== s.namespace) collides.add(s.pod);
    else seen.set(s.pod, s.namespace);
  }
  return parsed.map((s) => {
    const name = s.container ? `${s.pod}/${s.container}` : s.pod;
    return collides.has(s.pod) ? `${s.namespace}/${name}` : name;
  });
}

function sessionLabel(srcs: string[]): string {
  const shown = sessionNames(srcs).slice(0, 2).join(" + ");
  return srcs.length > 2 ? `${shown} + ${srcs.length - 2} more` : shown;
}

function sessionDetail(session: RecentLogSession): string {
  const namespaces = new Set(
    session.srcs.map((raw) => parseLogSource(raw)?.namespace).filter(Boolean),
  );
  const context = namespaces.size === 1 ? [...namespaces][0] : `${namespaces.size} namespaces`;
  const n = session.srcs.length;
  return `${n} ${n === 1 ? "source" : "sources"} · ${context} · ${relTime(session.at)}`;
}

function relTime(at: number): string {
  const m = Math.round((Date.now() - at) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

function statusIcon(row: PodRow): { name: string; cls: string } | null {
  if (row.statusSeverity === "ok") return null;
  if (row.statusSeverity === "pending") return { name: "i-lucide-clock", cls: "text-info" };
  if (row.statusSeverity === "warn")
    return { name: "i-lucide-triangle-alert", cls: "text-warning" };
  return { name: "i-lucide-triangle-alert", cls: "text-error" };
}
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'sm:max-w-4xl' }">
    <template #content>
      <div class="flex flex-col h-[48rem]">
        <div
          ref="head"
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
            {{ drill.row.name }}
          </span>
          <span v-else-if="drill?.kind === 'recents'" class="text-xs text-muted shrink-0">
            Recent Log Sessions
          </span>
          <UInput
            v-model="query"
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
            @keydown="onKeydown"
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

            <div v-else-if="row.type === 'note'" class="px-2 py-2 text-sm text-dimmed">
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
              <span class="text-xs text-dimmed">{{ recents.length }}</span>
              <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed ml-auto shrink-0" />
            </div>

            <div
              v-else-if="row.type === 'session'"
              :data-palette-row="i"
              class="flex items-center gap-2 h-9 px-2 rounded-md cursor-pointer"
              :class="isHighlighted(i) ? 'bg-elevated' : ''"
              @mousemove="highlightRow(i)"
              @click="primaryAction(row)"
            >
              <UIcon name="i-lucide-history" class="size-4 text-muted shrink-0" />
              <span
                class="truncate font-mono text-xs"
                :title="sessionLabel(recents[row.index]!.srcs)"
              >
                {{ sessionLabel(recents[row.index]!.srcs) }}
              </span>
              <span class="text-xs text-dimmed ml-auto whitespace-nowrap">
                {{ sessionDetail(recents[row.index]!) }}
              </span>
            </div>

            <div
              v-else-if="row.type === 'pod'"
              :data-palette-row="i"
              class="flex items-center gap-2 h-9 px-2 rounded-md cursor-pointer"
              :class="[isHighlighted(i) ? 'bg-elevated' : '', rowCovered(row) ? 'opacity-50' : '']"
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
                      : podPendingCount(row.row)
                        ? 'i-lucide-square-minus'
                        : 'i-lucide-square'
                  "
                  class="size-4"
                  :class="
                    isSelected(row) || podPendingCount(row.row) ? 'text-primary' : 'text-dimmed'
                  "
                />
              </button>
              <UIcon name="i-lucide-box" class="size-4 text-muted shrink-0" />
              <span class="font-mono text-xs truncate" :title="row.row.name">
                {{ row.row.name }}
              </span>
              <UIcon
                v-if="statusIcon(row.row)"
                :name="statusIcon(row.row)!.name"
                class="size-3 shrink-0"
                :class="statusIcon(row.row)!.cls"
                :title="row.row.status"
              />
              <span class="text-xs ml-auto whitespace-nowrap">
                <span v-if="podPendingCount(row.row)" class="text-primary">
                  {{ podPendingCount(row.row) }} selected ·
                </span>
                <span v-if="podNarrowedCount(row.row)" class="text-dimmed">
                  {{ podNarrowedCount(row.row) }} added ·
                </span>
                <span class="text-dimmed">{{ row.row.ready }}</span>
              </span>
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
              :class="[isHighlighted(i) ? 'bg-elevated' : '', rowCovered(row) ? 'opacity-50' : '']"
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
              <span class="font-mono text-xs truncate">{{ row.container }}</span>
              <span v-if="row.init" class="text-xs text-dimmed">init</span>
            </div>
          </template>
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
          <span class="ml-auto flex items-center gap-2 whitespace-nowrap">
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
</template>
