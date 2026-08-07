import { h } from "vue";
import type { TableColumn } from "@nuxt/ui";

import { TimeDuration } from "#components";

import type { ResourceDef, ResourceRow } from "./types";
import type { Severity } from "./columns";
import { nameCell, ageCell, severityBadge, w, colw } from "./columns";

export interface JobRow extends ResourceRow {
  namespace: string;
  status: string;
  statusSeverity: Severity;
  completions: string;
  startedAt: number;
  completedAt: number;
  createdAt: number;
}

const columns: TableColumn<JobRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  { id: "namespace", accessorKey: "namespace", header: "Namespace", meta: w(colw.namespace) },
  {
    id: "status",
    meta: w(colw.status),
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => severityBadge(row.original.status, row.original.statusSeverity),
  },
  { id: "completions", accessorKey: "completions", header: "Completions", meta: w("w-32") },
  {
    id: "duration",
    meta: w("w-24"),
    accessorKey: "startedAt",
    header: "Duration",
    cell: ({ row }) =>
      h(TimeDuration, {
        from: row.original.startedAt,
        to: row.original.completedAt || undefined,
      }),
  },
  {
    id: "age",
    meta: w(colw.age),
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const jobsResource: ResourceDef<JobRow> = {
  key: "jobs",
  title: "Jobs",
  noun: "jobs",
  namespaced: true,
  columns,
};
