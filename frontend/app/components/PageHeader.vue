<script setup lang="ts">
// The shared page-top geometry: back arrow, title with optional copy
// affordance, breadcrumb line, actions slot. Back retraces history;
// the breadcrumb is the separate hierarchy affordance.

interface BreadcrumbItem {
  label: string;
  to?: string;
}

const props = defineProps<{
  title: string;
  // Renders the copy affordance next to the title (for machine-string
  // titles like resource names).
  copyTitle?: boolean;
  breadcrumb?: BreadcrumbItem[];
  // Presence renders the back arrow. Used when there is no history to
  // retrace (fresh window, session restore).
  backFallback?: string;
}>();

const router = useRouter();

function goBack() {
  // vue-router maintains history.state.back in hash mode too; null means
  // this entry started the session.
  if (window.history.state?.back) router.back();
  else navigateTo(props.backFallback!, { replace: true });
}

// Copy gives feedback in place: the icon flips to a check briefly.
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | undefined;
async function copyName() {
  await navigator.clipboard.writeText(props.title);
  copied.value = true;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
  <div class="flex items-center gap-3 mb-8 shrink-0">
    <UTooltip v-if="backFallback" text="Back">
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        aria-label="Back"
        @click="goBack"
      />
    </UTooltip>
    <div class="min-w-0">
      <div class="flex items-center gap-1.5 min-w-0">
        <h1 class="text-2xl font-semibold truncate" :title="title">{{ title }}</h1>
        <UTooltip v-if="copyTitle" :text="copied ? 'Copied' : 'Copy Name'">
          <UButton
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            aria-label="Copy Name"
            class="shrink-0"
            @click="copyName"
          />
        </UTooltip>
      </div>
      <p v-if="breadcrumb?.length" class="text-sm text-muted">
        <template v-for="(item, i) in breadcrumb" :key="i">
          <span v-if="i" class="text-dimmed mx-2">/</span>
          <ULink v-if="item.to" raw :to="item.to" class="hover:text-highlighted transition-colors">
            {{ item.label }}
          </ULink>
          <span v-else>{{ item.label }}</span>
        </template>
      </p>
    </div>

    <div v-if="$slots.actions" class="flex items-center gap-2 ml-auto shrink-0">
      <slot name="actions" />
    </div>
  </div>
</template>
