// Merged log buffer for the viewer (ui-redesign piece 6d): lines from N
// streams in one array, ordered by per-stream monotonic order keys. A
// pure data structure — the stream manager owns reactivity, publishing
// a fresh {rev, lines} wrapper per flush so the array itself is never
// copied on the hot path (freeze-on-unpin takes the one copy).

// Ring cap per stream — scrollback depth, purely a memory bound (the
// pane virtualizes). The backend's flushRingCap mirrors this; move them
// together. A global budget (evict-from-largest) joins in piece d4.
export const MAX_LOG_LINES = 20000;

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
  marker?: "restart";
  exitCode?: number;
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
  private counts = new Map<string, number>();

  constructor(private perStreamCap = MAX_LOG_LINES) {}

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
      this.counts.set(line.stream, (this.counts.get(line.stream) ?? 0) + 1);
    }
    this.evict();
  }

  clear() {
    this.lines.length = 0;
    this.counts.clear();
  }

  // Drops each over-cap stream's oldest lines. Oldest lines cluster at
  // the head, so one in-place compaction pass does it without
  // allocating.
  private evict() {
    let excess: Map<string, number> | null = null;
    for (const [key, n] of this.counts) {
      if (n > this.perStreamCap) {
        (excess ??= new Map()).set(key, n - this.perStreamCap);
      }
    }
    if (!excess) return;

    const lines = this.lines;
    let w = 0;
    for (let r = 0; r < lines.length; r++) {
      const line = lines[r]!;
      const e = excess.get(line.stream);
      if (e) {
        excess.set(line.stream, e - 1);
        this.counts.set(line.stream, this.counts.get(line.stream)! - 1);
        continue;
      }
      if (w !== r) lines[w] = line;
      w++;
    }
    lines.length = w;
  }
}
