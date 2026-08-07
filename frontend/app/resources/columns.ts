import { h } from "vue";
import type { VNode } from "vue";
import type { BadgeProps } from "@nuxt/ui";

import { TimeAgo } from "#components";

// Severity levels emitted by backend projectors for status-ish fields.
export type Severity = "ok" | "pending" | "warn" | "error";

// Shared column widths for the fixed table layout (see ResourceTable):
// fact columns hold declared widths, Name stays the elastic column that
// absorbs window resizing. Kind-specific columns declare theirs inline.
export const colw = {
  namespace: "w-56",
  status: "w-36",
  age: "w-32",
  ready: "w-20",
  restarts: "w-24",
  qos: "w-28",
  ip: "w-32",
  node: "w-56",
  actions: "w-14",
} as const;

// w wraps a width class as column meta; the header cell's width is
// authoritative under table-fixed.
export function w(width: string): { class: { th: string } } {
  return { class: { th: width } };
}

export const severityColor: Record<Severity, BadgeProps["color"]> = {
  ok: "success",
  pending: "info",
  warn: "warning",
  error: "error",
};

// Mirrors UBadge (variant=soft, size=sm) from Nuxt UI's badge theme: a
// component instance per row is measurable table cost and these props
// never vary. Re-check the strings when upgrading Nuxt UI (4.10 now).
const badgeBase = "font-medium inline-flex items-center text-[10px]/3 px-1.5 py-1 gap-1 rounded-sm";
const severityBadgeClass: Record<Severity, string> = {
  ok: `${badgeBase} bg-success/10 text-success`,
  pending: `${badgeBase} bg-info/10 text-info`,
  warn: `${badgeBase} bg-warning/10 text-warning`,
  error: `${badgeBase} bg-error/10 text-error`,
};
const neutralBadgeClass = `${badgeBase} bg-elevated text-default`;

// severityBadge renders a status string as a badge coloured by severity.
export function severityBadge(status: string, severity: Severity): VNode {
  return h("span", { class: severityBadgeClass[severity] ?? neutralBadgeClass }, status);
}

// nameCell renders the resource name with emphasis. Truncates at the
// column edge: under the fixed layout, long names clip rather than
// stretch the column.
export function nameCell(name: string): VNode {
  return h("span", { class: "font-medium text-highlighted block truncate", title: name }, name);
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
export function machineCell(value: string | null | undefined): VNode {
  if (!value) return h("span", { class: "text-dimmed" }, "—");
  return h("span", { class: "font-mono text-xs text-toned block truncate", title: value }, value);
}

// truncated caps a potentially long value at the column edge, with the
// full text on hover. Multi-line rendering (e.g. ingress hosts) is later
// polish.
export function truncated(value: string | null | undefined): VNode {
  if (!value) return h("span", { class: "text-dimmed" }, "—");
  return h("span", { class: "block truncate", title: value }, value);
}
