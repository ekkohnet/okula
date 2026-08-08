<script setup lang="ts">
// Dissolved into the /logs destination. The stub keeps old addresses
// (session restore, stale history) landing on the viewer; safe to
// delete once no session can hold this route. Names are DNS-1123, so
// the literal src needs no escaping (mirrors formatLogSource).
definePageMeta({
  middleware: [
    (to) => navigateTo(`/logs?src=pod:${to.params.namespace}/${to.params.pod}`, { replace: true }),
  ],
});
</script>

<template>
  <div />
</template>
