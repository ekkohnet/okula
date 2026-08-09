// Merged log buffer for the viewer (ui-redesign piece 6d): lines from N
// streams in one array, ordered by per-stream monotonic order keys. A
// pure data structure — the stream manager owns reactivity, publishing
// a fresh {rev, lines} wrapper per flush so the array itself is never
// copied on the hot path (freeze-on-unpin takes the one copy).

// Ring cap per stream — scrollback depth, purely a memory bound (the
// pane virtualizes). The backend's flushRingCap mirrors this; move them
// together.
export const MAX_LOG_LINES = 20000;

// Global budget across all streams. Eviction levels down the largest
// holders, so a chatty stream can never push a quiet one's history
// out — it only cannibalizes itself.
export const MAX_TOTAL_LINES = 100000;

export interface BufferLine {
  // Monotonic across all streams of one viewer, stamped on arrival —
  // stable render keys.
  id: number;
  // Stream key (namespace/pod/container): prefix, color, visibility.
  stream: string;
  // Display timestamp (Unix ms); 0 renders no timestamp.
  t: number;
  // Order key: max(t, stream's previous key) — cross-stream order by
  // clock, within-stream order strictly by arrival.
  ot: number;
  text: string;
  // Marker entries are viewer-inserted dividers rather than log output;
  // they live in the buffer so they keep their position in the flow.
  marker?: "restart" | "gap";
  exitCode?: number;
  // Gap markers: cumulative lines lost for the stream (ring evictions
  // plus transport-cap drops), mutated in place as the count grows.
  evicted?: number;
  // Viewer-owned caches: lazily lowered text plus query-stamped
  // filter/find verdicts. A query change invalidates by string
  // identity, so per-flush rescans cost one comparison per line and
  // string work happens once per line per query.
  lower?: string;
  filterQ?: string;
  filterHit?: boolean;
  findQ?: string;
  findHits?: number;
}

// Published view: a fresh wrapper per flush triggers dependents while
// `lines` stays the same mutated-in-place array. Consumers must track
// the wrapper — a pass-through computed returning the array would
// starve Vue's value-unchanged propagation.
export interface BufferView {
  rev: number;
  lines: readonly BufferLine[];
}

export class LogBuffer {
  readonly lines: BufferLine[] = [];
  // Non-marker lines per stream; markers are chrome and never counted.
  private counts = new Map<string, number>();
  // One gap marker per stream that has lost lines, mutated in place.
  private gaps = new Map<string, { total: number; line: BufferLine }>();
  // Gap markers get negative ids — they can't collide with the
  // manager's positive line ids.
  private gapSeq = 0;

  constructor(
    private perStreamCap = MAX_LOG_LINES,
    private totalCap = MAX_TOTAL_LINES,
  ) {}

  // Merges an arrival batch (pre-sorted by ot, stable) and applies the
  // per-stream cap. Batches overwhelmingly land at the tail; otherwise
  // the displaced tail merges with the batch, existing lines winning
  // ties so within-stream arrival order can never invert.
  insert(batch: BufferLine[]) {
    if (!batch.length) return;

    const lines = this.lines;
    const first = batch[0]!;
    if (!lines.length || lines[lines.length - 1]!.ot <= first.ot) {
      for (const line of batch) lines.push(line);
    } else {
      let lo = 0;
      let hi = lines.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (lines[mid]!.ot <= first.ot) lo = mid + 1;
        else hi = mid;
      }
      const tail = lines.splice(lo);
      let ti = 0;
      let bi = 0;
      while (ti < tail.length || bi < batch.length) {
        if (bi >= batch.length || (ti < tail.length && tail[ti]!.ot <= batch[bi]!.ot)) {
          lines.push(tail[ti++]!);
        } else {
          lines.push(batch[bi++]!);
        }
      }
    }

    for (const line of batch) {
      if (!line.marker) this.counts.set(line.stream, (this.counts.get(line.stream) ?? 0) + 1);
    }
    this.evict();
  }

  clear() {
    this.lines.length = 0;
    this.counts.clear();
    this.gaps.clear();
  }

  // Folds transport-cap drops (LogChunk.dropped) into the stream's gap
  // total — one honest mechanism for both kinds of loss.
  recordDropped(stream: string, count: number) {
    if (count > 0) this.ensureGap(stream, count);
  }

  private evict() {
    const excess = new Map<string, number>();
    let total = 0;
    for (const [key, n] of this.counts) {
      total += n;
      if (n > this.perStreamCap) excess.set(key, n - this.perStreamCap);
    }
    for (const e of excess.values()) total -= e;

    // Global budget on top of the per-stream caps: level the largest
    // holders down until the total fits (approximate waterfill — when
    // the top holders tie, the overshoot spreads across them).
    let over = total - this.totalCap;
    if (over > 0) {
      const eff: [string, number][] = [...this.counts.entries()].map(([k, n]) => [
        k,
        n - (excess.get(k) ?? 0),
      ]);
      while (over > 0) {
        let maxI = 0;
        for (let i = 1; i < eff.length; i++) if (eff[i]![1] > eff[maxI]![1]) maxI = i;
        let second = 0;
        for (let i = 0; i < eff.length; i++)
          if (i !== maxI && eff[i]![1] > second) second = eff[i]![1];
        const diff = eff[maxI]![1] - second;
        const take = Math.min(over, diff > 0 ? diff : Math.max(1, Math.ceil(over / eff.length)));
        eff[maxI]![1] -= take;
        excess.set(eff[maxI]![0], (excess.get(eff[maxI]![0]) ?? 0) + take);
        over -= take;
      }
    }

    if (!excess.size) return;
    const evicted = this.compact(excess);
    for (const [stream, n] of evicted) this.ensureGap(stream, n);
  }

  // Drops each over-budget stream's oldest lines. Oldest lines cluster
  // at the head, so one in-place compaction pass does it without
  // allocating. Restart dividers inside an evicted region drop with
  // it — a divider with no surrounding context is noise, and the gap
  // marker summarizes the region. Gap markers always survive.
  private compact(excess: Map<string, number>): Map<string, number> {
    const lines = this.lines;
    const evicted = new Map<string, number>();
    let w = 0;
    for (let r = 0; r < lines.length; r++) {
      const line = lines[r]!;
      const e = excess.get(line.stream) ?? 0;
      if (e > 0 && line.marker === "restart") {
        continue;
      }
      if (e > 0 && !line.marker) {
        excess.set(line.stream, e - 1);
        this.counts.set(line.stream, this.counts.get(line.stream)! - 1);
        evicted.set(line.stream, (evicted.get(line.stream) ?? 0) + 1);
        continue;
      }
      if (w !== r) lines[w] = line;
      w++;
    }
    lines.length = w;
    return evicted;
  }

  // The gap marker is one buffer line per stream, created at the
  // stream's retention boundary and mutated in place as the count
  // grows (stable id, so the rendered row never churns). Its position
  // drifts toward the head as neighbours evict — acceptable: the gap
  // genuinely lives at the start of the stream's retained history.
  private ensureGap(stream: string, add: number) {
    const g = this.gaps.get(stream);
    if (g) {
      g.total += add;
      g.line.evicted = g.total;
      return;
    }
    const line: BufferLine = {
      id: --this.gapSeq,
      stream,
      t: 0,
      ot: 0,
      text: "",
      marker: "gap",
      evicted: add,
    };
    let idx = this.lines.findIndex((l) => l.stream === stream && !l.marker);
    if (idx < 0) idx = 0;
    line.ot = this.lines[idx]?.ot ?? 0;
    this.lines.splice(idx, 0, line);
    this.gaps.set(stream, { total: add, line });
  }
}
