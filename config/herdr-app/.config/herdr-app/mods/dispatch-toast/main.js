// Dispatch's notifications as a station PA board hanging from the departure board. Two roles:
//   toast  what Herdr opens for each notification (layouts/dispatch.json's root "toast"): it queues the announcement
//          (kit/pa.js) and closes at once; the departure board opens the PA window under its right side
//   pa     that window: the queued announcements, newest on top, each a loudspeaker and a line of amber LED dots on
//          black (the train's code first when it's about an agent) with what kind of announcement under it, what
//          needs the person first (PA.rows at most). A line
//          too long for the board scrolls to its end and back. Colour and word follow the train's status when it's
//          about an agent (SIGNAL STOP in red, ARRIVED in yellow, as on the board), else the level. An announcement
//          goes when its time is up or it's clicked (which runs its action); the window closes when none are left.
// It keeps the shipped toast's login copy key.
import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, closeOverlay, run, agents, shared, setShared } from "herdr";
import { trainCodes } from "./kit/trains.js";
import { PA } from "./kit/pa.js";

const HERE = "mods/dispatch-toast";
const INK = {
  panel: "#050607", bezel: "#1a1f24", board: "#0d1013", rod: "#56616b", cream: "#f2ead8", creamDim: "#8a8476",
  amber: "#ffb03a", yellow: "#ffe05a", red: "#ff4a3a", key: "#15191d", alarm: "#4a1410",
};
// what the board announces: its word and LED colour
const KIND = {
  stop: { word: "SIGNAL STOP", ink: INK.red, alarm: true },
  arrived: { word: "ARRIVED", ink: INK.yellow },
  failed: { word: "FAILED", ink: INK.red, alarm: true },
  caution: { word: "CAUTION", ink: INK.amber },
  notice: { word: "NOTICE", ink: INK.amber },
};
const LEVEL = { error: "failed", warning: "caution", success: "arrived", info: "notice" };
// how long an announcement stays when the notification doesn't say: longer for what needs the person
const STAY_MS = { long: 20000, short: 8000 };

const ROD = { w: 3, h: 10, inset: 28 }; // the hangers, down from the departure board
const ROW_H = 56, ICON_W = 44, PAD = 12, TEXT = 22, SCROLL_PX_S = 60, DOTS = { w: 960, h: 72 };
// Cubic 11's advances at 22 px for ASCII 32..126; everything else (CJK, punctuation) is a full 24
const ADV = [7, 7, 12, 13, 13, 15, 13, 7, 12, 12, 11, 15, 7, 13, 7, 15, 13, 12, 13, 13, 13, 13, 13, 13, 13, 13, 7, 7, 15, 13, 15, 13,
  15, 15, 13, 13, 15, 13, 13, 15, 15, 7, 13, 13, 13, 19, 15, 15, 13, 15, 13, 13, 15, 15, 15, 19, 13, 15, 14, 11, 15, 11, 11, 13,
  7, 11, 11, 11, 11, 11, 11, 11, 11, 7, 7, 11, 7, 15, 11, 11, 11, 11, 9, 11, 9, 11, 11, 19, 11, 11, 11, 15, 11, 15, 13];
const widthOf = (text) => Array.from(text).reduce((w, ch) => {
  const c = ch.codePointAt(0);
  return w + (c >= 32 && c < 127 ? ADV[c - 32] : c === 0xb7 ? 12 : 24);
}, 0);

const LOGIN = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/;

/** The agent a notification is about: the terminal its action goes to, else one whose title is its title or body. */
function agentOf(n, list) {
  const to = n.action?.args?.terminal ?? n.action?.args?.agent ?? null;
  const named = (a) => a.title && (a.title === n.title || a.title === n.body);
  return list.find((a) => a.address === to) ?? list.find(named) ?? null;
}

const queued = (now = Date.now()) => (shared(PA.key) ?? []).filter((e) => e.until > now);

/** Herdr's notification: into the PA queue, then gone. */
class Toast {
  render(cx, p) {
    if (!this.sent) {
      this.sent = true;
      cx.timer.after(0, () => {
        const agent = agentOf(p, agents());
        // a timeout of 0 (until dismissed, as far as a toast can tell) gets the long stay
        const long = p.level === "error" || p.level === "warning" || agent?.status === "blocked" || p.timeout === 0;
        const stay = p.timeout > 0 ? p.timeout : long ? STAY_MS.long : STAY_MS.short;
        const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: p.title ?? "", body: p.body ?? "",
          level: p.level ?? "info", action: p.action ?? null, until: Date.now() + stay };
        setShared(PA.key, [entry, ...queued()].slice(0, PA.keep));
        closeOverlay(p.overlay);
      });
    }
    return div();
  }
}

/** The PA window: the queued announcements, until none are left or a newer window takes over. It marks itself up in
 *  PA.open, for the board and for any older window to see. */
class Board {
  closed(p) {
    if (shared(PA.open) === p.overlay) setShared(PA.open, null);
  }

  render(cx, p) {
    if (!this.marked) {
      this.marked = true;
      cx.timer.after(0, () => { setShared(PA.open, p.overlay); this.up = true; });
    }
    // a newer PA window has opened (the board moved it): this one goes
    const newest = shared(PA.open);
    if (this.up && newest && newest !== p.overlay) {
      if (!this.closing) { this.closing = true; cx.timer.after(0, () => closeOverlay(p.overlay)); }
      return div();
    }
    const now = Date.now(), all = shared(PA.key) ?? [], live = all.filter((e) => e.until > now);
    if (live.length !== all.length) cx.timer.after(0, () => setShared(PA.key, queued()));
    if (!live.length) {
      if (!this.closing) { this.closing = true; cx.timer.after(0, () => closeOverlay(p.overlay)); }
      return div();
    }
    // wake when the next one's time is up
    const next = Math.min(...live.map((e) => e.until));
    if (this.wake !== next) {
      this.wake = next;
      cx.timer.after(next - now + 30, (cx) => cx.notify());
    }
    const list = agents(), codes = trainCodes(list), width = this.width ?? 372;
    // what needs the person first (a stop or a failure), then the newest
    const shown = live.map((e, i) => ({ e, i, alarm: Boolean(this.kindOf(e, list).alarm) }))
      .sort((a, b) => b.alarm - a.alarm || a.i - b.i).slice(0, PA.rows).map((x) => x.e);
    const rod = (side) => div().absolute().top(0)[side](ROD.inset).w(ROD.w).h(ROD.h).bg(INK.rod);
    return v_flex()
      .id("root")
      .w_full()
      .relative()
      .pt(ROD.h)
      // a press here isn't a drag: the board hangs where it hangs
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_size_change((s, cx) => {
        if (s.width === this.width) return;
        this.width = s.width;
        cx.notify();
      })
      .child(rod("left"))
      .child(rod("right"))
      .child(v_flex().w_full().bg(INK.panel).border_2().border_color(shown.some((e) => this.kindOf(e, list).alarm) ? INK.alarm : INK.bezel)
        .rounded(6).overflow_hidden()
        .children(shown.map((e, i) => this.row(e, i, list, codes, width))));
  }

  kindOf(e, list) {
    const agent = agentOf(e, list);
    return KIND[agent?.status === "blocked" ? "stop" : agent?.status === "done" ? "arrived" : LEVEL[e.level] ?? "notice"];
  }

  row(e, i, list, codes, width) {
    const agent = agentOf(e, list), code = agent ? codes.get(agent.address) : null, kind = this.kindOf(e, list);
    const login = LOGIN.exec(e.body);
    const command = login ? `hc machine login ${login[1]}` : null;
    const said = [e.title, e.body].filter(Boolean).join("  ·  ");
    const line = login ? `${login[1]} NEEDS A LOGIN` : code ? `${code} ${said}` : said;

    const room = width - 4 - ICON_W - PAD * 2, textW = widthOf(line) + 8;
    const text = div().absolute().top(7).left(PAD).whitespace_nowrap().text_size(TEXT).line_height(`${TEXT + 4}px`).text_color(kind.ink).child(line);
    // a line longer than the board runs to its end and back, a beat at each end from the easing
    const moving = textW > room
      ? div().id(`run-${e.id}-${room}`).absolute().top(0).left(0).h_full()
        .loop("left", { from: 0, to: room - textW, period: Math.max(4000, Math.round(((textW - room) * 2 / SCROLL_PX_S) * 1000) + 2400) })
        .child(text)
      : text;
    const speaker = svg(`${HERE}/assets/pa.svg`).size(18).text_color(kind.ink);
    const dismiss = () => setShared(PA.key, queued().filter((x) => x.id !== e.id));

    return h_flex().id(`pa-${e.id}`).w_full().h(ROW_H).flex_none().cursor_pointer()
      .when(i > 0, (el) => el.border_t_1().border_color(INK.bezel))
      .on_click(() => {
        if (e.action?.name) run(e.action.name, e.action.args ?? {});
        dismiss();
      })
      .child(v_flex().w(ICON_W).h_full().flex_none().items_center().justify_center().gap(2).bg(INK.board).border_r_1().border_color(INK.bezel)
        .child(kind.alarm ? div().loop("opacity", { from: 0.2, to: 1, period: 700 }).child(speaker) : speaker)
        .child(div().text_size(11).text_color(INK.creamDim).child("PA")))
      .child(div().flex_1().min_w(0).h_full().relative().overflow_hidden()
        .child(moving)
        // the dot matrix over the light, then what kind of announcement it is under it
        .child(image(`${HERE}/assets/led-dots.png`).absolute().top(0).left(0).w(DOTS.w).h(DOTS.h))
        .child(h_flex().absolute().left(PAD).bottom(3).gap(8).items_center()
          .child(div().text_size(11).text_color(INK.creamDim).child(kind.word))
          .when(Boolean(command), (el) => el
            .child(div().text_size(11).text_color(INK.creamDim).child(command))
            .child(div().id(`pa-copy-${e.id}`).px(5).rounded(2).bg(INK.key).text_size(11).text_color(INK.cream)
              .hover((s) => s.bg(INK.bezel))
              .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(command); this.copied = e.id; cx.notify(); })
              .child(this.copied === e.id ? "COPIED" : "COPY")))));
  }
}

export default class DispatchToast extends View {
  async close() {
    this.role?.closed?.(props() ?? {});
  }

  render(cx) {
    const p = props() ?? {};
    if (!this.role) this.role = p.role === "pa" ? new Board() : new Toast();
    return this.role.render(cx, p);
  }
}
