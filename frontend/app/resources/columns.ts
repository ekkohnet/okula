import { h } from "vue";
import type { VNode } from "vue";
import type { BadgeProps } from "@nuxt/ui";

import { UBadge, TimeAgo } from "#components";

// Severity levels emitted by backend projectors for status-ish fields.
export type Severity = "ok" | "pending" | "warn" | "error";

export const severityColor: Record<Severity, BadgeProps["color"]> = {
  ok: "success",
  pending: "info",
  warn: "warning",
  error: "error",
};

// severityBadge renders a status string as a badge coloured by severity.
export function severityBadge(status: string, severity: Severity): VNode {
  return h(
    UBadge,
    {
      color: severityColor[severity] ?? "neutral",
      variant: "soft",
      size: "sm",
    },
    () => status,
  );
}

// nameCell renders the resource name with emphasis.
export function nameCell(name: string): VNode {
  return h("span", { class: "font-medium text-highlighted" }, name);
}

// dimZero de-emphasises zero values so populated cells stand out.
export function dimZero(value: number): VNode | string {
  return value === 0 ? h("span", { class: "text-dimmed" }, "0") : String(value);
}

// textOrDash renders a dimmed dash for empty values.
export function textOrDash(value: string | null | undefined): VNode | string {
  return value ? value : h("span", { class: "text-dimmed" }, "—");
}

// ageCell renders a ticking relative timestamp (dash when 0/unset).
export function ageCell(timestamp: number): VNode {
  return h(TimeAgo, { timestamp });
}

// machineCell renders a machine string (IP, host, node name, ports) in the
// grid's bare-mono grammar; dimmed dash when empty. The pill form of the
// grammar belongs to isolated contexts (detail strips), not dense grids.
export function machineCell(value: string | null | undefined, widthClass = "max-w-56"): VNode {
  if (!value) return h("span", { class: "text-dimmed" }, "—");
  return h(
    "span",
    { class: `font-mono text-xs text-toned block truncate ${widthClass}`, title: value },
    value,
  );
}

// truncated caps a potentially long value, with the full text on hover.
// Multi-line rendering for lists (e.g. ingress hosts) is later polish.
export function truncated(value: string | null | undefined, widthClass = "max-w-64"): VNode {
  if (!value) return h("span", { class: "text-dimmed" }, "—");
  return h("span", { class: `block truncate ${widthClass}`, title: value }, value);
}
