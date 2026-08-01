<script setup lang="ts">
import OrbStackIcon from "../assets/images/orbstack.png";

defineProps<{
  distro: "EKS" | "AKS" | "Orbstack" | "Kubernetes";
}>();
</script>

<template>
  <div class="flex items-center">
    <!-- AWS EKS -->
    <UTooltip v-if="distro === 'EKS'" :content="{ side: 'right' }" text="Amazon EKS">
      <AWSIcon class="h-3" />
    </UTooltip>

    <!-- Azure AKS -->
    <UTooltip v-if="distro === 'AKS'" :content="{ side: 'right' }" text="Azure AKS">
      <UIcon name="i-devicon-azure" class="size-4" />
    </UTooltip>

    <!-- OrbStack -->
    <UTooltip v-if="distro === 'Orbstack'" :content="{ side: 'right' }" text="OrbStack">
      <img :src="OrbStackIcon" alt="OrbStack" class="size-5" />
    </UTooltip>

    <!-- Generic Kubernetes -->
    <UTooltip v-if="distro === 'Kubernetes'" :content="{ side: 'right' }" text="Kubernetes">
      <UIcon name="i-devicon-kubernetes" class="size-5" />
    </UTooltip>
  </div>
</template>
