<script setup lang="ts">
import type { LogSource } from "~/utils/logSources";

// The log viewer destination: sources live in the query (?src=...), so
// the URL doubles as a spawn address. Entering pushes history (an
// ordinary navigateTo); in-viewer source changes replace. This piece
// renders the first source only — multi-source arrives with the merge
// engine.

const route = useRoute();
const router = useRouter();

const parsed = computed(() => parseLogSources(route.query.src));
const source = computed<LogSource | null>(() => parsed.value.sources[0] ?? null);

// Remount per pod (fresh buffer, container refetch); container narrowing
// keeps the instance and just restarts the stream.
const viewerKey = computed(() =>
  source.value ? `${source.value.namespace}/${source.value.pod}` : "",
);

// Dropdown narrowing rewrites the address in place: the URL always says
// which container is on screen.
function narrow(container: string) {
  if (!source.value || source.value.container === container) return;
  router.replace({
    query: { ...route.query, src: formatLogSource({ ...source.value, container }) },
  });
}

const podPage = computed(() =>
  source.value ? `/resources/pods/${source.value.namespace}/${source.value.pod}` : null,
);

const breadcrumb = computed(() =>
  source.value
    ? [
        { label: "Pods", to: "/resources/pods" },
        { label: source.value.namespace },
        { label: source.value.pod, to: podPage.value ?? undefined },
      ]
    : [],
);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <PageHeader
      title="Logs"
      :breadcrumb="breadcrumb"
      :back-fallback="podPage ?? '/resources/pods'"
    />

    <LogViewer v-if="source" :key="viewerKey" :source="source" class="flex-1" @narrow="narrow" />

    <div v-else class="flex-1 flex flex-col items-center justify-center gap-1">
      <template v-if="parsed.invalid.length">
        <p class="text-sm text-toned">Unrecognized log source:</p>
        <p class="text-sm font-mono text-dimmed">{{ parsed.invalid.join(", ") }}</p>
      </template>
      <p v-else class="text-sm text-dimmed">No log sources. Open Logs on a pod to view it here.</p>
    </div>
  </div>
</template>
