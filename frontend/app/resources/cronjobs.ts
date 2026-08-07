import { h } from "vue";
import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, dimZero, severityBadge, w, colw } from "./columns";

export interface CronJobRow extends ResourceRow {
  namespace: string;
  schedule: string;
  suspend: boolean;
  active: number;
  lastScheduleAt: number;
  createdAt: number;
}

const columns: TableColumn<CronJobRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  { id: "namespace", accessorKey: "namespace", header: "Namespace", meta: w(colw.namespace) },
  { id: "schedule", accessorKey: "schedule", header: "Schedule", meta: w("w-32") },
  {
    id: "suspend",
    meta: w("w-24"),
    accessorKey: "suspend",
    header: "Suspend",
    cell: ({ row }) =>
      row.original.suspend
        ? severityBadge("Suspended", "warn")
        : h("span", { class: "text-dimmed" }, "No"),
  },
  {
    id: "active",
    meta: w("w-20"),
    accessorKey: "active",
    header: "Active",
    cell: ({ row }) => dimZero(row.original.active),
  },
  {
    id: "lastSchedule",
    meta: w("w-36"),
    accessorKey: "lastScheduleAt",
    header: "Last Schedule",
    cell: ({ row }) => ageCell(row.original.lastScheduleAt),
  },
  {
    id: "age",
    meta: w(colw.age),
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const cronJobsResource: ResourceDef<CronJobRow> = {
  key: "cronjobs",
  title: "CronJobs",
  noun: "cronjobs",
  namespaced: true,
  columns,
};
