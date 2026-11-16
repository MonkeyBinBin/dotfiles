// A pane's header, a carriage's side: its nameplate is a small Solari split-flap board (the train's code and
// destination, or the shell and its folder) that turns over whenever what it says changes; on the right what the
// train is doing and its cab gauges; on hover, buttons to split, zoom and close.
//   done     the board turns over between "C01 ARRIVED" (yellow) and the destination every few seconds, its lamp
//            blinks yellow, and a row of chevron lamps beside it sweeps to and fro like a platform's arrival indicator
//   blocked  the same in red: "C01 SIGNAL STOP" on red flaps, the header pulsing red, the reason it stopped on the right
// Gauges, from what Claude Code reports (helm-bridge): water = context used, coal = rate limit used, both as level bars
// (amber from 70, red from 90); the wrench's three lamps light red for failed calls in a row.
// Props from the app: { pane, terminal }.
import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, run } from "herdr";
import { ICON, INK, STATUS_INK, gaugesOf, stopIcon, stopReason, trains, workIcon } from "../state.js";
import { Flaps, flapText } from "../flap.js";

const WARN_AT = 70, CRITICAL_AT = 90;
// the arrival board's flaps, and how long each page shows before it turns over
const FLAP = { w: 15, h: 26, size: 22, gap: 2, color: INK.cream };
const PAGE_MS = 4000;
const levelInk = (v) => (v >= CRITICAL_AT ? INK.red : v >= WARN_AT ? INK.amber : INK.green);

function bar(icon, value) {
  const lit = Math.round(value / 10);
  return h_flex().flex_none().gap(5).items_center()
    .child(svg(`${ICON}/${icon}.svg`).size(16).text_color(value >= WARN_AT ? levelInk(value) : INK.creamDim))
    .child(h_flex().gap(1).p(2).rounded(2).bg(INK.seam).children(Array.from({ length: 10 }, (_, i) =>
      div().w(3).h(9).bg(i < lit ? levelInk(value) : INK.flapLo))));
}

function faults(n) {
  return h_flex().flex_none().gap(5).items_center()
    .child(svg(`${ICON}/wrench.svg`).size(16).text_color(n > 0 ? INK.red : INK.creamDim))
    .child(h_flex().gap(3).children([0, 1, 2].map((i) => div().size(6).rounded_full().bg(i < n ? INK.red : INK.flapLo))));
}

// A row of chevron lamps lit one after another, sweeping to and fro, like a platform's arrival indicator. Native: each
// lamp's light sits behind two opacity gates driven far past 0..1 by one shared wave, so only its band of the sweep shows
// (the same trick as kit/sprite.js). Dim chevrons underneath show the unlit lamps.
const CHEVRONS = 6, SWEEP_MS = 1400, SHARP = 40;
function chevrons(color) {
  const S = CHEVRONS * SHARP, wave = (from, to) => ({ from, to, period: SWEEP_MS, easing: "linear" });
  const glyph = (c) => div().w(10).flex_none().text_size(22).text_color(c).child(">");
  return h_flex().flex_none().children(Array.from({ length: CHEVRONS }, (_, i) => {
    const open = i / CHEVRONS, close = (i + 1) / CHEVRONS;
    let lit = glyph(color);
    if (i < CHEVRONS - 1) lit = div().loop("opacity", wave(S * close + 1, S * (close - 1) + 1)).child(lit);
    if (i > 0) lit = div().loop("opacity", wave(1 - S * open, S * (1 - open) + 1)).child(lit);
    return div().relative().w(10).flex_none()
      .child(glyph(INK.flapLo))
      .child(div().absolute().top(0).left(0).child(lit));
  }));
}

export class PaneHeader {
  constructor() {
    this.hovered = false;
    this.width = 800;
    this.status = null;
    this.flaps = new Flaps();
    this.page = 0;
    this.paging = 0; // a token: each done or blocked spell turns its own pages
  }

  // While done or blocked, the board turns over to its other page every PAGE_MS.
  turnPages(cx) {
    const token = ++this.paging;
    this.page = 0;
    const turn = (cx) => {
      if (this.paging !== token) return;
      this.page = 1 - this.page;
      cx.notify();
      cx.timer.after(PAGE_MS, turn);
    };
    cx.timer.after(PAGE_MS, turn);
  }

  // The nameplate board: a lamp, then a run of flaps showing the page for the status.
  board(cx, { st, t, name, on }) {
    const now = Date.now(), drawn = new Set();
    const cols = Math.max(12, Math.min(34, Math.floor((this.width * 0.5) / (FLAP.w + FLAP.gap))));
    const alert = t && (st === "done" || st === "blocked");
    const first = alert && this.page === 0;
    const text = !alert ? name : first ? `${t.code} ${st === "done" ? "ARRIVED" : "SIGNAL STOP"}` : t.dest;
    const look = !first ? FLAP : st === "done" ? { ...FLAP, color: INK.yellow } : { ...FLAP, color: INK.red, bg: INK.stopFlap, bgLo: INK.stopFlapLo };
    const lamp = div().size(9).flex_none().rounded_full().bg(st ? STATUS_INK[st] : INK.steelDim)
      .when(Boolean(alert), (el) => el.loop("opacity", { from: 0.15, to: 1, period: 800 }));
    const view = h_flex().flex_none().h(34).px(6).gap(8).items_center().rounded(4).bg(INK.seam)
      .child(lamp)
      .child(flapText(this.flaps, "plate", text, cols, now, drawn, look));
    this.flaps.settle(cx, now, drawn);
    return view;
  }

  button(id, icon, command, args) {
    return div().id(id).p(4).text_color(INK.creamDim).hover((s) => s.text_color(INK.cream))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`${ICON}/${icon}.svg`).size(14));
  }

  render(cx, p) {
    const me = panes().find((x) => x.pane === p.pane);
    if (!me) return div();
    const pane = me.pane, on = me.focused, st = me.status;
    const t = trains().find((x) => x.agent.pane === pane);
    const folder = me.cwd ? me.cwd.split("/").filter(Boolean).pop() ?? "/" : "";
    const name = t ? `${t.code} · ${t.dest}` : `${me.program?.name ?? "shell"}${folder ? ` · ${folder}` : ""}`;
    const stopped = st === "blocked";
    const reason = stopped && t ? stopReason(t.agent) : "";
    const work = t && st === "working" ? workIcon(t.agent) : "";
    const g = t ? gaugesOf(t.agent) : null;
    const showGauges = g && (g.water > 0 || g.coal > 0 || g.faults > 0);
    // the board turns its pages while the agent is done or blocked
    if (st !== this.status) {
      if (st === "done" || st === "blocked") this.turnPages(cx);
      else this.paging++;
      this.status = st;
    }
    const alert = Boolean(t) && (st === "done" || st === "blocked");
    return h_flex().id(`ph-${pane}`).relative().overflow_hidden().size_full().px(14).gap(12).items_center()
      .bg(INK.board).border_b(1).border_color(stopped ? INK.redDeep : INK.steelDim)
      .when(stopped, (el) => el.child(div().absolute().top(0).left(0).size_full().bg(INK.redDeep).loop("opacity", { from: 0, to: 0.8, period: 1100 })))
      .on_size_change((size, cx) => {
        if (size.width === this.width) return;
        this.width = size.width;
        cx.notify();
      })
      .on_hover((hovered, cx) => {
        this.hovered = hovered;
        cx.notify();
      })
      .on_click(() => run("pane.focus", { pane }))
      .child(this.board(cx, { st, t, name, on }))
      .when(alert, (el) => el.child(chevrons(st === "done" ? INK.yellow : INK.red)))
      .child(div().flex_1())
      .when(!this.hovered && Boolean(reason), (el) => el
        .child(svg(`${ICON}/${stopIcon(reason)}.svg`).size(18).flex_none().text_color(INK.red))
        .child(div().flex_shrink(1).min_w(0).truncate().text_size(13).text_color(INK.red).child(reason)))
      .when(!this.hovered && Boolean(work), (el) => el.child(svg(`${ICON}/${work}.svg`).size(18).flex_none().text_color(INK.amber)
        .loop("opacity", { from: 0.5, to: 1, period: 1400 })))
      .when(!this.hovered && Boolean(showGauges), (el) => el.child(bar("water", g.water)).child(bar("coal", g.coal)).child(faults(Math.min(3, g.faults))))
      .when(this.hovered, (el) => el
        .child(this.button(`pb-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(`pb-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(`pb-z-${pane}`, me.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(`pb-x-${pane}`, "close", "pane.close", { pane })));
  }
}
