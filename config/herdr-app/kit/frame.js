// The sub's kit: copied into every sub mod as kit/ by scripts/herdr-sub/install.sh
// (Herdr won't let a mod import from another mod's folder).
//
// framed(kind, content): a nine-slice pixel frame round content, from the kits bake.mjs slices out of the
// sub/frame effect (frames.js): corner PNGs at the four corners, each side rebuilt from its color profile as
// 2 px lines, so a side stretches to any length and stays crisp. The content gets the fill and sits inside.
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { FRAMES } from "./frames.js";

const S = 2; // native px -> logical px

export function framed(kind, content, { fill } = {}) {
  const F = FRAMES[kind], X = F.cx * S, Y = F.cy * S;
  const rows = (colors) => v_flex().size_full().children(colors.map((c) => div().w_full().h(S).flex_none().bg(c)));
  const cols = (colors) => h_flex().size_full().children(colors.map((c) => div().h_full().w(S).flex_none().bg(c)));
  const corner = (n) => image(`${F.art}/frame-${kind}-${n}.png`).w(X).h(Y);
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
