// The console's materials, shared by the bars and panels that are built of it.
import { div, image } from "gpui-kit";
import { h_flex } from "gpui-base";

const ART = "mods/sub/assets", TILE = 1280, HIGH = 96;
export const PAINT = "#ddd8c0", CUT = "#05090b"; // an engraved label's infill, the shadow of its cut

// brushed metal ("metal-slab", "metal-panel") behind a (relative) parent, tiled to any width and clipped to it
export const metal = (name) => div().absolute().top(0).left(0).size_full().overflow_hidden()
  .child(h_flex().children(Array.from({ length: 3 }, () => image(`${ART}/${name}.png`).w(TILE).h(HIGH).flex_none())));

// a label cut into the metal and filled with paint
export const engraved = (text) => div().relative().flex_none().h(14).text_size(12)
  .child(div().absolute().top(1).left(0).text_color(CUT).child(text))
  .child(div().relative().text_color(PAINT).child(text));
