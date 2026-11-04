// A panel list walked by keyboard. While it's being walked the list shows only the rows that fit, moving to keep the
// cursor in view: a scrollbar list can't be scrolled from a script.
export const ROW = 26;

export class Cursor {
  constructor() {
    this.at = 0;
    this.top = 0;
    this.height = 0;
  }

  move(by, count) {
    this.at = Math.max(0, Math.min(count - 1, this.at + by));
  }

  /** The rows that fit, from the first that keeps the cursor in view. Render this instead of the whole list. */
  window(rows) {
    const fit = Math.max(1, Math.floor(this.height / ROW) || 20);
    this.at = Math.max(0, Math.min(rows.length - 1, this.at));
    if (this.at < this.top) this.top = this.at;
    if (this.at >= this.top + fit) this.top = this.at - fit + 1;
    this.top = Math.max(0, Math.min(this.top, rows.length - fit));
    return rows.slice(this.top, this.top + fit);
  }
}
