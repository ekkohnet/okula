import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, truncated, w, colw } from "./columns";

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
  { id: "namespace", accessorKey: "namespace", header: "Namespace", meta: w(colw.namespace) },
  { id: "reference", accessorKey: "reference", header: "Reference", meta: w("w-84") },
  {
    id: "targets",
    meta: w("w-56"),
    accessorKey: "targets",
    header: "Targets",
    cell: ({ row }) => truncated(row.original.targets),
  },
  { id: "minPods", accessorKey: "minPods", header: "Min", meta: w("w-24") },
  { id: "maxPods", accessorKey: "maxPods", header: "Max", meta: w("w-24") },
  { id: "replicas", accessorKey: "replicas", header: "Replicas", meta: w("w-24") },
  {
    id: "age",
    meta: w(colw.age),
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const hpasResource: ResourceDef<HPARow> = {
  key: "horizontalpodautoscalers",
  title: "Horizontal Pod Autoscalers",
  noun: "autoscalers",
  namespaced: true,
  columns,
};
