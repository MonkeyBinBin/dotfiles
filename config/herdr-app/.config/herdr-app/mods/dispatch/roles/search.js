// The line search: a small split-flap board that drops from the LINE flaps (the board role opens it as a popup, or
// cmd-p while dispatch shows). What's typed turns up on a row of flaps; below, the spaces that match, each with its
// platform number, its name on flaps (matched letters lit amber), its most urgent status and its tab count. Those
// that need the person come first (SIGNAL STOP, ARRIVED, RUNNING, DEPOT), then the closest matches.
//   ↑ ↓  choose    Enter  go there    cmd 1-9  go to that row    Esc  clear what's typed, again to close
// The selected row is lit by a faint amber wash and its platform tile turns amber.
// Props: { overlay } from the app.
import { div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { spaces, run, props, closeOverlay, setShared, nextCommand } from "herdr";
import { Flaps, glyphs, tile } from "../flap.js";
import { INK, LAMP, RANK, STATUS_INK, WORD, lineName } from "../state.js";

const QUERY = { w: 18, h: 28, size: 22, gap: 2, color: INK.cream };
const NAME = { w: 18, h: 26, size: 22, gap: 2, color: INK.cream };
const PLAT = { w: 22, h: 28, size: 18, gap: 0, color: INK.cream };
/** Shared: { open: true, id } while the search is open, { closedAt } after; the board toggles it by this. */
export const OPEN_KEY = "dispatch.search";
export const SEARCH = { width: 600, rows: 8, rowH: 34, cols: 16, queryCols: 22 };
/** The popup's height for a number of rows, so the board opens it at its size. */
export const searchHeight = (rows) => 14 + 34 + 10 + 16 + 6 + Math.max(1, rows) * SEARCH.rowH + 10 + 28 + 12;

// Letters in order: their indexes in the name, and a score (runs of letters and early hits score higher).
function match(name, q) {
  if (!q) return { hits: new Set(), score: 0 };
  const n = Array.from(name.toLowerCase()), qq = Array.from(q.toLowerCase());
  const hits = new Set();
  let j = 0, score = 0, last = -2;
  for (let i = 0; i < n.length && j < qq.length; i++) {
    if (n[i] !== qq[j]) continue;
    hits.add(i);
    score += (i === last + 1 ? 3 : 1) - i * 0.02;
    last = i;
    j++;
  }
  return j === qq.length ? { hits, score } : null;
}

const platformLabel = (n) => (n < 9 ? String(n + 1) : String.fromCharCode(65 + n - 9));

export class Search {
  constructor(cx) {
    this.flaps = new Flaps();
    this.query = "";
    this.sel = 0;
    this.input = InputState.new({});
    this.input.on("change", (_e, cx) => {
      this.query = this.input.value();
      this.sel = 0;
      cx.notify();
    });
    this.input.on("submit", () => this.go(this.results()[this.sel]));
    this.input.focus();
    cx.timer.after(400, () => this.input.focus());
    this.handle = cx.focus_handle();
    cx.timer.after(0, () => setShared(OPEN_KEY, { open: true, id: props()?.overlay }));
    // cmd-p again (keys.json: dispatch.search) closes it
    cx.spawn(async () => {
      for (;;) if ((await nextCommand()) === "search") this.close();
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  // however it closed (Esc, a click beside it, going somewhere), the board should know it's gone
  closed() {
    setShared(OPEN_KEY, { closedAt: Date.now() });
  }

  results() {
    return spaces().map((s, idx) => ({ s, idx, m: match(lineName(s), this.query) })).filter((r) => r.m)
      .sort((a, b) => (RANK[a.s.status] ?? 3) - (RANK[b.s.status] ?? 3) || b.m.score - a.m.score || a.idx - b.idx)
      .slice(0, SEARCH.rows);
  }

  go(r) {
    if (!r) return;
    this.close();
    run("space.select", { id: r.s.id });
  }

  // A run of flaps whose letters at `hits` are lit amber.
  name(key, text, hits, now, drawn) {
    return h_flex().flex_none().gap(NAME.gap).children(glyphs(text, SEARCH.cols).map((g, i) => {
      const k = `${key}:${i}`;
      drawn.add(k);
      const c = this.flaps.cell(k, g.ch, now, i * 20);
      return tile(c, { ...NAME, w: NAME.w * g.w + NAME.gap * (g.w - 1), color: hits.has(i) ? INK.amber : NAME.color });
    }));
  }

  row(r, i, now, drawn) {
    const on = i === this.sel, st = r.s.status ?? "idle";
    const plate = tile({ ch: platformLabel(r.idx), seq: null }, { ...PLAT, color: on ? INK.plateText : INK.cream, ...(on ? { bg: INK.plate, bgLo: INK.plateLo } : {}) });
    return h_flex().id(`sr-${r.s.id}`).h(SEARCH.rowH).px(6).gap(10).items_center().rounded(4)
      .when(on, (el) => el.bg("#e8a03a1f"))
      .on_hover((hovered, cx) => {
        if (!hovered || this.sel === i) return;
        this.sel = i;
        cx.notify();
      })
      .on_click(() => this.go(r))
      // the status lamp before the platform number, centred on it
      .child(h_flex().w(40).flex_none().gap(6).items_center()
        .child(div().size(6).flex_none().rounded_full().bg(r.s.status ? LAMP[st] : INK.steelDim)
          .when(st === "blocked", (el) => el.loop("opacity", { from: 0.25, to: 1, period: 700 })))
        .child(plate))
      .child(this.name(`n${r.s.id}`, lineName(r.s), r.m.hits, now, drawn))
      .child(div().w(120).flex_none().text_size(15).text_color(STATUS_INK[st]).child(WORD[st]))
      .child(div().flex_1().text_size(13).text_color(INK.creamDim).text_right().child(String(r.s.tabs.filter((t) => !t.settled).length)));
  }

  render(cx) {
    const now = Date.now(), drawn = new Set(), list = this.results();
    this.sel = Math.min(this.sel, Math.max(0, list.length - 1));
    // the query on flaps, a caret under the next cell
    const typed = Array.from(this.query.toUpperCase());
    const caretAt = Math.min(typed.reduce((n, ch) => n + (glyphs(ch, 2)[0].w), 0), SEARCH.queryCols - 1);
    const query = h_flex().flex_none().gap(QUERY.gap).children(glyphs(this.query, SEARCH.queryCols).map((g, i) => {
      const k = `q:${i}`;
      drawn.add(k);
      const face = tile(this.flaps.cell(k, g.ch, now, 0), { ...QUERY, w: QUERY.w * g.w + QUERY.gap * (g.w - 1) });
      return i === caretAt ? div().relative().child(face).child(div().absolute().left(3).bottom(-4).w(QUERY.w - 6).h(2).bg(INK.amber)
        .loop("opacity", { from: 0, to: 1, period: 1000 })) : face;
    }));
    const label = (text, w) => div().w(w).flex_none().text_size(11).text_color(INK.creamDim).child(text);
    const view = v_flex().id("line-search").track_focus(this.handle).size_full().px(16).pt(14).pb(12).gap(10)
      .bg(INK.board).rounded(10)
      .on_key_down((e, cx) => {
        const k = e.key, n = list.length;
        if (k === "escape") {
          if (!this.query) return this.close();
          this.input.set_value("");
          this.query = "";
        } else if (k === "down" && n) this.sel = (this.sel + 1) % n;
        else if (k === "up" && n) this.sel = (this.sel + n - 1) % n;
        else if (e.modifiers.platform && /^[1-9]$/.test(k)) return this.go(list[Number(k) - 1]);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().gap(10).items_center()
        .child(label("TO", 22))
        .child(query)
        // the typing goes to an input kept out of sight: the flaps are what shows
        .child(div().absolute().left(0).top(0).w(1).h(1).overflow_hidden().opacity(0).child(Input.new(this.input).w(200).h(20))))
      .child(h_flex().px(6).gap(10)
        .child(label("PL", 40)).child(label("LINE", SEARCH.cols * (NAME.w + NAME.gap))).child(label("STATUS", 120)).child(div().flex_1().text_size(11).text_color(INK.creamDim).text_right().child("TABS")))
      .child(list.length
        ? v_flex().gap(0).children(list.map((r, i) => this.row(r, i, now, drawn)))
        : div().px(6).py(8).text_size(16).text_color(INK.creamDim).child("NO SUCH LINE"))
      .child(h_flex().mt_auto().pt(8).gap(14).border_t(1).border_color("#2a343c").text_size(12).text_color(INK.creamDim)
        .children([["↑↓", "選擇"], ["Enter", "前往"], ["⌘1-9", "直接前往該列"], ["Esc", "清除，再按一次關閉"]].map(([key, what]) =>
          h_flex().gap(4).items_center().child(div().px(5).rounded(3).bg(INK.flap).text_color(INK.cream).text_size(11).child(key)).child(what))));
    this.flaps.settle(cx, now, drawn);
    return view;
  }
}
