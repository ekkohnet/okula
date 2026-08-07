<script setup lang="ts">
import hljs from "highlight.js/lib/core";
import yamlLang from "highlight.js/lib/languages/yaml";
import type { HLJSApi, Mode } from "highlight.js";

// The Manifest surface: the object's server-side YAML, read-only, demoted
// to a supporting slideover per the redesign. Hosts own the data — the
// YAML arrives with every detail fetch (ObjectDetail.yaml) — so this
// component never loads or errors. Editing is a later piece; only the
// pane body changes when it lands.

// Stock yaml grammar marks any digit run with a trailing word boundary as
// a number, splitting scalars like a UID (49133937-855f-…) into number +
// string. A YAML scalar is only numeric when the whole value is — require
// end-of-line after the match. (Mode objects are shared between the
// grammar's block/flow branches, hence the seen guard.)
hljs.registerLanguage("yaml", (h: HLJSApi) => {
  const lang = yamlLang(h);
  const seen = new Set<Mode>();
  const fix = (modes: (Mode | "self")[]) => {
    for (const m of modes) {
      if (typeof m !== "object" || seen.has(m)) continue;
      seen.add(m);
      if (m.className === "number" && typeof m.begin === "string") {
        m.begin = `(?:${m.begin})(?=[ \\t]*$)`;
      }
      if (m.contains) fix(m.contains);
    }
  };
  fix(lang.contains ?? []);
  return lang;
});

const props = defineProps<{
  yaml: string;
  title: string;
}>();

const open = defineModel<boolean>("open", { required: true });

// Lazy via computed: only evaluated once the pane actually renders.
// hljs escapes the source, so the output is v-html-safe.
const highlighted = computed(() => hljs.highlight(props.yaml, { language: "yaml" }).value);

// Copy gives feedback in place, same pattern as PageHeader's copy-name.
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | undefined;
async function copyYaml() {
  await navigator.clipboard.writeText(props.yaml);
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
    class="max-w-5xl bg-elevated-flat sm:shadow-[-16px_0_32px_rgb(0_0_0/0.4)]"
    :overlay="false"
    :modal="false"
    dismissible
    :content="{
      // Same reasoning as the catalog slideover: interacting with the page
      // behind must not dismiss the panel.
      onInteractOutside: (e: Event) => e.preventDefault(),
    }"
    :ui="{ body: 'flex flex-col p-0 sm:p-0' }"
  >
    <template #body>
      <!-- Actions band: home for manifest operations (copy now; edit mode,
      format, etc. later). Its top divider comes from the slideover's own
      header/body divide. -->
      <div class="flex items-center px-4 sm:px-6 py-2 bg-default border-b border-default shrink-0">
        <SectionTitle>Manifest</SectionTitle>
        <UButton
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          color="neutral"
          variant="ghost"
          size="sm"
          class="ms-auto"
          @click="copyYaml"
        >
          Copy
        </UButton>
      </div>

      <!-- eslint-disable vue/no-v-html -- hljs escapes the source -->
      <pre
        class="flex-1 min-h-0 overflow-auto bg-sunken p-4 sm:p-6 text-xs/5 font-mono whitespace-pre"
        v-html="highlighted"
      />
      <!-- eslint-enable vue/no-v-html -->
    </template>
  </USlideover>
</template>

<style scoped>
/* Catppuccin Mocha on the sunken pane — the one surface with a fixed
   palette instead of theme tokens (a future themes pass can make this a
   choice). Classes from highlight.js's yaml grammar; comment/meta never
   occur in marshaled output but are covered for safety. */
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
pre :deep(.hljs-bullet) {
  color: #9399b2; /* overlay2 — list markers */
}
pre :deep(.hljs-comment),
pre :deep(.hljs-meta) {
  color: #6c7086; /* overlay0 */
}
</style>
