// The departure board across the top: a Solari split-flap board, one row per agent (TRAIN, DESTINATION, STATUS, TIME),
// whoever needs the person first at the top. When a row changes, its cells turn over to the new words with the clatter
// of the flaps; rows that trade places turn too. On the right a flap clock, then the line (space) you're on as a row of
// flaps that turns over when you change line, and the platforms: a numbered flap tile per space with its status lamp
// under it (the current one lit amber), seven to a row, two rows at most, then +N.
//   working  RUNNING      in amber, the train icon rolling
//   done     ARRIVED      in yellow
//   blocked  SIGNAL STOP  in red on red flaps, the row and its lamp pulsing
//   idle     DEPOT        in steel blue
// A row's click goes to that agent; a platform's click shows that space (hover it for the space's name).
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, run, playSound, checking, setAgentOrder } from "herdr";
import { Flaps, flapText, tile } from "../flap.js";
import { ICON, INK, LAMP, STATUS_INK, WORD, boardOrder, since, trains } from "../state.js";

const LOOK = { w: 16, h: 28, size: 22, gap: 2, color: INK.cream };
// The rows' flaps shrink as trains are added, so more of them fit on the board before it says "+N MORE": the largest
// size that fits every train (Cubic 11 stays crisp at 22 and 11 px). The clock and the line keep the full size.
const TIERS = [
  { w: 16, h: 28, size: 22, gap: 2, row: 34, icon: 22 },
  { w: 14, h: 24, size: 22, gap: 2, row: 28, icon: 20 },
  { w: 11, h: 18, size: 11, gap: 1, row: 21, icon: 16 },
].map((t) => ({ ...t, color: INK.cream }));
const HEAD_H = 30;
const SIDE_W = 232;
const COLS = { code: 3, status: 11, time: 3 };
const ICON_W = 30;
const GAP = 14; // between the columns
const SOUND_GAP_MS = 1500;
// the platforms: tiles per row, rows at most
const PLAT = { w: 22, h: 28, size: 18, gap: 6, perRow: 7, rows: 2 };
const LINE_COLS = 10;

const cellsWidth = (n, look = LOOK) => n * look.w + (n - 1) * look.gap;

export class Board {
  constructor(cx) {
    this.flaps = new Flaps();
    this.look = TIERS[0];
    this.size = { width: 1200, height: 230 };
    this.heard = null;
    this.soundAt = 0;
    // the TIME column and the clock move on the minute
    const tick = (cx) => {
      cx.notify();
      cx.timer.after(60000 - (Date.now() % 60000) + 50, tick);
    };
    cx.timer.after(60000 - (Date.now() % 60000) + 50, tick);
  }

  // The clatter, when what the rows say changes (not the minutes ticking by), at most every SOUND_GAP_MS.
  listen(rows, now) {
    const said = rows.map((r) => `${r.code}|${r.dest}|${r.status}`).join("\n");
    if (this.heard !== null && said !== this.heard && now - this.soundAt > SOUND_GAP_MS && !checking()) {
      playSound("mods/dispatch/sounds/flap.mp3");
      this.soundAt = now;
    }
    this.heard = said;
  }

  // The column names, over the same columns as the rows. The window buttons sit over the TRAIN column's head.
  head(destCols) {
    const label = (text, w) => div().w(w).flex_none().text_size(12).text_color(INK.creamDim).child(text);
    return h_flex().h(HEAD_H).px(6).gap(GAP).items_center()
      .child(div().w(ICON_W + GAP + cellsWidth(COLS.code, this.look)).flex_none())
      .child(label("DESTINATION", cellsWidth(destCols, this.look)))
      .child(label("STATUS", cellsWidth(COLS.status, this.look)))
      .child(label("TIME", cellsWidth(COLS.time, this.look)));
  }

  row(i, train, destCols, now, drawn) {
    const st = train?.status;
    const key = `r${i}`;
    const stopped = st === "blocked";
    const look = this.look;
    const statusLook = { ...look, color: STATUS_INK[st] ?? look.color, ...(stopped ? { bg: INK.stopFlap, bgLo: INK.stopFlapLo } : {}) };
    const icon = train ? svg(`${ICON}/train.svg`).size(look.icon).text_color(STATUS_INK[st]) : div().size(look.icon);
    return h_flex().id(`row-${i}`).relative().h(look.row).gap(GAP).items_center().px(6).rounded(3)
      .when(stopped, (el) => el.child(div().absolute().top(0).left(0).size_full().rounded(3).bg(INK.redDeep)
        .loop("opacity", { from: 0.15, to: 0.9, period: 1100 })))
      .when(Boolean(train?.agent), (el) => el.hover((s) => s.bg("#ffffff0d")).on_click(() => run("agent.focus", { terminal: train.agent.address })))
      .child(h_flex().w(ICON_W).flex_none().justify_center()
        .child(st === "working" ? div().relative().loop("left", { from: -2, to: 2, period: 700 }).child(icon)
          : stopped ? div().loop("opacity", { from: 0.3, to: 1, period: 700 }).child(icon) : icon))
      .child(flapText(this.flaps, `${key}c`, train?.code ?? "", COLS.code, now, drawn, look, i * 60))
      .child(flapText(this.flaps, `${key}d`, train?.dest ?? "", destCols, now, drawn, look, i * 60 + 80))
      .child(flapText(this.flaps, `${key}s`, train && !train.more ? WORD[st] : "", COLS.status, now, drawn, statusLook, i * 60 + 160))
      .child(flapText(this.flaps, `${key}t`, train ? since(train.since, now) : "", COLS.time, now, drawn, look, i * 60 + 240));
  }

  clock(now, drawn) {
    const d = new Date(now);
    const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return flapText(this.flaps, "clock", hhmm, 5, now, drawn, { ...LOOK, w: 22, h: 36, size: 33, color: INK.cream });
  }

  // The line you're on, its name on flaps that turn over when you change line.
  line(now, drawn) {
    const here = spaces().find((sp) => sp.active);
    return h_flex().gap(8).items_center()
      .child(div().w(30).flex_none().text_size(11).text_color(INK.creamDim).child("LINE"))
      .child(flapText(this.flaps, "line", here?.name ?? "", LINE_COLS, now, drawn, LOOK));
  }

  // A platform: a numbered flap tile (amber for the line you're on) over the space's status lamp.
  platform(space, n) {
    const lit = space.active;
    const label = n < 9 ? String(n + 1) : String.fromCharCode(65 + n - 9); // 1..9, then A, B, ...
    const face = tile({ ch: label, seq: null }, { w: PLAT.w, h: PLAT.h, size: PLAT.size, color: lit ? INK.plateText : INK.cream,
      ...(lit ? { bg: INK.plate, bgLo: "#d08c2c" } : {}) });
    return v_flex().id(`plat-${space.id}`).flex_none().gap(3).items_center()
      .tooltip(space.name)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => run("space.select", { id: space.id }))
      .hover((s) => s.opacity(0.85))
      .child(face)
      .child(div().size(5).rounded_full().bg(space.status ? LAMP[space.status] : INK.steelDim)
        .when(space.status === "blocked", (el) => el.loop("opacity", { from: 0.25, to: 1, period: 700 })));
  }

  platforms() {
    const all = spaces(), room = PLAT.perRow * PLAT.rows;
    const shown = all.length > room ? all.slice(0, room - 1) : all;
    const rest = all.slice(shown.length);
    const tiles = shown.map((sp, i) => this.platform(sp, i));
    if (rest.length) tiles.push(div().w(PLAT.w).h(PLAT.h).flex_none().text_size(13).text_color(INK.creamDim).tooltip(rest.map((sp) => sp.name).join(", ")).child(`+${rest.length}`));
    const rows = [];
    for (let i = 0; i < tiles.length; i += PLAT.perRow) rows.push(h_flex().gap(PLAT.gap).children(tiles.slice(i, i + PLAT.perRow)));
    return v_flex().gap(6).children(rows);
  }

  render(cx) {
    const now = Date.now(), drawn = new Set();
    const all = boardOrder(trains());
    setAgentOrder(all.map((t) => t.agent.address));
    const { width, height } = this.size;
    const room = height - HEAD_H - 12;
    const rowsOf = (t) => Math.max(1, Math.floor(room / t.row));
    this.look = TIERS.find((t) => rowsOf(t) >= all.length) ?? TIERS.at(-1);
    const look = this.look;
    const fixed = 12 + ICON_W + cellsWidth(COLS.code, look) + cellsWidth(COLS.status, look) + cellsWidth(COLS.time, look) + GAP * 4 + SIDE_W + 24;
    const destCols = Math.max(8, Math.floor((width - fixed + look.gap) / (look.w + look.gap)));
    const fit = rowsOf(look);
    // more trains than rows: the last row says how many more are waiting
    const shown = all.length > fit ? [...all.slice(0, fit - 1), { code: "+++", dest: `${all.length - fit + 1} MORE`, status: "idle", more: true }] : all;
    this.listen(shown, now);
    const rows = Array.from({ length: fit }, (_, i) => {
      const t = shown[i];
      return this.row(i, t?.more ? { ...t, agent: null, since: null } : t, destCols, now, drawn);
    });
    const view = h_flex().id("board").size_full().bg(INK.board).gap(16).pr(14).pb(8)
      .on_size_change((size, cx) => {
        if (size.width === this.size.width && size.height === this.size.height) return;
        this.size = size;
        cx.notify();
      })
      .child(v_flex().flex_1().min_w(0).overflow_hidden().child(this.head(destCols)).children(rows))
      .child(v_flex().w(SIDE_W).flex_none().pt(10).gap(8)
        .child(h_flex().justify_end().child(this.clock(now, drawn)))
        .child(this.line(now, drawn))
        .child(this.platforms()));
    this.flaps.settle(cx, now, drawn);
    return view;
  }
}
