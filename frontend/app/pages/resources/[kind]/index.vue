<script setup lang="ts">
import { resourceRegistry } from "~/resources";

definePageMeta({
  // One route record serves every kind, so Vue would reuse the component
  // across kinds and skip mount/unmount — silently breaking useResource's
  // subscribe/unsubscribe. Key per kind to force a remount.
  key: (route) => `list:${String(route.params.kind)}`,
});

const route = useRoute();
const def = resourceRegistry[String(route.params.kind)];
</script>

<template>
  <ResourceList v-if="def" :def="def" />
  <ResourceNotFound v-else />
</template>
