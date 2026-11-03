// The camp kit: shared by every camp mod, copied into each as kit/ by scripts/herdr-camp/install.sh
// (Herdr won't let a mod import from another mod's folder).
//
// framed(kind, content): a nine-slice pixel frame round content, from the kits bake.mjs slices out of the
// camp/frame effect (frames.js): corner PNGs at the four corners, each side rebuilt from its color profile as
// 2 px lines, so a side stretches to any length and stays crisp. The content gets the fill and sits inside.
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { FRAMES } from "./frames.js";

const S = 2; // native px -> logical px

// The camp's design system: every panel is a riveted wooden plaque (framed("plaque")), anything you click is a
// wooden plate with a lit bevel (plate()), papers (quest notes) are parchment pinned to the wood (framed("note")).
export const WOOD = {
  fill: "#2e1c10", // inside a plaque
  plate: "#4a2c14", plateLit: "#8a5a34", // a plate, and the shown / pressed one
  bevel: "#6a421e", bevelLit: "#c8955a", // a plate's lit top edge
  ink: "#140c08", // outlines
  text: "#fff6dc", dim: "#c8b088", faint: "#8a6a48", // text on wood
  gold: "#e8b060",
};

/** A wooden plate: an outlined slab with a lit bevel along its top; `lit` for the shown or active one. */
export function plate(content, { lit = false } = {}) {
  return v_flex().border(2).border_color(WOOD.ink).bg(lit ? WOOD.plateLit : WOOD.plate)
    .child(div().h(2).w_full().flex_none().bg(lit ? WOOD.bevelLit : WOOD.bevel))
    .child(content);
}
const ART = "mods/camp/assets";

export function framed(kind, content, { fill } = {}) {
  const F = FRAMES[kind], X = F.cx * S, Y = F.cy * S;
  const rows = (colors) => v_flex().size_full().children(colors.map((c) => div().w_full().h(S).flex_none().bg(c)));
  const cols = (colors) => h_flex().size_full().children(colors.map((c) => div().h_full().w(S).flex_none().bg(c)));
  const corner = (n) => image(`${ART}/frame-${kind}-${n}.png`).w(X).h(Y);
  return div().relative().size_full().bg(fill ?? F.fill)
    .child(div().size_full().pl(X).pr(X).pt(Y).pb(Y).child(content))
    .child(div().absolute().top(0).left(X).right(X).h(Y).child(rows(F.top)))
    .child(div().absolute().bottom(0).left(X).right(X).h(Y).child(rows(F.bottom)))
    .child(div().absolute().left(0).top(Y).bottom(Y).w(X).child(cols(F.left)))
    .child(div().absolute().right(0).top(Y).bottom(Y).w(X).child(cols(F.right)))
    .child(div().absolute().top(0).left(0).child(corner("tl")))
    .child(div().absolute().top(0).right(0).child(corner("tr")))
    .child(div().absolute().bottom(0).left(0).child(corner("bl")))
    .child(div().absolute().bottom(0).right(0).child(corner("br")));
}
