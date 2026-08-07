import { h } from "vue";
import type { TableColumn } from "@nuxt/ui";

import { navigateTo } from "#imports";
import { UIcon, PodDetail } from "#components";

import type { ResourceDef, ResourceRow } from "./types";
import type { Severity } from "./columns";
import { nameCell, ageCell, dimZero, severityBadge, machineCell, w, colw } from "./columns";

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
  { id: "namespace", accessorKey: "namespace", header: "Namespace", meta: w(colw.namespace) },
  { id: "ready", accessorKey: "ready", header: "Ready", meta: w(colw.ready) },
  {
    id: "restarts",
    meta: w(colw.restarts),
    accessorKey: "restarts",
    header: "Restarts",
    cell: ({ row }) => dimZero(row.original.restarts),
  },
  {
    id: "status",
    meta: w(colw.status),
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => severityBadge(row.original.status, row.original.statusSeverity),
  },
  { id: "qos", accessorKey: "qos", header: "QoS", meta: w(colw.qos) },
  {
    id: "ip",
    meta: w(colw.ip),
    accessorKey: "ip",
    header: "IP",
    cell: ({ row }) => machineCell(row.original.ip),
  },
  {
    id: "node",
    meta: w(colw.node),
    accessorKey: "node",
    header: "Node",
    cell: ({ row }) => machineCell(row.original.node),
  },
  {
    id: "age",
    meta: w(colw.age),
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
  {
    id: "actions",
    meta: w(colw.actions),
    enableHiding: false,
    enableSorting: false,
    cell: ({ row }) =>
      // Plain button mirroring UButton ghost/neutral hover styling — a
      // component instance per row is measurable table cost and these
      // props never vary. Native title, not UTooltip, for the same
      // reason. Re-check styling on Nuxt UI upgrades (4.10 now).
      // Revealed by row hover; the tr carries the group class.
      h(
        "button",
        {
          type: "button",
          class:
            "ml-auto flex size-5 items-center justify-center rounded-md cursor-pointer " +
            "text-default hover:bg-elevated active:bg-elevated " +
            "opacity-0 group-hover:opacity-100 transition-opacity",
          "aria-label": "View logs",
          title: "Logs",
          onClick: (e: MouseEvent) => {
            // Keep the action from also triggering the row's detail click.
            e.stopPropagation();
            navigateTo(`/resources/pods/${row.original.namespace}/${row.original.name}/logs`);
          },
        },
        h(UIcon, { name: "i-lucide-scroll-text", class: "size-5 shrink-0" }),
      ),
  },
];

export const podsResource: ResourceDef<PodRow> = {
  key: "pods",
  title: "Pods",
  noun: "pods",
  namespaced: true,
  columns,
  detail: PodDetail,
};
