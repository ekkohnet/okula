import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, textOrDash, machineCell, w, colw } from "./columns";

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
    meta: w("w-84"),
    accessorKey: "provisioner",
    header: "Provisioner",
    cell: ({ row }) => machineCell(row.original.provisioner),
  },
  { id: "reclaimPolicy", accessorKey: "reclaimPolicy", header: "Reclaim", meta: w("w-36") },
  { id: "bindingMode", accessorKey: "bindingMode", header: "Binding Mode", meta: w("w-48") },
  {
    id: "default",
    meta: w("w-24"),
    accessorKey: "isDefault",
    header: "Default",
    cell: ({ row }) => textOrDash(row.original.isDefault ? "Default" : ""),
  },
  {
    id: "age",
    meta: w(colw.age),
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const storageClassesResource: ResourceDef<StorageClassRow> = {
  key: "storageclasses",
  title: "Storage Classes",
  noun: "storage classes",
  namespaced: false,
  columns,
};
