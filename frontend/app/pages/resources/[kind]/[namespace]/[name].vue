<script setup lang="ts">
import { resourceRegistry } from "~/resources";

// Namespaced resource detail; cluster-scoped kinds live one segment up.

definePageMeta({
  // Same route record for every object of a kind — key per path so each
  // object gets a fresh mount (the coming data fetch relies on it).
  key: (route) => route.fullPath,
});

const route = useRoute();

const kind = String(route.params.kind);
const namespace = String(route.params.namespace);
const name = String(route.params.name);
const def = resourceRegistry[kind];
</script>

<template>
  <component
    :is="def.detail"
    v-if="def && def.namespaced && def.detail"
    :def="def"
    :namespace="namespace"
    :name="name"
  />
  <div v-else-if="def && def.namespaced" class="h-full min-h-0 flex flex-col px-3">
    <PageHeader
      :title="name"
      copy-title
      :breadcrumb="[{ label: def.title, to: `/resources/${kind}` }, { label: namespace }]"
      :back-fallback="`/resources/${kind}`"
    />
    <!-- Bare fallback for kinds without a bespoke detail page; the generic
    baseline replaces it as a later piece. -->
  </div>
  <ResourceNotFound v-else />
</template>
