import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, dimZero, w, colw } from "./columns";

export interface ConfigMapRow extends ResourceRow {
  namespace: string;
  data: number;
  createdAt: number;
}

const columns: TableColumn<ConfigMapRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  { id: "namespace", accessorKey: "namespace", header: "Namespace", meta: w(colw.namespace) },
  {
    id: "data",
    meta: w("w-20"),
    accessorKey: "data",
    header: "Data",
    cell: ({ row }) => dimZero(row.original.data),
  },
  {
    id: "age",
    meta: w(colw.age),
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const configMapsResource: ResourceDef<ConfigMapRow> = {
  key: "configmaps",
  title: "ConfigMaps",
  noun: "configmaps",
  namespaced: true,
  columns,
};
