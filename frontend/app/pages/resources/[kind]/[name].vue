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
  <div v-if="def && !def.namespaced" class="h-full min-h-0 flex flex-col px-3">
    <PageHeader
      :title="name"
      copy-title
      :breadcrumb="[{ label: def.title, to: `/resources/${kind}` }]"
      :back-fallback="`/resources/${kind}`"
    />
    <!-- Deliberately bare: the spine proves list → detail → back feel
    before the page grows content. -->
  </div>
  <ResourceNotFound v-else />
</template>
