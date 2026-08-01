<script setup lang="ts">
import icon from "~/assets/images/app-icon.svg";
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center">
      <img :src="icon" alt="Okula" class="size-9 ml-0.5" />
      <p class="text-xl font-semibold text-white ml-2">Okula</p>
    </div>

    <UNavigationMenu
      orientation="vertical"
      :items="[
        {
          label: 'Cluster Catalog',
          icon: 'i-lucide-layout-list',
          to: '/catalog',
        },
      ]"
    />
  </div>
</template>
