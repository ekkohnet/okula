import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell } from "./columns";

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
  { id: "namespace", accessorKey: "namespace", header: "Namespace" },
  { id: "ready", accessorKey: "ready", header: "Ready" },
  { id: "upToDate", accessorKey: "upToDate", header: "Up-to-date" },
  { id: "available", accessorKey: "available", header: "Available" },
  {
    id: "age",
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
