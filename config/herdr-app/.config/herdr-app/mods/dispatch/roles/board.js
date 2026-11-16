// The departure board across the top: a Solari split-flap board, one row per agent (TRAIN, DESTINATION, STATUS, TIME),
// whoever needs the person first at the top. When a row changes, its cells turn over to the new words with the clatter
// of the flaps; rows that trade places turn too. On the right a flap clock, then the line (space) you're on as a row of
// flaps that turns over when you change line (a name too long for it turns over between its parts), and the
// platforms: a numbered flap tile per space with its status lamp under it (the current one lit amber), nine to a row,
// two rows at most, then +N.
//   working  RUNNING      in amber, the train icon rolling
//   done     ARRIVED      in yellow
//   blocked  SIGNAL STOP  in red on red flaps, the row and its lamp pulsing
//   idle     DEPOT        in steel blue
// A row's click goes to that agent; a platform's click shows that space (hover it for the space's name). A click on the
// line, or cmd-p (keys.json: dispatch.search), drops the line search from it.
// Left of the clock, FILES and CHANGES on small flaps (amber while open) open the side panel between the pane and the
// track map (dispatch-files / dispatch-changes, the waybill); cmd-shift-e / cmd-shift-g (dispatch.files, .changes) too.
// Each space remembers which panel it had open.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, run, playSound, checking, setAgentOrder, openOverlay, closeOverlay, nextCommand, shared, setShared, layout } from "herdr";
import { OPEN_KEY, SEARCH, searchHeight } from "./search.js";
import { Flaps, flapText, pages, tile } from "../flap.js";
import { ICON, INK, LAMP, STATUS_INK, WORD, boardOrder, since, trains } from "../state.js";

// 18 wide: Cubic 11's widest capitals (M, W) are about 18 px at 22 px and would be clipped by a narrower flap
const LOOK = { w: 18, h: 28, size: 22, gap: 2, color: INK.cream };
// The rows' flaps shrink as trains are added, so more of them fit on the board before it says "+N MORE": the largest
// size that fits every train (Cubic 11 stays crisp at 22 and 11 px). The clock and the line keep the full size.
const TIERS = [
  { w: 18, h: 28, size: 22, gap: 2, row: 34, icon: 22 },
  { w: 18, h: 24, size: 22, gap: 2, row: 28, icon: 20 },
  { w: 11, h: 18, size: 11, gap: 1, row: 21, icon: 16 },
].map((t) => ({ ...t, color: INK.cream }));
const HEAD_H = 30;
const SIDE_W = 320;
const COLS = { code: 3, status: 11, time: 3 };
const ICON_W = 30;
const GAP = 14; // between the columns
const SOUND_GAP_MS = 1500;
// the platforms: tiles per row, rows at most
const PLAT = { w: 22, h: 28, size: 18, gap: 6, perRow: 9, rows: 2 };
const LINE_COLS = 13;
const LINE_PAGE_MS = 3000; // a line name too long for its flaps turns over between its parts this often
// the side panels, and their keys' small flaps (Cubic 11 stays crisp at 11 px)
const PANELS = [["files", "FILES", "⇧⌘E"], ["changes", "CHANGES", "⇧⌘G"]];
const KEY_LOOK = { w: 13, h: 20, size: 11, gap: 1, color: INK.cream };
const KEY_LIT = { ...KEY_LOOK, color: INK.plateText, bg: INK.plate, bgLo: INK.plateLo };

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const cellsWidth = (n, look = LOOK) => n * look.w + (n - 1) * look.gap;

export class Board {
  constructor(cx) {
    this.flaps = new Flaps();
    this.look = TIERS[0];
    // a search left open by an earlier run is gone now; forget it
    cx.timer.after(0, () => setShared(OPEN_KEY, null));
    cx.spawn(async () => {
      for (;;) {
        const c = await nextCommand();
        if (c === "search") this.toggleSearch(true);
        else if (PANELS.some(([id]) => id === c)) this.togglePanel(c);
      }
    });
    this.size = { width: 1200, height: 230 };
    try { this.panels = JSON.parse(localStorage.getItem("dispatch.panels") ?? "{}"); } catch { this.panels = {}; }
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
  // The line search drops from the LINE flaps, its right edge on the board's. While it's open, cmd-p goes to the
  // search itself (it closes), and a click on the line closes it by landing beside it: neither opens it again.
  toggleSearch(fromKey = false) {
    const st = shared(OPEN_KEY) ?? {};
    if (st.open) {
      if (!fromKey) closeOverlay(st.id);
      return;
    }
    if (Date.now() - (st.closedAt ?? 0) < 400) return;
    const rows = Math.min(SEARCH.rows, spaces().length);
    // the board sits 10 px in from the window (the layout's padding); the line row ends about 140 px down the window
    openOverlay({
      mod: "dispatch", props: { role: "search" }, kind: "popup", frame: "none",
      width: SEARCH.width, height: searchHeight(rows),
      at: { x: Math.max(10, 10 + this.size.width - 14 - SEARCH.width), y: 146 },
    });
  }

  // A name longer than the flaps turns over between its parts, like a long station name on a Solari board.
  line(cx, now, drawn) {
    const name = spaces().find((sp) => sp.active)?.name ?? "";
    const parts = pages(name, LINE_COLS);
    if (name !== this.lineName) {
      this.lineName = name;
      this.linePage = 0;
      const token = (this.linePaging = (this.linePaging ?? 0) + 1);
      if (parts.length > 1) {
        const turn = (cx) => {
          if (this.linePaging !== token) return;
          this.linePage++;
          cx.notify();
          cx.timer.after(LINE_PAGE_MS, turn);
        };
        cx.timer.after(LINE_PAGE_MS, turn);
      }
    }
    return h_flex().id("line").gap(8).items_center().rounded(4)
      .tooltip("Search lines (⌘P)")
      .hover((st) => st.opacity(0.85))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => this.toggleSearch())
      .child(div().w(30).flex_none().text_size(11).text_color(INK.creamDim).child("LINE"))
      .child(flapText(this.flaps, "line", parts[this.linePage % parts.length], LINE_COLS, now, drawn, LOOK));
  }

  togglePanel(id) {
    const root = layout(), panel = find(root, "panel");
    if (panel && !panel.hidden && find(root, "panel-body")?.active === id) return run("layout.hide", { id: "panel" });
    run("layout.select", { stack: "panel-body", child: id });
    run("layout.show", { id: "panel" });
  }

  // The side panel is remembered per space (as on the sub's tab bar): switching shows that space's choice (closed if it
  // never had one), and opening or closing it records it.
  syncPanel(space, panel, body) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = PANELS.some(([id]) => id === stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    try { localStorage.setItem("dispatch.panels", JSON.stringify(this.panels)); } catch {}
  }

  // The panel keys left of the clock: a word on small flaps each, amber while its panel is open.
  panelKeys(now, drawn) {
    const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
    this.syncPanel(spaces().find((sp) => sp.active), panel, body);
    const open = panel && !panel.hidden ? body?.active : null;
    return h_flex().gap(8).items_center().children(PANELS.map(([id, word, keys]) =>
      div().id(`panel-${id}`).flex_none().tooltip(`${word[0]}${word.slice(1).toLowerCase()} (${keys})`)
        .hover((st) => st.opacity(0.85))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => this.togglePanel(id))
        .child(flapText(this.flaps, `panel-${id}`, word, word.length, now, drawn, open === id ? KEY_LIT : KEY_LOOK))));
  }

  // A platform: a numbered flap tile (amber for the line you're on) over the space's status lamp.
  platform(space, n) {
    const lit = space.active;
    const label = n < 9 ? String(n + 1) : String.fromCharCode(65 + n - 9); // 1..9, then A, B, ...
    const face = tile({ ch: label, seq: null }, { w: PLAT.w, h: PLAT.h, size: PLAT.size, color: lit ? INK.plateText : INK.cream,
      ...(lit ? { bg: INK.plate, bgLo: INK.plateLo } : {}) });
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
        .child(h_flex().justify_between().items_center().child(this.panelKeys(now, drawn)).child(this.clock(now, drawn)))
        .child(this.line(cx, now, drawn))
        .child(this.platforms()));
    this.flaps.settle(cx, now, drawn);
    return view;
  }
}
