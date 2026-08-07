<script setup lang="ts">
import type { AnyResourceDef, ResourceRow } from "~/resources/types";

// The bare detail page for kinds without a bespoke layout: header plus the
// Manifest action — deliberately no content until the generic baseline
// piece settles its shape. The fetch is the same machinery the baseline
// will need; events come along unused until then.

const props = defineProps<{
  def: AnyResourceDef;
  // Empty for cluster-scoped kinds.
  namespace: string;
  name: string;
}>();

const route = useRoute();
const kindSlug = String(route.params.kind);

const { detail, error } = useResourceObject<ResourceRow>(props.def, props.namespace, props.name);

const manifestOpen = ref(false);

const breadcrumb = computed(() => [
  { label: props.def.title, to: `/resources/${kindSlug}` },
  ...(props.def.namespaced ? [{ label: props.namespace }] : []),
]);
</script>

<template>
  <div class="h-full min-h-0 flex flex-col px-3">
    <PageHeader
      :title="name"
      copy-title
      :breadcrumb="breadcrumb"
      :back-fallback="`/resources/${kindSlug}`"
    >
      <template #actions>
        <UButton
          icon="i-lucide-file-code"
          color="neutral"
          variant="soft"
          :disabled="!detail"
          @click="manifestOpen = true"
        >
          Manifest
        </UButton>
      </template>
    </PageHeader>

    <ManifestSlideover v-model:open="manifestOpen" :yaml="detail?.yaml ?? ''" :title="name" />

    <!-- The page has no content to fall back on, so a failed fetch is the
    one thing it must say out loud. -->
    <UAlert
      v-if="error && !detail"
      color="error"
      variant="soft"
      title="Failed to load object"
      :description="error"
    />
  </div>
</template>
