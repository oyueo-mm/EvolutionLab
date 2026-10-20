// Uniform-grid spatial hash rebuilt with a counting sort.
// Build is O(n) with zero allocations after warm-up; a query visits only the
// cells overlapping the query box. Items are stored as indices into the caller's
// arrays, so the grid never owns entity data.

export class SpatialGrid {
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  /** cellStart[c] .. cellStart[c+1] is the slice of `items` in cell c. */
  cellStart: Int32Array;
  items: Int32Array;
  private cellOf: Int32Array;
  count = 0;

  constructor(width: number, height: number, cellSize: number) {
    this.cellSize = cellSize;
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.cellStart = new Int32Array(this.cols * this.rows + 1);
    this.items = new Int32Array(64);
    this.cellOf = new Int32Array(64);
  }

  cellX(x: number): number {
    const c = Math.floor(x / this.cellSize);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  cellY(y: number): number {
    const c = Math.floor(y / this.cellSize);
    return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c;
  }

  /** Rebuilds from the first `n` entries of `indices`; `xs`/`ys` are indexed by item index. */
  build(xs: ArrayLike<number>, ys: ArrayLike<number>, indices: Int32Array, n: number): void {
    if (this.items.length < n) {
      const cap = Math.max(n, this.items.length * 2);
      this.items = new Int32Array(cap);
      this.cellOf = new Int32Array(cap);
    }
    const start = this.cellStart;
    start.fill(0);
    const cols = this.cols;
    for (let k = 0; k < n; k++) {
      const i = indices[k];
      const c = this.cellY(ys[i]) * cols + this.cellX(xs[i]);
      this.cellOf[k] = c;
      start[c + 1]++;
    }
    for (let c = 1; c < start.length; c++) start[c] += start[c - 1];
    // Fill using a running cursor per cell (stored temporarily past the prefix sum).
    const cursor = this.cursor(start.length);
    cursor.set(start);
    for (let k = 0; k < n; k++) {
      const c = this.cellOf[k];
      this.items[cursor[c]++] = indices[k];
    }
    this.count = n;
  }

  private cursorBuf = new Int32Array(0);
  private cursor(len: number): Int32Array {
    if (this.cursorBuf.length !== len) this.cursorBuf = new Int32Array(len);
    return this.cursorBuf;
  }

  /** Calls fn(index) for every item in cells overlapping the box [x±r, y±r]. Convenience API (tests, UI picking). */
  query(x: number, y: number, r: number, fn: (index: number) => void): void {
    const x0 = this.cellX(x - r), x1 = this.cellX(x + r);
    const y0 = this.cellY(y - r), y1 = this.cellY(y + r);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cy * this.cols + cx;
        for (let k = this.cellStart[c], end = this.cellStart[c + 1]; k < end; k++) fn(this.items[k]);
      }
    }
  }
}
