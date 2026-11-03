// A pane's header, inside its porthole: a status lamp, the space and the agent's title (or the terminal's),
// the tool and how long it has been under on the right; on hover, buttons to split, zoom and close. Phosphor on
// the pane's dark glass, a thin rule under it. It signals the agent's state:
//   working  air bubbles rising out along the right
//   blocked  a red beacon turning in place of the lamp, the glass pulsing red, SOS
//   done     a gold glint sweeping across, SURFACED
// Props from the app: { pane, terminal }.
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
    const st = me.status;
    // the state's light behind the text: a red pulse, or a gold glint sweeping across
    const alarm = div().absolute().top(0).left(0).size_full().bg("#4a100a").loop("opacity", { from: 0, to: 0.85, period: 1100 });
    const glint = div().absolute().top(0).h_full().w(90).bg("#ffd25a26").loop("left", { from: -120, to: 2400, period: 3200 });
    const word = st === "blocked" ? ["SOS", INK.red] : st === "done" ? ["SURFACED", INK.gold] : null;
    return h_flex().id(`ph-${pane}`).relative().overflow_hidden().size_full().px(14).gap(8).items_center().text_size(12)
      .bg(INK.glass).border_b(1).border_color(st === "blocked" ? "#5a1410" : INK.rule)
      .when(st === "blocked", (el) => el.child(alarm))
      .when(st === "done", (el) => el.child(glint))
      .on_hover((hovered, cx) => {
        this.hovered = hovered;
        cx.notify();
      })
      .on_click(() => run("pane.focus", { pane }))
      .child(st === "blocked" ? image(`${ART}/beacon.gif`).w(21).h(24).flex_none() : image(`${ART}/lamp-${st ?? "idle"}.gif`).size(10).flex_none())
      .child(div().flex_none().text_color(on ? INK.mid : INK.dim).child(agent?.space_name ?? tab?.name ?? ""))
      .child(div().flex_none().text_color(INK.dim).child("/"))
      .child(div().flex_1().min_w(0).truncate().text_color(on ? INK.hi : INK.dim).child(title))
      .when(!this.hovered && st === "working", (el) => el.child(image(`${ART}/bubbles.gif`).w(72).h(24).flex_none().opacity(0.8)))
      .when(!this.hovered && Boolean(word), (el) => el.child(div().flex_none().text_color(word[1]).child(word[0])))
      .when(!this.hovered && Boolean(right), (el) => el.child(div().flex_none().text_color(on ? INK.mid : INK.dim).child(right)))
      .when(this.hovered, (el) => el
        .child(this.button(`pb-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(`pb-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(`pb-z-${pane}`, me.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(`pb-x-${pane}`, "close", "pane.close", { pane })));
  }
}
