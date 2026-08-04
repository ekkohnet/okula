<script setup lang="ts">
import { ClusterStatus } from "#services/cluster/models";

const props = defineProps<{
  status: ClusterStatus;
}>();

const statusColor = computed(() => {
  switch (props.status) {
    case ClusterStatus.ClusterStatusConnected:
      return "success";
    case ClusterStatus.ClusterStatusConnecting:
      return "info";
    case ClusterStatus.ClusterStatusUnreachable:
      return "error";
    case ClusterStatus.ClusterStatusDisconnected:
      return "neutral";
    case ClusterStatus.$zero:
    default:
      return "warning";
  }
});
</script>

<template>
  <UBadge :color="statusColor" size="md" variant="soft">
    {{ props.status }}
  </UBadge>
</template>
