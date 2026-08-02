import type { TableColumn } from "@nuxt/ui";

import type { ResourceDef, ResourceRow } from "./types";
import { nameCell, ageCell, textOrDash, dimZero } from "./columns";

export interface PDBRow extends ResourceRow {
  namespace: string;
  minAvailable: string;
  maxUnavailable: string;
  allowedDisruptions: number;
  createdAt: number;
}

const columns: TableColumn<PDBRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => nameCell(row.original.name),
  },
  { id: "namespace", accessorKey: "namespace", header: "Namespace" },
  {
    id: "minAvailable",
    accessorKey: "minAvailable",
    header: "Min Available",
    cell: ({ row }) => textOrDash(row.original.minAvailable),
  },
  {
    id: "maxUnavailable",
    accessorKey: "maxUnavailable",
    header: "Max Unavailable",
    cell: ({ row }) => textOrDash(row.original.maxUnavailable),
  },
  {
    id: "allowedDisruptions",
    accessorKey: "allowedDisruptions",
    header: "Allowed Disruptions",
    cell: ({ row }) => dimZero(row.original.allowedDisruptions),
  },
  {
    id: "age",
    accessorKey: "createdAt",
    header: "Age",
    cell: ({ row }) => ageCell(row.original.createdAt),
  },
];

export const pdbsResource: ResourceDef<PDBRow> = {
  key: "poddisruptionbudgets",
  namespaced: true,
  columns,
};
