// The top of the sidebar: That Monkey's portrait (dozing, startled or idle with the camp), the search and
// sidebar buttons. Drag it to move the window.
import { div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, theme, run, window, shared, setShared } from "herdr";
import { ART, baseMood, sidebarNarrow, sidebarWidth } from "../state.js";

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const narrow = sidebarNarrow();
  if (!narrow) setShared("sidebar.width", sidebarWidth());
  setShared("sidebar.collapsed", !narrow);
  run("layout.resize", { id: "sidebar", px: narrow ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

export class Crest {
  button(t, id, icon, action) {
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().text_color(t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action)
      .child(svg(`mods/workspace-chrome/${icon}.svg`).size(15));
  }

  render() {
    const t = theme(), mood = baseMood(agents()), narrow = sidebarNarrow();
    const mac = window()?.platform === "macos" && !window()?.fullscreen;
    if (narrow) {
      return v_flex().size_full().bg(t.chrome).items_center().justify_end().pb(8)
        .when(!mac, (el) => el.child(this.button(t, "sidebar-toggle", "sidebar", toggleSidebar)));
    }
    return h_flex().size_full().bg(t.chrome).pr(10).gap(8).items_center().border_b(2).border_color(t.border)
      .pl(mac ? 76 : 10)
      .child(div().id("crest").flex_none().child(image(`${ART}/crest-${mood}.gif`).w(72).h(52)))
      .child(div().flex_1())
      .child(this.button(t, "search", "search", () => run("mod.open", { name: "picker" })))
      .child(this.button(t, "sidebar-toggle", "sidebar", toggleSidebar));
  }
}
