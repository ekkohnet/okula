<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from "vue";

type Context = {
  displayName: string;
  version: string;
  status: "healthy" | "warning" | "error" | string;
};

const props = defineProps<{
  selectedContext?: Context | null;
}>();

const isOpen = ref(false);

const statusClass = computed(() => {
  const s = props.selectedContext?.status;
  switch (s) {
    case "healthy":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "error":
      return "bg-rose-500";
    default:
      return "bg-gray-500";
  }
});

function openPalette() {
  isOpen.value = true;
}

onMounted(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openPalette();
    }
  };
  window.addEventListener("keydown", handler);
  onBeforeUnmount(() => window.removeEventListener("keydown", handler));
});

// Example command groups — replace with your real commands
const _groups = [
  {
    key: "clusters",
    label: "Clusters",
    commands: [{ id: "select-cluster", label: "Select Cluster…", icon: "i-lucide-search" }],
  },
  {
    key: "actions",
    label: "Actions",
    commands: [{ id: "open-settings", label: "Open Settings", icon: "i-lucide-settings" }],
  },
];
</script>

<template>
  <div class="flex items-center gap-2">
    <UButton
      variant="outline"
      color="neutral"
      size="md"
      class="flex items-center gap-2 h-8 bg-transparent pl-3 pr-2 min-w-80 shrink-0 whitespace-nowrap ring-default"
      aria-label="Open command palette"
      @click="openPalette"
    >
      <template v-if="selectedContext">
        <div class="w-2 h-2 rounded-full" :class="statusClass" />
        <span class="font-medium">{{ selectedContext.displayName }}</span>
        <UBadge color="neutral" variant="soft" size="sm" class="ml-1">
          {{ selectedContext.version }}
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

    <!-- Nuxt UI Command Palette -->
    <!-- <UCommandPalette v-model="isOpen" :groups="groups" /> -->
  </div>
</template>
