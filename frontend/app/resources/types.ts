import type { TableColumn } from "@nuxt/ui";

// Every projected row carries these; the backend projector guarantees them.
export interface ResourceRow {
  uid: string;
  name: string;
  namespace?: string;
}

// ResourceDef is the frontend half of a resource definition: the row type
// and its presentation. The backend half (GVR + projector) lives in
// internal/services/resources.
export interface ResourceDef<T extends ResourceRow> {
  key: string;
  namespaced: boolean;
  columns: TableColumn<T>[];
}
