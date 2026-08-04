<script setup lang="ts">
import type { ClusterInstance } from "#services/cluster/models";

// Cluster detail is a cousin of ResourceDetail: same URL-driven, non-modal
// slideover language, but the data is already client-side — the panel just
// resolves `?detail=<entry id>` against the catalog list.

const route = useRoute();
const router = useRouter();

const { clusters, connectNotify, disconnectNotify } = useClusters();

const targetId = computed(() => {
  const raw = route.query.detail;
  return typeof raw === "string" && raw ? raw : null;
});

const instance = computed<ClusterInstance | null>(
  () => clusters.value.find((c) => c.id === targetId.value) ?? null,
);

const open = computed({
  get: () => targetId.value !== null,
  set(value: boolean) {
    if (value) return;
    const { detail: _, ...rest } = route.query;
    router.replace({ query: rest });
  },
});
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="instance?.entry.shortName || instance?.entry.contextName"
    :description="instance?.entry.contextName"
    class="max-w-2xl bg-[#131D2C]"
    :overlay="false"
    :modal="false"
    dismissible
    :content="{
      // Same reasoning as ResourceDetail: outside interaction must not
      // dismiss, so row clicks swap the panel in place.
      onInteractOutside: (e: Event) => e.preventDefault(),
    }"
  >
    <template #body>
      <p v-if="!instance" class="text-sm text-dimmed">Cluster not found in the catalog.</p>
      <div v-else class="flex flex-col gap-6">
        <div class="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2.5 text-sm">
          <span class="text-muted">Status</span>
          <div>
            <CatalogStatusBadge :status="instance.status" />
          </div>

          <span class="text-muted">Distro</span>
          <div class="flex items-center gap-2">
            <CatalogDistroIcon :distro="instance.entry.distro" />
            <span v-if="instance.entry.distro">{{ instance.entry.distro }}</span>
            <span v-else class="text-dimmed">—</span>
          </div>

          <span class="text-muted">Version</span>
          <span v-if="instance.entry.version">{{ instance.entry.version }}</span>
          <span v-else class="text-dimmed">Not Available</span>

          <span class="text-muted">Namespace</span>
          <span v-if="instance.entry.namespace">{{ instance.entry.namespace }}</span>
          <span v-else class="text-dimmed">—</span>

          <span class="text-muted">Last Seen</span>
          <TimeAgo :timestamp="instance.lastSeen ?? instance.entry.lastSeen" />

          <span class="text-muted">Kubeconfig</span>
          <span class="font-mono text-xs/5 truncate" :title="instance.entry.kubeconfigPath">
            {{ instance.entry.kubeconfigPath }}
          </span>
        </div>

        <UAlert
          v-if="instance.lastError"
          color="error"
          variant="soft"
          title="Last connection error"
          :description="instance.lastError"
        />
      </div>
    </template>

    <template v-if="instance" #footer>
      <UButton
        v-if="instance.active"
        label="Disconnect"
        icon="i-lucide-unplug"
        color="neutral"
        variant="soft"
        @click="disconnectNotify()"
      />
      <UButton v-else label="Connect" icon="i-lucide-plug" @click="connectNotify(instance.id)" />
    </template>
  </USlideover>
</template>
