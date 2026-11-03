// The periscope's bar, over the agent's terminal in the periscope window (state.js periscope()): a brass plate
// with its status lamp, contact number, title, tool and status; GO TO jumps to its pane (or keeps it as a tab
// when it has none) and closes the periscope, x closes it. Drag the bar to move the window.
// Props: { terminal, overlay }.
import { div, image, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, terminals, panes, run, closeOverlay } from "herdr";
import { framed } from "../kit/frame.js";
import { ART, INK, WORD, titleOf, toolName, contacts } from "../state.js";

const TEXT = "#2a1a06", FAINT = "#6a4c1a";

export class Scope {
  button(id, child, action) {
    return div().id(id).px(8).py(2).text_color(FAINT).hover((s) => s.text_color(TEXT))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(action).child(child);
  }

  render(_cx, p) {
    const { terminal, overlay } = p;
    const list = agents(), a = list.find((x) => x.address === terminal);
    const k = terminals().find((t) => t.address === terminal);
    const status = a?.status ?? k?.status ?? "idle";
    const home = panes().some((x) => x.terminal === terminal);
    const title = a ? titleOf(a) : k?.name || k?.program?.name || terminal;
    return framed("brass", h_flex().size_full().px(10).gap(10).items_center().text_size(12).text_color(TEXT)
      .child(div().flex_none().text_color(FAINT).child("PERISCOPE"))
      .child(image(`${ART}/lamp-${status}.gif`).size(10).flex_none())
      .when(Boolean(a), (el) => el.child(div().flex_none().text_color(FAINT).child(contacts(list).get(terminal))))
      .child(div().flex_1().min_w(0).truncate().child(title))
      .when(Boolean(a), (el) => el.child(div().flex_none().text_color(FAINT).child(`${toolName(a)} · ${a.space_name}`)))
      .child(div().flex_none().child(WORD[status] ?? status))
      .child(this.button("go", home ? "GO TO >" : "KEEP >", () => {
        run(home ? "pane.focus" : "terminal.keep", { terminal });
        closeOverlay(overlay);
      }))
      .child(this.button("close", svg("mods/pane/close.svg").size(12), () => closeOverlay(overlay))));
  }
}
