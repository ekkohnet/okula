import { h } from "vue";
import type { TableColumn } from "@nuxt/ui";

import { navigateTo } from "#imports";
import { UButton, UTooltip } from "#components";

import type { ResourceDef, ResourceRow } from "./types";
import type { Severity } from "./columns";
import { nameCell, ageCell, dimZero, textOrDash, severityBadge } from "./columns";

export interface PodRow extends ResourceRow {
  namespace: string;
  ready: string;
  restarts: number;
  status: string;
  statusSeverity: Severity;
  qos: string;
  ip: string;
  node: string;
  createdAt: number;
}

const columns: TableColumn<PodRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  { id: "namespace", accessorKey: "namespace", header: "Namespace" },
  { id: "ready", accessorKey: "ready", header: "Ready" },
  {
    id: "restarts",
    accessorKey: "restarts",
    header: "Restarts",
    cell: ({ row }) => dimZero(row.original.restarts),
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => severityBadge(row.original.status, row.original.statusSeverity),
  },
  { id: "qos", accessorKey: "qos", header: "QoS" },
  {
    id: "ip",
    accessorKey: "ip",
    header: "IP",
    cell: ({ row }) => textOrDash(row.original.ip),
  },
  {
    id: "node",
    accessorKey: "node",
    header: "Node",
    cell: ({ row }) => textOrDash(row.original.node),
  },
  {
    id: "age",
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
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
