// The bottom of the sidebar, on a wooden plaque like every camp panel: Settings (with a dot when an update is
// ready) and Add machine, the same as Herdr's own footer. On a narrow sidebar only the icons show.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run, updates } from "herdr";
import { sidebarNarrow } from "../state.js";
import { framed, WOOD } from "../kit/frame.js";

export class Footer {
  row(id, icon, label, narrow, action, dot) {
    return h_flex().id(id).h(22).px(4).gap(8).items_center().text_color(WOOD.dim).hover((s) => s.text_color(WOOD.text))
      .on_click(action)
      .child(svg(`mods/workspace-chrome/${icon}.svg`).size(14))
      .when(!narrow, (el) => el.child(label))
      .when(dot, (el) => el.child(div().size(6).bg(WOOD.gold)));
  }

  render() {
    const narrow = sidebarNarrow();
    return framed("plaque", v_flex().size_full().justify_center().gap(2).text_size(12)
      .child(this.row("settings", "settings", "Settings", narrow, () => run("app.settings"), Boolean(updates().app.ready)))
      .child(this.row("machine", "plus", "Add machine", narrow, () => run("mod.open", { name: "machine-add" }), false)));
  }
}
