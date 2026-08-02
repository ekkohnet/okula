<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from "@nuxt/ui";

import { ClusterStatus } from "#services/cluster/models";

const { clusters, activeCluster, connectNotify, disconnectNotify } = useClusters();

const open = ref(false);
const switcherButton = useTemplateRef("switcherButton");

defineShortcuts({
  meta_k: () => {
    open.value = !open.value;
  },
});

// Refocus the switcher button once the palette has fully closed. Its search
// input is otherwise unmounted while focused — no blur event fires, Nuxt UI's
// shortcut engine (useActiveElement) keeps a stale input reference, and every
// shortcut stays disabled until some other element receives real focus.
function onPaletteClosed() {
  switcherButton.value?.$el?.focus?.();
}

const statusClass = computed(() => {
  switch (activeCluster.value?.status) {
    case ClusterStatus.ClusterStatusConnected:
      return "bg-success";
    case ClusterStatus.ClusterStatusConnecting:
      return "bg-info";
    case ClusterStatus.ClusterStatusUnreachable:
      return "bg-error";
    default:
      return "bg-gray-500";
  }
});

// Most recently seen first; the heartbeat keeps last_seen fresh while
// connected, so this doubles as recently-used ordering. Fuzzy search
// relevance takes over once the user types.
const sortedClusters = computed(() =>
  [...clusters.value].sort((a, b) => {
    const aSeen = a.lastSeen ?? 0;
    const bSeen = b.lastSeen ?? 0;
    if (aSeen !== bSeen) {
      return bSeen - aSeen;
    }
    return a.entry.contextName.localeCompare(b.entry.contextName);
  }),
);

function shortenPath(path: string): string {
  return path.replace(/^\/(?:Users|home)\/[^/]+/, "~");
}

const groups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => {
  const result: CommandPaletteGroup<CommandPaletteItem>[] = [
    {
      id: "clusters",
      label: "Clusters",
      items: sortedClusters.value.map((cluster) => ({
        label: cluster.entry.contextName,
        suffix: shortenPath(cluster.entry.kubeconfigPath),
        color: cluster.entry.color,
        // Marked via the item-trailing check; the `active` item styling looks
        // like a permanent highlight and fights the keyboard cursor.
        connected: cluster.active,
        onSelect: () => {
          open.value = false;
          if (!cluster.active) {
            connectNotify(cluster.id);
          }
        },
      })),
    },
  ];

  if (activeCluster.value) {
    result.push({
      id: "actions",
      label: "Actions",
      items: [
        {
          label: `Disconnect from ${activeCluster.value.entry.contextName}`,
          icon: "i-lucide-unplug",
          onSelect: () => {
            open.value = false;
            disconnectNotify();
          },
        },
      ],
    });
  }

  return result;
});
</script>

<template>
  <div class="flex items-center gap-2">
    <UButton
      ref="switcherButton"
      variant="outline"
      color="neutral"
      size="md"
      class="flex items-center gap-2 h-8 bg-transparent pl-3 pr-2 min-w-80 shrink-0 whitespace-nowrap ring-default"
      aria-label="Switch cluster"
      @click="open = true"
    >
      <template v-if="activeCluster">
        <div class="w-2 h-2 rounded-full" :class="statusClass" />
        <span class="font-medium">{{ activeCluster.entry.contextName }}</span>
        <UBadge
          v-if="activeCluster.entry.version"
          color="neutral"
          variant="soft"
          size="sm"
          class="ml-1"
        >
          {{ activeCluster.entry.version }}
        </UBadge>
      </template>
      <template v-else>
        <div class="w-2 h-2 bg-gray-500 rounded-full" />
        <span class="text-gray-500">No Active Cluster</span>
      </template>

      <div class="ml-auto hidden sm:flex items-center gap-0.5 opacity-60">
        <UKbd class="text-[10px] px-1 py-0.5" variant="soft" value="command"></UKbd>
        <UKbd class="text-[10px] px-1 py-0.5" variant="soft">K</UKbd>
      </div>
    </UButton>

    <UModal v-model:open="open" :ui="{ content: 'sm:max-w-4xl' }" @after:leave="onPaletteClosed">
      <template #content>
        <UCommandPalette
          :groups="groups"
          placeholder="Switch cluster..."
          close
          @update:open="open = $event"
        >
          <template #item-leading="{ item }">
            <span
              v-if="item.color"
              class="size-3 rounded-xs shrink-0 self-center"
              :style="{ backgroundColor: item.color }"
            />
            <UIcon v-else-if="item.icon" :name="item.icon" class="size-5 shrink-0 self-center" />
          </template>

          <template #item-trailing="{ item }">
            <UIcon
              v-if="item.connected"
              name="i-lucide-check"
              class="size-4 self-center text-success"
            />
          </template>
        </UCommandPalette>
      </template>
    </UModal>
  </div>
</template>
