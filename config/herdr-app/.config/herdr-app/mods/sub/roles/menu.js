// A sub's right-click menu (state.js subMenu()), on a steel plate: watch it through the periscope, go to it, radio it, pin or
// unpin it, rename its tab, close its pane. Props: { terminal, overlay }.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, panes, run, closeOverlay } from "herdr";
import { framed } from "../kit/frame.js";
import { INK, titleOf, periscope, goTo, radio } from "../state.js";

export class SubMenu {
  render(cx, p) {
    const { terminal, overlay } = p;
    const a = agents().find((x) => x.address === terminal);
    const pane = panes().find((x) => x.terminal === terminal)?.pane;
    // its sub went away while the menu was open: put the menu away too
    if (!a && !pane) {
      cx.timer.after(1, () => closeOverlay(overlay));
      return div();
    }
    const items = [
      ["Periscope", () => periscope(terminal)],
      ["Go to", () => goTo(terminal)],
      ...(a ? [["Radio", () => radio(terminal)]] : []),
      [a?.pinned ? "Unpin" : "Pin to top", () => run("terminal.pin", { terminal, pinned: !a?.pinned })],
      ...(a?.tab ? [["Rename tab", () => run("tab.rename", { id: a.tab })]] : []),
      ["Close", () => (pane ? run("pane.close", { pane }) : run("terminal.kill", { terminal })), true],
    ];
    return framed("steel", v_flex().size_full().p(4).gap(2).text_size(12).bg(INK.glass)
      .child(div().px(8).pt(4).pb(6).truncate().text_color(INK.dim).child(a ? titleOf(a) : terminal))
      .children(items.map(([label, action, danger], i) => h_flex().id(`m-${i}`).h(26).px(8).items_center()
        .text_color(danger ? INK.redSoft : INK.hi).hover((s) => s.bg("#0d3f28"))
        .on_click(() => {
          closeOverlay(overlay);
          action();
        })
        .child(label))), { fill: INK.glass });
  }
}
