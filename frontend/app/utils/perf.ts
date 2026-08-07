// Gating for perf trace output: always on in dev, opt-in in production
// builds via localStorage.okulaPerf = "1".
export function perfEnabled(): boolean {
  return import.meta.dev || localStorage.getItem("okulaPerf") === "1";
}
