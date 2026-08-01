<script setup lang="ts">
const route = useRoute();
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div class="mb-6">
      <h1 class="text-2xl font-semibold mb-2">Not Built Yet</h1>
      <p class="text-muted">
        Nothing here yet at <code>{{ route.path }}</code
        >.
      </p>
    </div>

    <AppPlaceholder class="flex-1" />
  </div>
</template>
