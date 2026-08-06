<script setup lang="ts">
// 404 for resource URLs that don't resolve — unknown kind, or a depth that
// contradicts the kind's scoping. Rendered in the shell so the sidebar
// stays usable.
const route = useRoute();
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div class="mb-6">
      <h1 class="text-2xl font-semibold mb-2">Not Found</h1>
      <p class="text-muted">
        No resource here at <code>{{ route.path }}</code
        >.
      </p>
    </div>

    <AppPlaceholder class="flex-1" />
  </div>
</template>
