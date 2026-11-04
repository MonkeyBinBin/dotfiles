// The sub's tab bar along the top hull edge: Herdr's tabs mod (cloned from 0.1.12), each tab a stencil plate
// riveted on the hull (the shown one brass, the rest steel) with its status lamp, + and the side panel buttons as
// plates too, and a brass porthole badge at the right end (click: the captain's log). Behaviour is unchanged: select, drag to move,
// double-click to rename, right-click menu, + menu, side panel buttons remembered per space. An unnamed tab goes by its
// agent's title. Key commands (keys.json): sub-tabs.files, .changes, .log, .radio, .keys and .agent1-9, which goes to contact C1-C9.
import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { battleLight, onAlert } from "./kit/battle-light.js";
import { byContact } from "./kit/contacts.js";
import { framed } from "./kit/frame.js";
import { sprite } from "./kit/sprite.js";
import { agents, spaces, panes, run, openOverlay, closeOverlay, shared, setShared, theme, window, layout, settings, nextCommand } from "herdr";

const ART = "mods/sub/assets";
// the side panels the sub always offers (the app's own "workspace.panels" comes from its welcome screen)
const PANELS = ["files", "changes"];
const INK = { brass: "#2a1a06", steel: "#8ab8b4", steelHi: "#d8f0ec" };
// a plate riveted on the hull: brass when lit (the shown tab, an open panel), steel otherwise
const plate = (content, { lit = false } = {}) => framed(lit ? "brass" : "steel", content);

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Tabs extends View {
  init(_props, cx) {
    this.pressed = null;
    this.open = {};
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
    cx.spawn(async () => {
      for (;;) this.command(await nextCommand());
    });
  }

  command(c) {
    if (PANELS.includes(c)) return this.togglePanel(c);
    if (c === "log") return this.toggle("log", 680, 460);
    if (c === "radio") return this.toggle("radio", 560, 430);
    if (c === "keys") return this.toggle("keys", 780, 600);
    const contact = /^agent([1-9])$/.exec(c);
    const agent = contact && byContact(agents())[Number(contact[1]) - 1];
    if (agent) run("agent.focus", { terminal: agent.address });
  }

  togglePanel(id) {
    const root = layout(), panel = find(root, "panel");
    if (panel && !panel.hidden && find(root, "panel-body")?.active === id) return run("layout.hide", { id: "panel" });
    run("layout.select", { stack: "panel-body", child: id });
    run("layout.show", { id: "panel" });
  }

  // A dialog role of the sub, opened or closed. Open while it says so (it clears "sub.<role>.open" as it goes, Esc included).
  // The id must also be this run's: shared state outlives the app, and a quit may not get to clear it.
  toggle(role, width, height) {
    const key = `sub.${role}.open`;
    if (this.open[role] && shared(key) === this.open[role]) return closeOverlay(this.open[role]);
    this.open[role] = openOverlay({ mod: "sub", kind: "dialog", width, height, frame: "none", props: { role } });
    setShared(key, this.open[role]);
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
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
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    const t = theme();
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const stop = (_e, cx) => cx.stop_propagation();
    // small steel plates
    const button = (id, label, action) => div().id(id).flex_none().h(30).text_color(INK.steel).hover(s => s.text_color(INK.steelHi))
      .on_mouse_down("left", stop).on_click(action)
      .child(plate(div().w(30).h_full().flex().items_center().justify_center().child(label)));
    const item = (c, i) => {
      const agentPane = panes().find(p => p.tab === c.id && p.program?.agent);
      const program = agentPane?.program ?? panes().find(p => p.tab === c.id)?.program;
      // An unnamed tab goes by its agent's title, then its program (Herdr numbers them otherwise, and the plate shows the
      // number already). The + menu names a tab after the agent it starts, which says no more than its program does.
      const generic = c.named === false || /^tb\d+$/.test(c.name) || c.name === String(i + 1)
        || c.name === program?.name || c.name.startsWith(`${program?.name} (`);
      const name = generic ? agentPane?.title || program?.name || "Terminal" : c.name;
      // a stencil plate with its number; the shown tab is the brass one
      return div().id(`tab-${c.id}`).flex_none().h(30).text_size(12)
        .text_color(c.active ? INK.brass : INK.steel).hover(s => s.text_color(c.active ? INK.brass : INK.steelHi))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "sub-menu", kind: "popup", width: 200, frame: "none", props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .child(plate(h_flex().h_full().pl(14).pr(12).gap(8).items_center()
          .child(div().flex_none().opacity(0.7).child(String(i + 1)))
          .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
          .child(sprite(`lamp-${c.status ?? "idle"}`, 10).flex_none())
          .when(c.active, el => el.child(div().id(`close-${c.id}`).opacity(0.7).hover(s => s.opacity(1)).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12)))),
          { lit: c.active }));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      // the window buttons sit on this bar's left end (less the root's side padding)
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - 12)
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = PANELS;
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return div().id(`panel-${id}`).flex_none().h(30).text_size(12).text_color(on ? INK.brass : INK.steel)
        .hover(s => s.text_color(on ? INK.brass : INK.steelHi)).on_mouse_down("left", stop)
        .on_click(() => this.togglePanel(id)).child(plate(h_flex().h_full().px(12).gap(6).items_center().child(svg(icon).size(14)).child(label), { lit: on }));
    };
    // plates riveted straight on the hull; at the right end a brass porthole badge, the captain's log
    const logBadge = div().id("log-badge").tooltip("Captain's log").flex_none().size(36).opacity(0.92).hover(s => s.opacity(1)).active(s => s.opacity(0.75))
      .on_mouse_down("left", stop)
      .on_click(() => this.toggle("log", 680, 460))
      .child(image(`${ART}/log-badge.png`).size_full());
    return h_flex().relative().size_full().min_w(0).pl(lightsPadding).gap(8).items_center()
      .when(onAlert(), el => el.child(battleLight()))
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      // + right behind the last tab, scrolling with the tabs: a scroller always fills its row, so outside it + would sit at the far end
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().overflow_x_scrollbar().gap(8).children(shown.map(item))
        .child(button("tab-new", "+", () => openOverlay({ mod: "sub-new-menu", kind: "popup", width: 250, frame: "none" }))))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/sub-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/sub-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/sub-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))))
      .child(logBadge);
  }
}
