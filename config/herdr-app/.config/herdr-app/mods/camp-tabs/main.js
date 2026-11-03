// The camp's tab bar: Herdr's tabs mod (cloned from 0.1.12), reskinned in the camp kit: a riveted wooden plaque
// with each tab and button a wooden plate (the shown tab lit), and the quest board's status seals. Behaviour is unchanged: select, drag to move, double-click to rename, right-click menu,
// + menu, side panel buttons remembered per space.
import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { framed, plate, WOOD } from "./kit/frame.js";
import { spaces, panes, run, openOverlay, theme, window, shared, layout, settings } from "herdr";

const SLOT = "#1d1b2f";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Tabs extends View {
  init() {
    this.pressed = null;
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
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
    // small wooden plates
    const button = (id, label, action) => div().id(id).flex_none().text_color(WOOD.dim).hover(s => s.text_color(WOOD.text))
      .on_mouse_down("left", stop).on_click(action)
      .child(plate(div().size(22).flex().items_center().justify_center().child(label)));
    const item = (c, i) => {
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      const name = /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      // a wooden plate; the shown tab is the lit one
      return div().id(`tab-${c.id}`).flex_none().text_size(12)
        .text_color(c.active ? WOOD.text : WOOD.dim).hover(s => s.text_color(WOOD.text))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .child(plate(h_flex().h(26).px(8).gap(6).items_center()
          .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(WOOD.text) : image(program.icon).size(14)))
          .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
          .when(Boolean(c.status), el => el.child(div().size(18).flex_none().flex().items_center().justify_center().bg(SLOT)
            .child(image(`mods/camp/assets/icon-${c.status}.gif`).size(16))))
          .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(WOOD.dim).hover(s => s.text_color(WOOD.text)).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12)))),
          { lit: c.active }));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      // the camp puts the window buttons inside this bar, after the hero window (its width plus the root's padding and gap)
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - ((find(root, "brand")?.size?.px ?? 0) + 16))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return div().id(`panel-${id}`).flex_none().text_size(12).text_color(on ? WOOD.text : WOOD.dim)
        .hover(s => s.text_color(WOOD.text)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(plate(h_flex().h(22).px(8).gap(5).items_center().child(svg(icon).size(14)).child(label), { lit: on }));
    };
    // a riveted wooden plaque, the tabs as plates on it
    return framed("plaque", h_flex().size_full().min_w(0).pl(Math.max(0, lightsPadding - 12)).gap(6).items_center()
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().overflow_x_scrollbar().gap(6).children(shown.map(item)))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/camp-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/camp-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/camp-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close")))));
  }
}
