// A pane's header as a wooden sign: the program's icon, the agent's name or the terminal's title, the folder,
// and the status seal; on hover, buttons to split, zoom and close. Props from the app: { pane, terminal }.
import { div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, run, home } from "herdr";
import { ART } from "../state.js";

const WOOD = { face: "#3b2416", lit: "#6a421e", edge: "#1a0f08", text: "#f3e9d2", dim: "#b9946a", hover: "#5a3520" };
const SLOT = "#1d1b2f";

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

export class PaneSign {
  constructor() {
    this.hovered = false;
  }

  button(id, icon, command, args) {
    return div().id(id).p(3).text_color(WOOD.dim).hover((s) => s.bg(WOOD.hover).text_color(WOOD.text))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/pane/${icon}.svg`).size(14));
  }

  render(_cx, p) {
    const me = panes().find((x) => x.pane === p.pane);
    if (!me) return div();
    const pane = me.pane, prog = me.program;
    const name = ((prog?.agent || prog?.shell) && prog.name) || me.title || prog?.name || "shell";
    const pic = prog?.icon ? (prog.tint ? svg(prog.icon).size(14).flex_none().text_color(WOOD.text) : image(prog.icon).w(14).h(14).flex_none()) : null;
    return h_flex().id(`sign-${pane}`).size_full().px(10).gap(8).items_center()
      .bg(WOOD.face).border_t(1).border_color(WOOD.lit).border_b(2).text_size(12)
      .on_hover((hovered, cx) => {
        this.hovered = hovered;
        cx.notify();
      })
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(260).text_color(WOOD.text).child(name))
      .child(div().flex_1().truncate().text_color(WOOD.dim).child(folder(me.cwd)))
      .when(Boolean(me.status), (el) => el.child(div().size(20).flex_none().flex().items_center().justify_center().bg(SLOT)
        .child(image(`${ART}/icon-${me.status}.gif`).size(16))))
      .when(this.hovered, (el) => el
        .child(this.button(`sb-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(`sb-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(`sb-z-${pane}`, me.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(`sb-x-${pane}`, "close", "pane.close", { pane })));
  }
}
