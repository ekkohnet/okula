import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, textOrDash } from "./columns";

export interface IngressClassRow extends ResourceRow {
  controller: string;
  isDefault: boolean;
  createdAt: number;
}

const columns: TableColumn<IngressClassRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  { id: "controller", accessorKey: "controller", header: "Controller" },
  {
    id: "default",
    accessorKey: "isDefault",
    header: "Default",
    cell: ({ row }) => textOrDash(row.original.isDefault ? "Default" : ""),
  },
  {
    id: "age",
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const ingressClassesResource: ResourceDef<IngressClassRow> = {
  key: "ingressclasses",
  namespaced: false,
  columns,
};
