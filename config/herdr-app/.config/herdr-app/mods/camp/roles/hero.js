// The hero's status window, top left, on a riveted wooden plaque: That Monkey's portrait (dozing, startled or idle with the camp), his name
// and level, a segmented XP bar, his gold, and the search and sidebar buttons. Every quest that comes home (an
// agent finishing, counted by the band in shared "camp.wins", kept across restarts) is worth 10 gold and a
// quarter of a level. Drag it to move the window.
import { div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, theme, run, window, shared, setShared } from "herdr";
import { ART, baseMood, sidebarNarrow, sidebarWidth } from "../state.js";
import { framed } from "../kit/frame.js";

const PER_LEVEL = 4, GOLD = "#ffd23c";

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const narrow = sidebarNarrow();
  if (!narrow) setShared("sidebar.width", sidebarWidth());
  setShared("sidebar.collapsed", !narrow);
  run("layout.resize", { id: "sidebar", px: narrow ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

export class Hero {
  button(t, id, icon, action) {
    return div().id(id).size(22).flex_none().flex().items_center().justify_center().text_color("#c8b088")
      .hover((s) => s.bg("#4a2c14").text_color("#fff6dc"))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action)
      .child(svg(`mods/workspace-chrome/${icon}.svg`).size(14));
  }

  render() {
    const t = theme(), mood = baseMood(agents()), wins = shared("camp.wins") ?? 0;
    const level = 1 + Math.floor(wins / PER_LEVEL), into = wins % PER_LEVEL;
    const xp = h_flex().gap(2).p(2).border(2).border_color("#140c08").bg("#1a0f08").children(
      Array.from({ length: PER_LEVEL }, (_, i) => div().w(12).h(6).bg(i < into ? t.done : "#3b2416")));
    // a riveted wooden plaque
    return framed("plaque", h_flex().size_full().gap(8).items_center().text_size(12)
      .child(image(`${ART}/crest-${mood}.gif`).w(72).h(52).flex_none())
      .child(v_flex().flex_1().min_w(0).gap(5)
        .child(h_flex().gap(6).items_center()
          .child(div().truncate().text_color("#fff6dc").child("That Monkey"))
          .child(div().flex_none().px(4).bg(t.working).text_color(t.accent_foreground).child(`Lv${level}`)))
        .child(h_flex().gap(6).items_center()
          .child(xp)
          .child(image(`${ART}/coin.gif`).w(20).h(22).flex_none())
          .child(div().text_color(GOLD).child(String(wins * 10)))))
      .child(v_flex().gap(2)
        .child(this.button(t, "search", "search", () => run("mod.open", { name: "picker" })))
        .child(this.button(t, "sidebar-toggle", "sidebar", toggleSidebar))));
  }
}
