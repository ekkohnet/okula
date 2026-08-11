<script setup lang="ts">
import type { PodLogSource } from "~/utils/logSources";

// The log viewer destination: sources live in the query (?src=..., one
// param per source), so the URL doubles as a spawn address and is the
// truth of the viewer's contents. Entering pushes history (an ordinary
// navigateTo); in-viewer source changes replace. The page normalizes
// whatever arrives — a bare pod subsumes its narrowed sources,
// duplicates collapse — and rewrites the address in place when
// normalization changed it, so overlapping sets never reach the
// viewer. Invalid src params are kept in the URL and reported, never
// silently eaten.

const route = useRoute();
const router = useRouter();

const parsed = computed(() => parseLogSources(route.query.src));
const sources = computed(() => normalizeLogSources(parsed.value.sources));

watch(
  sources,
  () => {
    if (parsed.value.sources.length === sources.value.length) return;
    router.replace({
      query: {
        ...route.query,
        src: [...parsed.value.invalid, ...sources.value.map(formatLogSource)],
      },
    });
  },
  { immediate: true },
);

// The viewer reconciles source-set changes in place — no remount key;
// buffers survive composition edits.
const viewer = useTemplateRef("viewer");

// The header line is always occupied and speaks one grammar at every
// N: count leads, context follows (settled rounds 1/4). The pod link
// is the road to its page at N=1; multi has no single ancestor.
const breadcrumb = computed(() => {
  const srcs = sources.value;
  if (!srcs.length) return [{ label: "No sources" }];
  if (srcs.length === 1) {
    const s = srcs[0]!;
    const items: { label: string; to?: string; separator?: string }[] = [
      { label: "1 source" },
      { label: s.namespace, separator: "•" },
      { label: s.pod, to: `/resources/pods/${s.namespace}/${s.pod}` },
    ];
    if (s.container) items.push({ label: s.container });
    return items;
  }
  const namespaces = new Set(srcs.map((s) => s.namespace));
  const context = namespaces.size === 1 ? [...namespaces][0]! : `${namespaces.size} namespaces`;
  return [{ label: `${srcs.length} sources` }, { label: context, separator: "•" }];
});

const backFallback = computed(() =>
  sources.value.length === 1
    ? `/resources/pods/${sources.value[0]!.namespace}/${sources.value[0]!.pod}`
    : "/resources/pods",
);

// Remove is source-level and a composition edit: the URL sheds the
// source (replace, not push) and the viewer reconciles.
function removeSource(key: string) {
  const next = sources.value.filter((s) => formatLogSource(s) !== key);
  router.replace({
    query: { ...route.query, src: [...parsed.value.invalid, ...next.map(formatLogSource)] },
  });
}

// --- Composition surfaces (piece 6e3) ---

const paletteOpen = ref(false);
const { lastSrcs, noteUrl, recordDisplaced } = useLogSessions();

function addSources(added: PodLogSource[]) {
  const next = normalizeLogSources([...sources.value, ...added]);
  router.replace({
    query: { ...route.query, src: [...parsed.value.invalid, ...next.map(formatLogSource)] },
  });
}

// Restoring an old session replaces the address wholesale (stale
// invalid params don't ride along).
function restoreSession(srcs: string[]) {
  router.replace({ query: { ...route.query, src: srcs } });
}

function resetSources() {
  const query = { ...route.query };
  delete query.src;
  router.replace({ query });
}

// Session memory: remember the address, and record displaced
// compositions for the palette's recents. The rule is pure set logic —
// a pure extension (add) and a pure removal both stay silent; anything
// else (external seed, restore, reset-to-empty) records the outgoing
// set. lastSrcs lives in session state so the comparison survives
// remounts: a pod-page Logs click displaces a composition this mount
// never saw.
watch(
  sources,
  () => {
    const next = sources.value.map(formatLogSource);
    const prev = lastSrcs.value;
    const isExtension = prev.every((k) => next.includes(k));
    const isRemoval = next.length > 0 && next.every((k) => prev.includes(k));
    if (prev.length && !isExtension && !isRemoval) recordDisplaced(prev);
    lastSrcs.value = next;
    noteUrl(route.fullPath);
  },
  { immediate: true },
);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col px-3">
    <PageHeader title="Logs" :breadcrumb="breadcrumb" :back-fallback="backFallback">
      <template #title-trailing>
        <UBadge
          v-if="viewer?.paused"
          color="warning"
          variant="subtle"
          size="sm"
          icon="i-lucide-square-pause"
          class="ml-1"
        >
          Paused
        </UBadge>
      </template>
      <template v-if="sources.length" #actions>
        <UButton icon="i-lucide-eraser" color="neutral" variant="soft" @click="viewer?.clear()">
          Clear Output
        </UButton>
        <UButton icon="i-lucide-list-x" color="error" variant="soft" @click="resetSources">
          Reset Sources
        </UButton>
      </template>
    </PageHeader>

    <!-- The viewer renders at every N including zero — the chrome is
    constant, and the empty state lives inside the pane (the settled
    mock shape). -->
    <LogViewer
      ref="viewer"
      :sources="sources"
      :invalid="parsed.invalid"
      class="flex-1"
      @remove-source="removeSource"
      @add="paletteOpen = true"
    />

    <LogSourcePalette
      v-model:open="paletteOpen"
      :sources="sources"
      @add="addSources"
      @restore="restoreSession"
    />
  </div>
</template>
