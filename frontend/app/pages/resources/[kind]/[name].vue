<script setup lang="ts">
import { resourceRegistry } from "~/resources";

// Cluster-scoped resource detail; namespaced kinds live one segment deeper.

definePageMeta({
  // Same route record for every object of a kind — key per path so each
  // object gets a fresh mount (the coming data fetch relies on it).
  key: (route) => route.fullPath,
});

const route = useRoute();

const kind = String(route.params.kind);
const name = String(route.params.name);
const def = resourceRegistry[kind];
</script>

<template>
  <BareDetail v-if="def && !def.namespaced" :def="def" namespace="" :name="name" />
  <ResourceNotFound v-else />
</template>
