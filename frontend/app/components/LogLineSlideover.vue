<script setup lang="ts">
import hljs from "highlight.js/lib/core";
import jsonLang from "highlight.js/lib/languages/json";

import type { BufferLine } from "~/utils/logBuffer";

// The full-line surface: the log pane render-clips pathological lines
// (MAX_RENDER_CH); the truncation marker opens this slideover with the
// whole text — pretty-printed when the line parses as JSON, wrapped
// raw otherwise (giants are often producer-truncated mid-structure, so
// raw is the honest fallback). Read-only; Copy carries the original
// single-line text, never the pretty-print.

hljs.registerLanguage("json", jsonLang);

const props = defineProps<{
  line: BufferLine | null;
}>();

const open = defineModel<boolean>("open", { required: true });

// The pane's prefix tiers compress identity; this surface has room
// for the full pod / container pair (from the stream key, so it
// survives source removal while open).
const title = computed(() => {
  const key = props.line?.stream;
  if (!key) return "Log Line";
  const [, pod, container] = key.split("/");
  return `${pod} / ${container}`;
});

// Same time grammar as the pane's timestamp column.
const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
  hour12: false,
});

const meta = computed(() => {
  if (!props.line) return "";
  const parts: string[] = [];
  if (props.line.t) parts.push(timeFormat.format(props.line.t));
  parts.push(`${props.line.text.length.toLocaleString()} chars`);
  return parts.join(" · ");
});

// Whole-line parse only: pretty-printing an embedded fragment would
// silently drop the text around it.
const pretty = computed(() => {
  const t = (props.line?.text ?? "").trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return null;
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return null;
  }
});

// Lazy via computed; hljs escapes the source, so the output is
// v-html-safe.
const highlighted = computed(() =>
  pretty.value === null ? null : hljs.highlight(pretty.value, { language: "json" }).value,
);

// Copy gives feedback in place, same pattern as ManifestSlideover.
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | undefined;
async function copyLine() {
  if (!props.line) return;
  await navigator.clipboard.writeText(props.line.text);
  copied.value = true;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => (copied.value = false), 1500);
}
onBeforeUnmount(() => clearTimeout(copyTimer));
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="title"
    class="max-w-5xl bg-elevated-flat sm:shadow-[-16px_0_32px_rgb(0_0_0/0.35)]"
    :overlay="false"
    :modal="false"
    dismissible
    :ui="{ body: 'flex flex-col p-0 sm:p-0' }"
  >
    <template #body>
      <div
        class="flex items-center gap-3 px-4 sm:px-6 py-2 bg-default border-b border-default shrink-0"
      >
        <SectionTitle>Log Line</SectionTitle>
        <span class="text-xs text-muted font-mono">
          {{ meta }}<template v-if="pretty !== null"> · JSON</template>
        </span>
        <UButton
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          color="neutral"
          variant="ghost"
          size="sm"
          class="ms-auto"
          @click="copyLine"
        >
          Copy
        </UButton>
      </div>

      <!-- eslint-disable vue/no-v-html -- hljs escapes the source -->
      <pre
        v-if="highlighted !== null"
        class="flex-1 min-h-0 overflow-auto bg-sunken p-4 sm:p-6 text-xs/5 font-mono whitespace-pre"
        v-html="highlighted"
      />
      <!-- eslint-enable vue/no-v-html -->
      <pre
        v-else
        class="flex-1 min-h-0 overflow-auto bg-sunken p-4 sm:p-6 text-xs/5 font-mono whitespace-pre-wrap break-all"
        >{{ line?.text }}</pre>
    </template>
  </USlideover>
</template>

<style scoped>
/* Catppuccin Mocha on the sunken pane, matching ManifestSlideover —
   classes from highlight.js's json grammar. */
pre {
  color: #cdd6f4; /* text */
}
pre :deep(.hljs-attr) {
  color: #89b4fa; /* blue — keys */
}
pre :deep(.hljs-string) {
  color: #a6e3a1; /* green — strings */
}
pre :deep(.hljs-number) {
  color: #fab387; /* peach — numbers */
}
pre :deep(.hljs-literal) {
  color: #cba6f7; /* mauve — booleans / null */
}
pre :deep(.hljs-punctuation) {
  color: #9399b2; /* overlay2 — braces, colons, commas */
}
</style>
