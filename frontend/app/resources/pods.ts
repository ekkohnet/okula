import { h } from "vue";
import type { TableColumn, BadgeProps } from "@nuxt/ui";

import { navigateTo } from "#imports";
import { UBadge, UButton, UTooltip, TimeAgo } from "#components";

import type { ResourceDef, ResourceRow } from "./types";

export interface PodRow extends ResourceRow {
  namespace: string;
  ready: string;
  restarts: number;
  status: string;
  statusSeverity: "ok" | "pending" | "warn" | "error";
  qos: string;
  ip: string;
  node: string;
  createdAt: number;
}

const severityColor: Record<PodRow["statusSeverity"], BadgeProps["color"]> = {
  ok: "success",
  pending: "info",
  warn: "warning",
  error: "error",
};

const columns: TableColumn<PodRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => h("span", { class: "font-medium text-highlighted" }, row.original.name),
  },
  {
    id: "namespace",
    accessorKey: "namespace",
    header: "Namespace",
  },
  {
    id: "ready",
    accessorKey: "ready",
    header: "Ready",
  },
  {
    id: "restarts",
    accessorKey: "restarts",
    header: "Restarts",
    cell: ({ row }) => {
      const restarts = row.original.restarts;
      return restarts === 0 ? h("span", { class: "text-dimmed" }, "0") : String(restarts);
    },
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) =>
      h(
        UBadge,
        {
          color: severityColor[row.original.statusSeverity] ?? "neutral",
          variant: "subtle",
          size: "md",
        },
        () => row.original.status,
      ),
  },
  {
    id: "qos",
    accessorKey: "qos",
    header: "QoS",
  },
  {
    id: "ip",
    accessorKey: "ip",
    header: "IP",
    cell: ({ row }) => row.original.ip || h("span", { class: "text-dimmed" }, "—"),
  },
  {
    id: "node",
    accessorKey: "node",
    header: "Node",
    cell: ({ row }) => row.original.node || h("span", { class: "text-dimmed" }, "—"),
  },
  {
    id: "age",
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => h(TimeAgo, { timestamp: row.original.createdAt }),
  },
  {
    id: "actions",
    enableHiding: false,
    enableSorting: false,
    cell: ({ row }) =>
      h(UTooltip, { text: "Logs", content: { side: "left" } }, () =>
        h(UButton, {
          icon: "i-lucide-scroll-text",
          color: "neutral",
          variant: "ghost",
          class: "ml-auto",
          "aria-label": "View logs",
          onClick: () =>
            navigateTo(`/resources/pods/${row.original.namespace}/${row.original.name}/logs`),
        }),
      ),
  },
];

export const podsResource: ResourceDef<PodRow> = {
  key: "pods",
  namespaced: true,
  columns,
};
