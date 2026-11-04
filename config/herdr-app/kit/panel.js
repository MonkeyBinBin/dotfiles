// The side panels' parts, in the console's materials: the inks on their dark glass, sunken windows, keys, the steel
// plate along the top.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { framed } from "./frame.js";
import { metal, PAINT } from "./metal.js";

export const INK = {
  hi: "#b8ffd8", mid: "#5cdc94", dim: "#4f9f76", faint: "#2f7f56", rule: "#0d3f28", pick: "#0d3f28", hover: "#0a2a20",
  add: "#5cff9a", del: "#ff7a6a", gold: "#ffd25a", brass: "#2a1a06", paint: PAINT, hunk: "#0d2a2e", hunkText: "#6aa0c0",
};

// a sunken window of dark glass, `h` tall. Without `h` it takes the room left, and draws its edge itself: a virtual list
// needs its parent's flex height directly, with no frame in between.
const RIMS = {
  t: (el) => el.top(0).left(0).right(0).h(2), l: (el) => el.top(0).left(0).bottom(0).w(2),
  b: (el) => el.bottom(0).left(0).right(0).h(2), r: (el) => el.top(0).right(0).bottom(0).w(2),
};
const rim = (side, color) => RIMS[side](div().absolute().bg(color));
export const well = (content, h) => (h === undefined
  ? div().w_full().min_w(0).relative().flex_1().min_h(0).p(4).bg("#041012").child(content)
    .child(rim("t", "#010405")).child(rim("l", "#010405")).child(rim("b", "#65787c")).child(rim("r", "#65787c"))
  : div().w_full().min_w(0).relative().h(h).flex_none().child(framed("well", content)));

// a key on the panel: brass while lit
export const key = (id, label, lit, h, click) => div().id(id).flex_none().h(h).text_size(12).active((s) => s.opacity(0.8))
  .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => click(cx))
  .child(framed(lit ? "brass" : "key", h_flex().h_full().px(10).items_center().justify_center().text_color(lit ? INK.brass : PAINT).child(label)));

// the steel plate along a panel's top, screwed down at its corners
export const plate = (content) => div().w_full().h(54).flex_none().child(framed("panel", div().relative().size_full().child(metal("metal-panel"))
  .child(h_flex().relative().size_full().px(2).gap(6).items_center().child(content))));
