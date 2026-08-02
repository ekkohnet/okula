import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, dimZero } from "./columns";

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
  { id: "namespace", accessorKey: "namespace", header: "Namespace" },
  {
    id: "data",
    accessorKey: "data",
    header: "Data",
    cell: ({ row }) => dimZero(row.original.data),
  },
  {
    id: "age",
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const configMapsResource: ResourceDef<ConfigMapRow> = {
  key: "configmaps",
  namespaced: true,
  columns,
};
