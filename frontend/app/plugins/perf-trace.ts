// Navigation timing trace (perf pass): logs the resolve and render+paint
// segments of every route change, so feel regressions get numbers instead
// of guesses. The render+paint segment is where synchronous mount cost
// lands (the main thread is blocked, so the post-paint frame callback is
// delayed with it — the number captures the jank).
//
// Output goes to console.debug in dev; enable in a production build with
// localStorage.okulaPerf = "1". Measures also land on the Performance
// timeline (devtools) for profiling correlation.
export default defineNuxtPlugin(() => {
  const enabled = () => import.meta.dev || localStorage.getItem("okulaPerf") === "1";

  const router = useRouter();
  let navStart = 0;
  let from = "";
  let to = "";

  router.beforeEach((toRoute, fromRoute) => {
    navStart = performance.now();
    from = fromRoute.path;
    to = toRoute.path;
  });

  router.afterEach(() => {
    if (!navStart) return;
    const start = navStart;
    navStart = 0;
    const resolved = performance.now();

    // Double rAF: the second callback runs after the frame containing the
    // new route's render has been committed.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const painted = performance.now();
        performance.measure(`nav ${from} → ${to}`, { start, end: painted });
        if (!enabled()) return;
        console.debug(
          `[perf] nav ${from} → ${to}: resolve ${(resolved - start).toFixed(0)}ms, ` +
            `render+paint ${(painted - resolved).toFixed(0)}ms`,
        );
      });
    });
  });
});
