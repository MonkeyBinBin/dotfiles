// A pane's header, inside its porthole: a status lamp, the space and the agent's title (or the terminal's),
// the tool and how long it has been under on the right; on hover, buttons to split, zoom and close. Phosphor on
// the pane's dark glass, a thin rule under it. Props from the app: { pane, terminal }.
import { div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, agents, run } from "herdr";
import { ART, INK, since, tabsById, underSince } from "../state.js";

export class PaneHeader {
  constructor() {
    this.hovered = false;
  }

  button(id, icon, command, args) {
    return div().id(id).p(3).text_color(INK.dim).hover((s) => s.text_color(INK.hi))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/pane/${icon}.svg`).size(14));
  }

  render(_cx, p) {
    const me = panes().find((x) => x.pane === p.pane);
    if (!me) return div();
    const pane = me.pane, prog = me.program, on = me.focused;
    const agent = agents().find((a) => a.pane === pane);
    const title = agent?.title || me.title || prog?.name || "shell";
    const tab = agent && tabsById().get(agent.tab);
    const clock = agent?.status === "working" ? since(underSince(agent, tabsById())) : "";
    const right = [((prog?.agent || prog?.shell) && prog.name) || "", clock].filter(Boolean).join(" · ");
    return h_flex().id(`ph-${pane}`).size_full().px(14).gap(8).items_center().text_size(12)
      .bg(INK.glass).border_b(1).border_color(INK.rule)
      .on_hover((hovered, cx) => {
        this.hovered = hovered;
        cx.notify();
      })
      .on_click(() => run("pane.focus", { pane }))
      .child(image(`${ART}/lamp-${me.status ?? "idle"}.gif`).size(10).flex_none())
      .child(div().flex_none().text_color(on ? INK.mid : INK.dim).child(agent?.space_name ?? tab?.name ?? ""))
      .child(div().flex_none().text_color(INK.dim).child("/"))
      .child(div().flex_1().min_w(0).truncate().text_color(on ? INK.hi : INK.dim).child(title))
      .when(!this.hovered && Boolean(right), (el) => el.child(div().flex_none().text_color(on ? INK.mid : INK.dim).child(right)))
      .when(this.hovered, (el) => el
        .child(this.button(`pb-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(`pb-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(`pb-z-${pane}`, me.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(`pb-x-${pane}`, "close", "pane.close", { pane })));
  }
}
