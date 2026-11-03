// The bottom hull edge: the spaces as compartment plates riveted on the hull (the shown one brass, the rest
// steel, each with its status lamp), + for a new space; Settings (a gold dot when an update is ready) and
// Add machine at the right. Click a plate to go there, right-click for its menu.
import { div, image, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, run, openOverlay, updates } from "herdr";
import { framed } from "../kit/frame.js";
import { ART, INK } from "../state.js";

export function brassPlate(content, lit) {
  return framed(lit ? "brass" : "steel", content);
}

export class Deck {
  plate(id, lit, content) {
    return div().id(id).flex_none().h(30).text_size(12)
      .child(brassPlate(h_flex().h_full().px(8).gap(8).items_center()
        .text_color(lit ? INK.brassText : INK.steelText).child(content), lit));
  }

  render() {
    const sp = spaces();
    const tag = (s) => h_flex().gap(8).items_center()
      .child(image(`${ART}/lamp-${s.status ?? "idle"}.gif`).size(10))
      .child(div().max_w(150).truncate().child(s.name));
    const rooms = sp.map((s) => this.plate(`sp-${s.id}`, s.active, tag(s)).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => run("space.select", { id: s.id }))
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } });
      }));
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, icon, label, action, dot) => this.plate(id, false, h_flex().gap(6).items_center()
      .child(svg(`mods/workspace-chrome/${icon}.svg`).size(14)).child(label)
      .when(dot, (el) => el.child(div().size(6).bg(INK.gold))))
      .on_mouse_down("left", stop).on_click(action);
    return h_flex().size_full().items_center().gap(8).px(10)
      .child(div().flex_none().text_size(12).text_color(INK.steelText).child("COMPARTMENTS"))
      .child(h_flex().id("rooms").flex_1().min_w(0).gap(8).items_center().overflow_x_scrollbar()
        .children(rooms)
        .child(this.plate("space-new", false, div().child("+")).on_mouse_down("left", stop).on_click(() => run("space.new"))))
      .child(button("settings", "settings", "Settings", () => run("app.settings"), Boolean(updates().app.ready)))
      .child(button("machine", "plus", "Machine", () => run("mod.open", { name: "machine-add" }), false));
  }
}
