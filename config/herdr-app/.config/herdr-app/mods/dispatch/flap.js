// Split-flap cells, as on a station's departure board. Each cell remembers the character it settled on; given a new one
// it turns through its drum to get there (the flaps run natively with `.frames`, a half-height flap falls over the top
// half with `.loop`), then settles. Cells settle at different moments, so a changed row ripples into place.
// The only timer is the wake-up that settles cells, and it runs only while something is turning.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { INK } from "./state.js";

// The drum's order: a cell turns forward through it from what it shows to what it should.
const DRUM = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.:/+·";
const STEP = 55; // ms per flap
const MAX_FLAPS = 14;
const TICK = 110; // settling is batched on this grid, so a whole board settles in a handful of renders

// Two columns wide: CJK and full-width forms (Cubic 11 draws them square).
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;

/** A string as board glyphs: ASCII letters in capitals, each glyph 1 or 2 columns wide, padded or cut to `cols`. */
export function glyphs(text, cols) {
  const out = [];
  let used = 0;
  for (const ch of Array.from(String(text ?? "").toUpperCase())) {
    const w = WIDE.test(ch) ? 2 : 1;
    if (used + w > cols) break;
    out.push({ ch, w });
    used += w;
  }
  while (used < cols) out.push({ ch: " ", w: 1 }), used++;
  return out;
}

// The flaps between two characters: forward through the drum, or a short shuffle for one that isn't on it.
function run(from, to) {
  const a = DRUM.indexOf(from), b = DRUM.indexOf(to);
  if (a < 0 || b < 0) {
    const n = 4 + Math.floor(Math.random() * 4);
    return [...Array.from({ length: n }, () => DRUM[1 + Math.floor(Math.random() * (DRUM.length - 1))]), to];
  }
  const steps = (b - a + DRUM.length) % DRUM.length;
  const seq = [];
  // a long way round skips ahead, so no cell turns for more than MAX_FLAPS flaps
  const skip = Math.max(1, Math.ceil(steps / MAX_FLAPS));
  for (let i = skip; i < steps; i += skip) seq.push(DRUM[(a + i) % DRUM.length]);
  seq.push(to);
  return seq;
}

export class Flaps {
  constructor() {
    this.cells = new Map();
    this.wake = 0;
  }

  /** The cell under `key`, turning to `ch` if it isn't there yet. `lag`: ms before it settles beyond its own flaps. */
  cell(key, ch, now, lag = 0) {
    let c = this.cells.get(key);
    if (!c) this.cells.set(key, (c = { ch: " ", seq: null, until: 0 })); // new cells start blank, so they flip in
    if (c.ch !== ch) {
      c.seq = run(c.ch, ch);
      c.until = Math.ceil((now + lag + c.seq.length * STEP) / TICK) * TICK;
      c.ch = ch;
    }
    if (c.seq && c.until <= now) c.seq = null;
    return c;
  }

  /** Forget cells that weren't drawn this render (a row that went away), then wake when the next cell settles. */
  settle(cx, now, drawn) {
    let next = Infinity;
    for (const [key, c] of this.cells) {
      if (!drawn.has(key)) this.cells.delete(key);
      else if (c.seq && c.until < next) next = c.until;
    }
    if (next === Infinity || (this.wake > now && this.wake <= next)) return;
    this.wake = next;
    cx.timer.after(Math.max(16, next - now), (cx) => {
      this.wake = 0;
      cx.notify();
    });
  }
}

/** One flap tile: dark upper and lower leaves split by a seam, the glyph across both, a falling leaf while it turns. */
export function tile(c, { w, h, size, color, bg = INK.flap, bgLo = INK.flapLo }) {
  const turning = Boolean(c.seq);
  const half = Math.floor(h / 2);
  const glyph = h_flex().absolute().top(0).left(0).w(w).h(h).items_center().justify_center()
    .text_size(size).line_height(`${h}px`).text_color(color);
  return div().relative().w(w).h(h).flex_none().rounded(2).overflow_hidden().bg(bg)
    .child(div().absolute().left(0).top(half).w(w).h(h - half).bg(bgLo))
    .child(turning ? glyph.frames(c.seq, STEP) : glyph.child(c.ch))
    .when(turning, (el) => el.child(div().absolute().left(0).top(0).w(w).bg(bg).border_b(1).border_color(INK.seam)
      .loop("height", { from: half, to: 0, period: STEP * 2, easing: "ease-in" })))
    .child(div().absolute().left(0).top(half).w(w).h(1).bg(INK.seam));
}

/** A run of tiles for `text`, `cols` columns wide, keys under `key`. Later columns settle a little later. */
export function flapText(flaps, key, text, cols, now, drawn, look, lag = 0) {
  let col = 0;
  return h_flex().flex_none().gap(look.gap).children(glyphs(text, cols).map((g) => {
    const k = `${key}:${col}`;
    drawn.add(k);
    const c = flaps.cell(k, g.ch, now, lag + col * 22 + Math.random() * 90);
    col += g.w;
    return tile(c, { ...look, w: look.w * g.w + look.gap * (g.w - 1) });
  }));
}
