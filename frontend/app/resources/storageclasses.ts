import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, textOrDash, truncated } from "./columns";

export interface StorageClassRow extends ResourceRow {
  provisioner: string;
  reclaimPolicy: string;
  bindingMode: string;
  isDefault: boolean;
  createdAt: number;
}

const columns: TableColumn<StorageClassRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  {
    id: "provisioner",
    accessorKey: "provisioner",
    header: "Provisioner",
    cell: ({ row }) => truncated(row.original.provisioner, "max-w-72"),
  },
  { id: "reclaimPolicy", accessorKey: "reclaimPolicy", header: "Reclaim" },
  { id: "bindingMode", accessorKey: "bindingMode", header: "Binding Mode" },
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

export const storageClassesResource: ResourceDef<StorageClassRow> = {
  key: "storageclasses",
  namespaced: false,
  columns,
};
