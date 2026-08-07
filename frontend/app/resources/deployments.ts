import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, w, colw } from "./columns";

export interface DeploymentRow extends ResourceRow {
  namespace: string;
  ready: string;
  upToDate: number;
  available: number;
  createdAt: number;
}

const columns: TableColumn<DeploymentRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  { id: "namespace", accessorKey: "namespace", header: "Namespace", meta: w(colw.namespace) },
  { id: "ready", accessorKey: "ready", header: "Ready", meta: w(colw.ready) },
  { id: "upToDate", accessorKey: "upToDate", header: "Up-to-date", meta: w("w-28") },
  { id: "available", accessorKey: "available", header: "Available", meta: w("w-28") },
  {
    id: "age",
    meta: w(colw.age),
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const deploymentsResource: ResourceDef<DeploymentRow> = {
  key: "deployments",
  title: "Deployments",
  noun: "deployments",
  namespaced: true,
  columns,
};
