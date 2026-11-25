// The departure board across the top: a Solari split-flap board, one row per agent (TRAIN, DESTINATION, LINE, STATUS,
// TIME, NEXT while any agent has a prompt scheduled (/loop, CronCreate): when its next one runs, amber in a turn one
// started; then REMARKS where there's room: why it stopped, else what it last reported; the line is the agent's space),
// whoever needs the person first at the top. When a row changes, its cells turn over to the new words with the clatter
// of the flaps; rows that trade places turn too. On the right a flap clock, then the line (space) you're on as a row of
// flaps that turns over when you change line (a name too long for it turns over between its parts), and the
// platforms: a numbered flap tile per space with its status lamp under it (the current one lit amber), nine to a row,
// two rows at most, then +N. The board's height follows the number of trains (boardPx).
//   working  RUNNING      in amber, the train icon rolling
//   done     ARRIVED      in yellow
//   blocked  SIGNAL STOP  in red on red flaps, the row and its lamp pulsing
//   idle     DEPOT        in steel blue
// A row's click goes to that agent; a platform's click shows that space (hover it for the space's folder name). A click on the
// line, or cmd-p (keys.json: dispatch.search), drops the line search from it.
// The right side keeps to the board's rows: on the column heads' strip FILES and CHANGES keys (small flaps in a key cap with
// their shortcut, amber while open) and the clock; the line on the first row; the platforms from the second.
// The keys open the side panel between the pane and the track map (dispatch-files / dispatch-changes, the waybill);
// cmd-shift-e / cmd-shift-g (dispatch.files, .changes) too. Each space remembers which panel it had open.
// Notifications hang from under the right side as a PA board (dispatch-toast queues them in kit/pa.js; the board opens
// the window, since only it knows where it is, and moves it when it grows).
// When the panel would leave the pane narrower than MAIN_MIN, the track map steps aside while it's open and comes back
// when it closes; showing the track map again yourself (cmd-b) keeps it for that opening.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, run, playSound, checking, setAgentOrder, openOverlay, closeOverlay, nextCommand, shared, setShared, layout } from "herdr";
import { OPEN_KEY, SEARCH, searchHeight } from "./search.js";
import { Flaps, flapText, pages, tile } from "../flap.js";
import { ICON, INK, LAMP, STATUS_INK, WORD, boardOrder, clockAt, lineName, lineTitle, since, trains } from "../state.js";
import { PA } from "../kit/pa.js";
import { Alerts } from "../kit/alerts.js";

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
const TOP = 4; // room above the column heads, off the board's top edge
// The board grows with the trains so a busy line still shows every one: room for each at the largest flaps, from four
// rows (layouts/dispatch.json's own height) up to the most, where ten still fit at the middle size and more shrink.
const BOARD_PX = { min: 184, max: 340 };
const boardPx = (n) => Math.min(BOARD_PX.max, Math.max(BOARD_PX.min, TOP + HEAD_H + 12 + n * TIERS[0].row));
const SIDE_W = 372;
const SIDE_ROW = 34; // the right side's rows, the height of the board's first tier
// the destination takes what's left, up to DEST_MAX, so the status stays within a glance of the code
const COLS = { code: 3, line: 16, status: 11, time: 3, next: 5 };
const DEST_MAX = 32, REMARKS_MIN = 8; // the remarks take the rest, shown when at least REMARKS_MIN flaps fit
const NEXT_DEST_MIN = 16; // NEXT steps aside when it would leave the destination fewer flaps than this
const ICON_W = 30;
const GAP = 14; // between the columns
const SOUND_GAP_MS = 1500;
// the platforms: tiles per row, rows at most
const PLAT = { w: 22, h: 28, size: 18, gap: 6, perRow: 9, rows: 2 };
const LINE_COLS = 13;
const LINE_LABEL_W = 30, LINE_GAP = 8;
const LINE_PAGE_MS = 3000; // a line name too long for its flaps turns over between its parts this often
// the side panels, and their keys' small flaps (Cubic 11 stays crisp at 11 px)
const PANELS = [["files", "FILES", "⇧⌘E"], ["changes", "CHANGES", "⇧⌘G"]];
const KEY_LOOK = { w: 13, h: 20, size: 11, gap: 1, color: INK.cream };
const KEY_LIT = { ...KEY_LOOK, color: INK.plateText, bg: INK.plate, bgLo: INK.plateLo };
// the pane's narrowest before the track map steps aside for the panel, and the layout's widths it works that out from
// (layouts/dispatch.json: the panel's and the track map's px, the row's gap)
const MAIN_MIN = 900;
const SIZES = { panel: 400, tracks: 440, gap: 10 };
const ROOM_KEY = "dispatch.tracksAuto"; // set while the track map is stepped aside for the panel, so a reload still brings it back
const RESIZE_WAIT_MS = 1000; // how long a board resize may take to show in layout() before it's asked for again

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const cellsWidth = (n, look = LOOK) => n * look.w + (n - 1) * look.gap;
const LINE_W = LINE_LABEL_W + LINE_GAP + cellsWidth(LINE_COLS); // the LINE label and its flaps

export class Board {
  constructor(cx) {
    this.flaps = new Flaps();
    this.look = TIERS[0];
    // the PA's chimes when an agent arrives or comes to a signal stop (scripts/herdr-sub/dispatch-chime.mjs)
    this.alerts = new Alerts({ done: "mods/dispatch/sounds/done.mp3", blocked: "mods/dispatch/sounds/blocked.mp3" });
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
    try { if (localStorage.getItem(ROOM_KEY)) this.room = { hid: true }; } catch {}
    this.heard = null;
    this.soundAt = 0;
    // the TIME column and the clock move on the minute
    const tick = (cx) => {
      cx.notify();
      cx.timer.after(60000 - (Date.now() % 60000) + 50, tick);
    };
    cx.timer.after(60000 - (Date.now() % 60000) + 50, tick);
  }

  // The clatter, when what the rows say changes (not the minutes ticking by, nor the remarks, which change with every
  // step an agent takes), at most every SOUND_GAP_MS.
  listen(rows, now) {
    const said = rows.map((r) => `${r.code}|${r.dest}|${r.line}|${r.status}`).join("\n");
    if (this.heard !== null && said !== this.heard && now - this.soundAt > SOUND_GAP_MS && !checking()) {
      playSound("mods/dispatch/sounds/flap.mp3");
      this.soundAt = now;
    }
    this.heard = said;
  }

  // The column names, over the same columns as the rows. The window buttons sit over the TRAIN column's head.
  head(destCols, lineCols, nextCols, remarkCols) {
    const label = (text, w) => div().w(w).flex_none().text_size(12).text_color(INK.creamDim).child(text);
    return h_flex().h(HEAD_H).px(6).gap(GAP).items_center()
      .child(div().w(ICON_W + GAP + cellsWidth(COLS.code, this.look)).flex_none())
      .child(label("DESTINATION", cellsWidth(destCols, this.look)))
      .when(lineCols > 0, (el) => el.child(label("LINE", cellsWidth(lineCols, this.look))))
      .child(label("STATUS", cellsWidth(COLS.status, this.look)))
      .child(label("TIME", cellsWidth(COLS.time, this.look)))
      .when(nextCols > 0, (el) => el.child(label("NEXT", cellsWidth(nextCols, this.look))))
      .when(remarkCols > 0, (el) => el.child(label("REMARKS", cellsWidth(remarkCols, this.look))));
  }

  row(i, train, destCols, lineCols, nextCols, remarkCols, now, drawn) {
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
      .when(lineCols > 0, (el) => el.child(flapText(this.flaps, `${key}l`, train?.line ?? "", lineCols, now, drawn, look, i * 60 + 160)))
      .child(flapText(this.flaps, `${key}s`, train && !train.more ? WORD[st] : "", COLS.status, now, drawn, statusLook, i * 60 + 240))
      .child(flapText(this.flaps, `${key}t`, train ? since(train.since, now) : "", COLS.time, now, drawn, look, i * 60 + 320))
      .when(nextCols > 0, (el) => el.child(flapText(this.flaps, `${key}n`, train?.schedule ? clockAt(train.schedule.next, now) : "", nextCols, now, drawn,
        { ...look, color: train?.schedule?.fired ? INK.amber : INK.green }, i * 60 + 360)))
      .when(remarkCols > 0, (el) => el.child(flapText(this.flaps, `${key}r`, train?.remark ?? "", remarkCols, now, drawn,
        { ...look, color: INK.creamDim }, i * 60 + 400)));
  }

  clock(now, drawn) {
    const d = new Date(now);
    const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return flapText(this.flaps, "clock", hhmm, 5, now, drawn, LOOK);
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
    // The board sits 10 px in from the window (the layout's padding) and the right side SIDE_W in from its right
    // padding; the search's right edge meets the LINE flaps' and it drops from below their row.
    const lineRight = 10 + this.size.width - 14 - SIDE_W + LINE_W;
    openOverlay({
      mod: "dispatch", props: { role: "search" }, kind: "popup", frame: "none",
      width: SEARCH.width, height: searchHeight(rows),
      at: { x: Math.max(10, lineRight - SEARCH.width), y: 10 + TOP + HEAD_H + SIDE_ROW + 4 },
    });
  }

  // A name longer than the flaps turns over between its parts, like a long station name on a Solari board.
  line(cx, now, drawn) {
    const name = lineName(spaces().find((sp) => sp.active));
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
    return h_flex().id("line").gap(LINE_GAP).items_center().rounded(4)
      .tooltip("Search lines (⌘P)")
      .hover((st) => st.opacity(0.85))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => this.toggleSearch())
      .child(div().w(LINE_LABEL_W).flex_none().text_size(11).text_color(INK.creamDim).child("LINE"))
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
  syncPanel(root, space, panel, body) {
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
    this.makeRoom(root, panel, now);
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    try { localStorage.setItem("dispatch.panels", JSON.stringify(this.panels)); } catch {}
  }

  // Asks the layout for the board's height for `n` trains whenever it differs (a layout reload puts it back to 184), at
  // most once per RESIZE_WAIT_MS since layout() may lag the resize. Returns the height to lay the rows out for: the one
  // asked for while that resize is on its way, so the rows don't drop a size for a frame and come back.
  fitHeight(root, n) {
    const want = boardPx(n), now = Date.now();
    const has = find(root, "board")?.size?.px;
    if (has !== want && !(this.asked?.px === want && now - this.asked.at < RESIZE_WAIT_MS)) {
      this.asked = { px: want, at: now };
      run("layout.resize", { id: "board", px: want });
    }
    return this.asked?.px === want && now - this.asked.at < RESIZE_WAIT_MS ? want : this.size.height;
  }

  // The PA board hangs under the right side while announcements are queued. To move it when the board changes size, a
  // new one opens in the new spot (a keyed window would stay where it was) and the old one closes itself when it sees
  // the new one mark itself up in PA.open (only a mod's own overlays close from it, so the board can't). Once the
  // board's window has been seen up and isn't any more (it emptied, or a layout switch closed it), the next
  // announcement opens a fresh one.
  hangPa(cx) {
    if (!this.measured) return; // nowhere to hang it until the board knows its size
    const up = shared(PA.open) ?? null;
    if (this.pa) {
      if (this.pa.id && up === this.pa.id) this.pa.seen = true;
      else if (this.pa.seen) this.pa = null;
    }
    const now = Date.now();
    if (!(shared(PA.key) ?? []).some((e) => e.until > now)) return;
    const at = { x: Math.round(10 + this.size.width - 14 - SIDE_W), y: Math.round(10 + this.size.height) };
    if (this.pa?.at.x === at.x && this.pa?.at.y === at.y) return;
    // one still waiting for its turn to open isn't opened at all
    const prev = this.pa, pa = (this.pa = { id: null, at, seen: false, dropped: false });
    if (prev) prev.dropped = true;
    cx.timer.after(0, () => {
      if (pa.dropped) return;
      pa.id = openOverlay({ mod: "dispatch-toast", props: { role: "pa" }, kind: "window", frame: "none", width: SIDE_W, at });
    });
  }

  // The track map steps aside when the panel opens on a window too narrow for the pane, panel and map together, and
  // comes back when the panel closes. Decided once per opening; showing the map again yourself (cmd-b) makes it yours:
  // it's left as you leave it. The stepped-aside mark is kept in localStorage so a reload still brings the map back.
  makeRoom(root, panel, open) {
    const tracks = find(root, "tracks");
    if (!tracks) return;
    const mark = (hid) => {
      this.room = { hid };
      try { hid ? localStorage.setItem(ROOM_KEY, "1") : localStorage.removeItem(ROOM_KEY); } catch {}
    };
    if (!open) {
      if (this.room?.hid && tracks.hidden) run("layout.show", { id: "tracks" });
      if (this.room) mark(false);
      this.room = null;
      return;
    }
    if (this.room) {
      if (this.room.hid && !tracks.hidden) mark(false);
      return;
    }
    const px = (node, fallback) => node?.size?.px ?? fallback;
    const main = this.size.width - px(panel, SIZES.panel) - px(tracks, SIZES.tracks) - SIZES.gap * 2;
    mark(!tracks.hidden && main < MAIN_MIN);
    if (this.room.hid) run("layout.hide", { id: "tracks" });
  }

  // The panel keys: a word on small flaps in a key cap with its shortcut, amber while its panel is open.
  panelKeys(root, now, drawn) {
    const panel = find(root, "panel"), body = find(root, "panel-body");
    this.syncPanel(root, spaces().find((sp) => sp.active), panel, body);
    const open = panel && !panel.hidden ? body?.active : null;
    return h_flex().gap(6).items_center().children(PANELS.map(([id, word, keys]) => {
      const lit = open === id;
      return h_flex().id(`panel-${id}`).flex_none().gap(5).items_center().px(4).py(2).rounded(3)
        .border_1().border_color(lit ? INK.plate : INK.steelDim)
        .tooltip(`${word[0]}${word.slice(1).toLowerCase()} (${keys})`)
        .hover((st) => st.border_color(INK.plate))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => this.togglePanel(id))
        .child(flapText(this.flaps, `panel-${id}`, word, word.length, now, drawn, lit ? KEY_LIT : KEY_LOOK))
        .child(div().text_size(11).text_color(lit ? INK.plate : INK.creamDim).child(keys));
    }));
  }

  // A platform: a numbered flap tile (amber for the line you're on) over the space's status lamp.
  platform(space, n) {
    const lit = space.active;
    const label = n < 9 ? String(n + 1) : String.fromCharCode(65 + n - 9); // 1..9, then A, B, ...
    const face = tile({ ch: label, seq: null }, { w: PLAT.w, h: PLAT.h, size: PLAT.size, color: lit ? INK.plateText : INK.cream,
      ...(lit ? { bg: INK.plate, bgLo: INK.plateLo } : {}) });
    return v_flex().id(`plat-${space.id}`).flex_none().gap(3).items_center()
      .tooltip(lineTitle(space))
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
    if (rest.length) tiles.push(div().w(PLAT.w).h(PLAT.h).flex_none().text_size(13).text_color(INK.creamDim).tooltip(rest.map(lineTitle).join(", ")).child(`+${rest.length}`));
    const rows = [];
    for (let i = 0; i < tiles.length; i += PLAT.perRow) rows.push(h_flex().gap(PLAT.gap).children(tiles.slice(i, i + PLAT.perRow)));
    return v_flex().gap(6).children(rows);
  }

  render(cx) {
    const now = Date.now(), drawn = new Set();
    const all = boardOrder(trains());
    setAgentOrder(all.map((t) => t.agent.address));
    this.alerts.watch();
    const root = layout();
    const height = this.fitHeight(root, all.length), { width } = this.size;
    this.hangPa(cx);
    const room = height - TOP - HEAD_H - 12;
    const rowsOf = (t) => Math.max(1, Math.floor(room / t.row));
    this.look = TIERS.find((t) => rowsOf(t) >= all.length) ?? TIERS.at(-1);
    const look = this.look;
    const cols = (px) => Math.floor((px + look.gap) / (look.w + look.gap));
    const bare = 12 + ICON_W + cellsWidth(COLS.code, look) + cellsWidth(COLS.status, look) + cellsWidth(COLS.time, look) + GAP * 4 + SIDE_W + 24;
    // NEXT is there while anything is scheduled; on a narrow window it's the first to go after the remarks
    const nextW = cellsWidth(COLS.next, look) + GAP;
    const nextCols = all.some((t) => t.schedule) && cols(width - bare - cellsWidth(COLS.line, look) - GAP - nextW) >= NEXT_DEST_MIN ? COLS.next : 0;
    const base = bare + (nextCols ? nextW : 0);
    // on a narrow window the line steps aside before the status and time would be cut off
    const lineCols = cols(width - base - cellsWidth(COLS.line, look) - GAP) >= 8 ? COLS.line : 0;
    const fixed = base + (lineCols ? cellsWidth(lineCols, look) + GAP : 0), free = Math.max(8, cols(width - fixed));
    // the destination up to DEST_MAX and the remarks after it; too little left for remarks goes to the destination
    const rest = cols(width - fixed - cellsWidth(Math.min(DEST_MAX, free), look) - GAP);
    const remarkCols = rest >= REMARKS_MIN ? rest : 0, destCols = remarkCols ? Math.min(DEST_MAX, free) : free;
    const fit = rowsOf(look);
    // more trains than rows: the last row says how many more are waiting
    const shown = all.length > fit ? [...all.slice(0, fit - 1), { code: "+++", dest: `${all.length - fit + 1} MORE`, status: "idle", more: true }] : all;
    this.listen(shown, now);
    const rows = Array.from({ length: fit }, (_, i) => {
      const t = shown[i];
      return this.row(i, t?.more ? { ...t, agent: null, since: null, remark: "" } : t, destCols, lineCols, nextCols, remarkCols, now, drawn);
    });
    const view = h_flex().id("board").size_full().bg(INK.board).gap(16).pt(TOP).pr(14).pb(8)
      .on_size_change((size, cx) => {
        if (size.width === this.size.width && size.height === this.size.height) return;
        this.size = size;
        this.measured = true;
        cx.notify();
      })
      .child(v_flex().flex_1().min_w(0).overflow_hidden().child(this.head(destCols, lineCols, nextCols, remarkCols)).children(rows))
      .child(v_flex().w(SIDE_W).flex_none().self_start()
        .child(h_flex().h(HEAD_H).justify_between().items_center().child(this.panelKeys(root, now, drawn)).child(this.clock(now, drawn)))
        .child(h_flex().h(SIDE_ROW).items_center().child(this.line(cx, now, drawn)))
        .child(div().pt(3).child(this.platforms())));
    this.flaps.settle(cx, now, drawn);
    return view;
  }
}
