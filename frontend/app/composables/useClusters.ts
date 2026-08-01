import { GetClusters, ConnectCluster, DisconnectCluster } from "#services/cluster/service";
import type { ClusterInstance } from "#services/cluster/models";

import { Events } from "@wailsio/runtime";

export function useClusters() {
  const clusters = useState<ClusterInstance[]>("clusters:entries", () => []);
  const isLoading = useState("clusters:loading", () => false);
  const error = useState<string | null>("clusters:error", () => null);

  const isLive = useState("clusters:live", () => false);
  const requestId = useState("clusters:requestId", () => 0);

  let inflight: ReturnType<typeof GetClusters> | null = null;

  async function load() {
    const id = ++requestId.value;
    inflight?.cancel?.();

    isLoading.value = true;
    error.value = null;

    try {
      const request = GetClusters();
      inflight = request;
      const result = await request;
      if (id !== requestId.value) return;
      clusters.value = result ?? [];
    } catch (err: unknown) {
      if (id !== requestId.value) return;
      error.value = toErrorString(err);
    } finally {
      if (id === requestId.value) isLoading.value = false;
      inflight = null;
    }
  }

  function startLive() {
    if (isLive.value) return;
    Events.Off("ClustersUpdated");
    Events.On("ClustersUpdated", () => load());
    isLive.value = true;
  }

  function stopLive() {
    Events.Off("ClustersUpdated");
    isLive.value = false;
  }

  const activeCluster = computed(() => clusters.value.find((c) => c.active) ?? null);

  // Connect/disconnect results arrive via ClustersUpdated events; these only
  // surface immediate (config) errors to the caller.
  async function connect(id: string) {
    await ConnectCluster(id);
  }

  async function disconnect() {
    await DisconnectCluster();
  }

  // Toast-surfacing wrappers for UI callers; the raw versions throw.
  const toast = useToast();

  async function connectNotify(id: string) {
    try {
      await connect(id);
    } catch (err) {
      toast.add({
        title: "Failed to connect",
        description: toErrorString(err),
        color: "error",
      });
    }
  }

  async function disconnectNotify() {
    try {
      await disconnect();
    } catch (err) {
      toast.add({
        title: "Failed to disconnect",
        description: toErrorString(err),
        color: "error",
      });
    }
  }

  return {
    clusters,
    activeCluster,
    isLoading,
    error,
    load,
    startLive,
    stopLive,
    connect,
    disconnect,
    connectNotify,
    disconnectNotify,
  };
}
