<script setup lang="ts">
import type { Component } from "vue";

import { GetResourceObject, GetResourceEvents } from "#services/resources/service";
import type { ObjectDetail, ObjectEvent } from "#services/resources/models";
import { ResourceSummary } from "#components";

const props = defineProps<{
  // The frontend half of the resource definition; columns are irrelevant
  // here so any ResourceDef fits.
  def: { key: string; namespaced: boolean; summary?: Component };
}>();

const route = useRoute();
const router = useRouter();

// Detail state lives in the URL — `?detail=<ns>/<name>` for namespaced
// resources, `?detail=<name>` otherwise — so search can deep-link into
// objects and reloads restore the open panel.
const target = computed(() => {
  const raw = route.query.detail;
  if (typeof raw !== "string" || !raw) return null;
  if (!props.def.namespaced) return { namespace: "", name: raw };

  const slash = raw.indexOf("/");
  if (slash <= 0 || slash === raw.length - 1) return null;
  return { namespace: raw.slice(0, slash), name: raw.slice(slash + 1) };
});

const open = computed({
  get: () => target.value !== null,
  set(value: boolean) {
    if (value) return;
    const { detail: _, ...rest } = route.query;
    router.replace({ query: rest });
  },
});

// The active tab survives target swaps, so flipping through pods can stay
// on Events or YAML.
const tab = ref("summary");
const tabItems = [
  { label: "Summary", value: "summary" },
  { label: "Events", value: "events" },
  { label: "YAML", value: "yaml" },
];

const detail = ref<ObjectDetail | null>(null);
const events = ref<ObjectEvent[]>([]);
const error = ref<string | null>(null);
const loading = ref(false);
let requestId = 0;

watch(
  target,
  async (t) => {
    if (!t) return;
    const id = ++requestId;
    loading.value = true;
    error.value = null;
    try {
      const result = await GetResourceObject(props.def.key, t.namespace, t.name);
      if (id !== requestId) return;
      detail.value = result;

      const eventRows = await GetResourceEvents(t.namespace, result.uid);
      if (id !== requestId) return;
      events.value = (eventRows ?? []).filter((ev): ev is ObjectEvent => ev !== null);
    } catch (err) {
      if (id !== requestId) return;
      error.value = toErrorString(err);
      detail.value = null;
      events.value = [];
    } finally {
      if (id === requestId) loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="target?.name"
    :description="def.namespaced ? target?.namespace : undefined"
    class="max-w-3xl"
    :overlay="false"
    :modal="false"
    dismissible
    :content="{
      // Outside interaction must not dismiss: clicking another row swaps the
      // panel in place (dismissal would race the row click into a close/reopen
      // flash). Esc and the close button still close.
      onInteractOutside: (e: Event) => e.preventDefault(),
    }"
    :ui="{ body: 'flex flex-col' }"
  >
    <template #body>
      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        title="Failed to load object"
        :description="error"
      />
      <template v-else>
        <UTabs v-model="tab" :items="tabItems" :content="false" size="sm" class="shrink-0" />

        <div v-if="tab === 'summary'" class="flex-1 min-h-0 overflow-y-auto mt-3">
          <div v-if="loading && !detail" class="flex justify-center pt-12">
            <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-dimmed" />
          </div>
          <component :is="def.summary ?? ResourceSummary" v-else-if="detail" :object="detail.object" />
        </div>

        <div v-else-if="tab === 'events'" class="flex-1 min-h-0 overflow-y-auto mt-3">
          <div v-if="loading && !events.length" class="flex justify-center pt-12">
            <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-dimmed" />
          </div>
          <p v-else-if="!events.length" class="text-sm text-dimmed pt-4">
            No recent events. Clusters only keep events for about an hour.
          </p>
          <div v-else class="divide-y divide-default">
            <div v-for="(ev, i) in events" :key="i" class="py-3">
              <div class="flex items-center gap-2">
                <UBadge
                  :color="ev.type === 'Warning' ? 'warning' : 'neutral'"
                  variant="soft"
                  size="sm"
                >
                  {{ ev.reason }}
                </UBadge>
                <span v-if="ev.count > 1" class="text-xs text-muted">×{{ ev.count }}</span>
                <TimeAgo :timestamp="ev.lastSeen" class="text-xs text-dimmed ml-auto" />
              </div>
              <p class="text-sm mt-1.5">{{ ev.message }}</p>
              <p v-if="ev.source" class="text-xs text-dimmed mt-1">{{ ev.source }}</p>
            </div>
          </div>
        </div>

        <div v-else-if="tab === 'yaml'" class="flex-1 min-h-0 overflow-auto mt-3">
          <div v-if="loading && !detail" class="flex justify-center pt-12">
            <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-dimmed" />
          </div>
          <pre v-else class="text-xs/5 font-mono whitespace-pre">{{ detail?.yaml }}</pre>
        </div>
      </template>
    </template>
  </USlideover>
</template>
