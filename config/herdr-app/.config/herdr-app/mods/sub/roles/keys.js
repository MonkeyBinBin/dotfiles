// The keys in force right now, read live from keys(): the shown layout's over the global ones (a global key it rebinds isn't
// listed), the terminal's apart. Runs of numbered keys fold into one row. Type to filter, Esc to close. Change them in keys.json.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { keys, setShared, shared } from "herdr";
import { framed } from "../kit/frame.js";
import { INK } from "../state.js";

const GROUPS = [
  ["SUB", /^sub-tabs\.|^layout\.toggle/],
  ["AGENTS", /^agent\./],
  ["TABS", /^tab\./],
  ["SPACES", /^space\./],
  ["PANES", /^pane\./],
  ["TERMINAL", /^terminal\.|^send:/],
  ["APP", /./],
];

const NAMES = {
  "sub-tabs.files": "Files panel", "sub-tabs.changes": "Changes panel", "sub-tabs.log": "Captain's log", "sub-tabs.radio": "Radio",
  "sub-tabs.keys": "This list", "sub-tabs.new": "New menu (agents)", "sub-tabs.agent": "Go to contact C", "layout.toggle:helm": "Right column",
  "agent.next": "Next agent", "agent.prev": "Previous agent",
  "tab.new": "New tab", "tab.close": "Close tab", "tab.next": "Next tab", "tab.prev": "Previous tab", "tab.rename": "Rename tab", "tab.select:": "Go to tab ",
  "space.new": "New space", "space.next": "Next space", "space.prev": "Previous space", "space.rename": "Rename space", "space.select:": "Go to space ",
  "pane.split:right": "Split right", "pane.split:down": "Split down", "pane.close": "Close pane", "pane.zoom": "Zoom pane",
  "pane.go:left": "Focus left", "pane.go:right": "Focus right", "pane.go:up": "Focus up", "pane.go:down": "Focus down",
  "pane.swap:left": "Swap left", "pane.swap:right": "Swap right", "pane.swap:up": "Swap up", "pane.swap:down": "Swap down",
  "terminal.copy": "Copy", "terminal.paste": "Paste", "terminal.paste_image": "Paste image",
  "send:\u001bb": "Word left", "send:\u001bf": "Word right", "send:\u0017": "Delete word", "send:\u0001": "Line start", "send:\u0005": "Line end", "send:\u0015": "Delete line",
  "app.quit": "Quit", "app.hide": "Hide", "app.hide_others": "Hide others", "app.palette": "Command palette", "app.settings": "Settings", "app.help": "Herdr's own key list",
  "app.zoom_in": "Zoom in", "app.zoom_out": "Zoom out", "app.zoom_reset": "Reset zoom", "layout.switch": "Next layout", "mod.open:picker": "Find",
};

const GLYPH = { cmd: "⌘", shift: "⇧", alt: "⌥", ctrl: "⌃", enter: "↩", left: "←", right: "→", up: "↑", down: "↓", backspace: "⌫", tab: "⇥", escape: "⎋" };
const ORDER = ["ctrl", "alt", "shift", "cmd"];

/** "cmd-shift-e" -> "⌃⌥⇧⌘E". The key itself is last and may be "-". */
function glyphs(keys) {
  const parts = keys.split("-"), last = parts.pop() || "-";
  const held = ORDER.filter((m) => parts.includes(m)).map((m) => GLYPH[m]).join("");
  return held + (GLYPH[last] ?? (last.length === 1 ? last.toUpperCase() : last[0].toUpperCase() + last.slice(1)));
}

function label(action) {
  if (NAMES[action]) return NAMES[action];
  if (action.startsWith("send:")) return `Type ${JSON.stringify(action.slice(5))}`;
  const [name, arg] = action.split(":"), words = name.replace(/[._-]/g, " ");
  return (arg ? `${words} ${arg}` : words).replace(/^./, (c) => c.toUpperCase());
}

/** The rows a filter keeps. Whole words win, so "pane" finds the pane commands and not "Files panel"; failing those, the start of a
 *  word, so "pan" finds both; failing those, anywhere, which is what finds a typed ⌘. */
function matching(rows, filter) {
  const terms = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return rows;
  const words = (r) => `${r.label} ${r.action} ${r.raw}`.toLowerCase().split(/[^a-z0-9]+/);
  const whole = rows.filter((r) => terms.every((t) => words(r).includes(t)));
  if (whole.length) return whole;
  const starts = rows.filter((r) => terms.every((t) => words(r).some((w) => w.startsWith(t))));
  if (starts.length) return starts;
  return rows.filter((r) => terms.every((t) => `${r.label} ${r.keys}`.toLowerCase().includes(t)));
}

/** The bindings in force in the shown layout, each { keys, raw, action, label }, with numbered runs folded. */
function inForce(layout) {
  const all = keys(), own = all.filter((k) => k.section === `layout:${layout}`), taken = new Set(own.map((k) => k.keys));
  const rows = [...own, ...all.filter((k) => k.section === "global" && !taken.has(k.keys)), ...all.filter((k) => k.section === "terminal")];
  const out = [], runs = new Map();
  for (const k of rows) {
    // cmd-3 -> tab.select:3, cmd-alt-3 -> sub-tabs.agent3: the same digit at the end of both
    const digit = /([1-9])$/.exec(k.keys)?.[1], action = digit && k.action.endsWith(digit) ? k.action.slice(0, -1) : null;
    if (!action) { out.push({ keys: glyphs(k.keys), raw: k.keys, action: k.action, label: label(k.action) }); continue; }
    const run = runs.get(action) ?? { digits: [], base: k.keys.slice(0, -1), action };
    if (!runs.has(action)) { runs.set(action, run); out.push(run); }
    run.digits.push(Number(digit));
  }
  return out.map((r) => {
    if (!r.digits) return r;
    const a = Math.min(...r.digits), b = Math.max(...r.digits), span = a === b ? `${a}` : `${a}-${b}`;
    return { keys: `${glyphs(`${r.base}x`).slice(0, -1)}${span}`, raw: r.base, action: r.action, label: `${label(r.action)}${span}` };
  });
}

export class KeyList {
  constructor(cx) {
    this.filter = "";
    this.input = InputState.new({ placeholder: "Type to filter…" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); cx.notify(); });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
  }

  close() {
    setShared("sub.keys.open", null);
  }

  group(name, rows) {
    return v_flex().gap(2).flex_none()
      .child(div().pb(2).text_color(INK.gold).child(name))
      .child(div().h(1).w_full().bg(INK.rule).mb(2))
      .children(rows.map((r) => h_flex().h(20).gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().text_color(INK.hi).child(r.label))
        .child(div().flex_none().text_color(INK.mid).child(r.keys))));
  }

  render() {
    const left = new Set(), rows = matching(inForce(shared("layout") ?? "sub"), this.filter);
    const groups = GROUPS.map(([name, re]) => {
      const mine = rows.filter((r) => !left.has(r) && re.test(r.action));
      mine.forEach((r) => left.add(r));
      return [name, mine];
    }).filter(([, mine]) => mine.length);
    // two columns, filled in order, about even
    const size = (g) => g[1].length + 3, half = groups.reduce((n, g) => n + size(g), 0) / 2;
    const columns = [[], []];
    let used = 0;
    for (const g of groups) {
      columns[used < half ? 0 : 1].push(g);
      used += size(g);
    }
    return framed("brass", v_flex().size_full().p(14).gap(10).bg(INK.glass).text_size(12)
      .child(h_flex().justify_between().items_center()
        .child(h_flex().gap(10).items_center()
          .child(svg("mods/sub/icons/keys.svg").size(24).flex_none().text_color(INK.gold))
          .child(div().text_size(22).text_color(INK.hi).child("KEYS")))
        .child(div().text_color(INK.dim).child("Esc to close · keys.json to change")))
      .child(div().flex_none().h(36).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .child(framed("well", div().size_full().px(8).flex().items_center().child(Input.new(this.input).h_full().w_full().text_size(12).text_color(INK.hi)))))
      .child(div().flex_1().min_h(0).child(framed("well", h_flex().id("keys-list").size_full().items_start().gap(24).p(10).overflow_y_scrollbar()
        .when(!rows.length, (el) => el.child(div().text_color(INK.dim).child("No key matches.")))
        .children(columns.filter((c) => c.length).map((c) => v_flex().flex_1().min_w(0).gap(12).children(c.map(([name, mine]) => this.group(name, mine))))))))
      , { fill: INK.glass });
  }
}
