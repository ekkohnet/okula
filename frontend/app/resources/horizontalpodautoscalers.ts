import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, truncated } from "./columns";

export interface HPARow extends ResourceRow {
  namespace: string;
  reference: string;
  targets: string;
  minPods: number;
  maxPods: number;
  replicas: number;
  createdAt: number;
}

const columns: TableColumn<HPARow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  { id: "namespace", accessorKey: "namespace", header: "Namespace" },
  { id: "reference", accessorKey: "reference", header: "Reference" },
  {
    id: "targets",
    accessorKey: "targets",
    header: "Targets",
    cell: ({ row }) => truncated(row.original.targets, "max-w-72"),
  },
  { id: "minPods", accessorKey: "minPods", header: "Min" },
  { id: "maxPods", accessorKey: "maxPods", header: "Max" },
  { id: "replicas", accessorKey: "replicas", header: "Replicas" },
  {
    id: "age",
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const hpasResource: ResourceDef<HPARow> = {
  key: "horizontalpodautoscalers",
  namespaced: true,
  columns,
};
