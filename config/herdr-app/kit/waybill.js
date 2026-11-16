// Dispatch's side panels (dispatch-files, dispatch-changes) as a railway waybill: the lists are printed on continuous
// form paper (tractor holes down both edges, ruled lines under each entry, rubber stamps), code and diffs show in a dark
// viewer under it, in the board's inks (the code editor follows the dark theme, so it can't sit on the paper).
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";

export const INK = {
  // the paper
  paper: "#e9dfc6", paperLo: "#ddd0b0", ink: "#2a2117", inkDim: "#6b5d48", faint: "#9a8a6c", rule: "#cbbd9a",
  pick: "#d4c39a", hover: "#e2d6b8", add: "#1e7a3c", del: "#a8281c", mod: "#94600e", stamp: "#a8281c", clear: "#2f6a4a",
  // the viewer and the panel round it, as on the board
  night: "#07090b", board: "#0d1013", flap: "#15191d", line: "#2a343c", cream: "#f2ead8", creamDim: "#8a8476",
  amber: "#ffb03a", plate: "#e8a03a", plateText: "#1e1406", vAdd: "#5cf08a", vDel: "#ff8a7a", hunk: "#15191d", hunkText: "#6aa8e8",
};

export const ROW = 26;
const HOLE_GAP = 18;

// a column of tractor-feed holes, punched through to the panel behind
const holes = (side) => v_flex().absolute().top(0).bottom(0).w(12).flex_none().overflow_hidden().items_center().gap(HOLE_GAP - 6).pt(9)
  .map((el) => (side === "l" ? el.left(0) : el.right(0)))
  .children(Array.from({ length: 60 }, () => div().size(6).flex_none().rounded_full().bg(INK.board)));

/** A sheet of the paper. `grow`: it takes the room left (its content must size itself to it), else `h` tall or as tall
 *  as its content. */
export function sheet(content, { grow = false, h } = {}) {
  return div().relative().w_full().min_w(0).rounded(3).overflow_hidden().bg(INK.paper).text_color(INK.ink)
    .map((el) => (grow ? el.flex_1().min_h(0) : h !== undefined ? el.h(h).flex_none() : el.flex_none()))
    .child(v_flex().size_full().min_h(0).px(18).pt(8).pb(6).child(content))
    .child(holes("l")).child(holes("r"))
    // the perforation where the form tears off the next one
    .child(div().absolute().left(0).right(0).top(0).h(2).border_b(1).border_dashed().border_color(INK.rule));
}

/** The form's title row: the title printed bold, what it's for, and on the right whatever the panel puts there. */
export const heading = (title, ...right) => h_flex().w_full().h(32).flex_none().gap(8).items_center().border_b(2).border_color(INK.ink)
  .child(div().flex_none().text_size(15).text_color(INK.ink).child(title))
  .children(right);

/** A column-heads row under the title (small caps in faded ink). `cols`: [label, width | null for the rest, align]. */
export const columns = (cols) => h_flex().w_full().h(20).flex_none().px(6).gap(8).items_center().text_size(10).text_color(INK.faint)
  .children(cols.map(([label, w, align]) => div().map((el) => (w ? el.w(w).flex_none() : el.flex_1().min_w(0)))
    .when(align === "right", (el) => el.text_right()).child(label)));

/** One entry, ruled underneath, picked by a pencil-shaded band. */
export const entry = (id, picked) => h_flex().id(id).w_full().h(ROW).flex_none().px(6).gap(8).items_center().cursor_pointer()
  .border_b(1).border_color(INK.rule).hover((s) => s.bg(INK.hover)).when(picked, (el) => el.bg(INK.pick));

/** A rubber stamp, its word in a ruled box. */
export const stamp = (word, color = INK.stamp) => div().flex_none().px(5).h(18).flex().items_center().border_2().border_color(color)
  .rounded(3).text_size(11).text_color(color).child(word);

/** A key on the paper: inked solid while lit, else an outline. */
export const key = (id, label, lit, h, click) => div().id(id).flex_none().h(h).px(10).flex().items_center().justify_center()
  .rounded(3).border_1().border_color(INK.ink).text_size(12).text_color(lit ? INK.paper : INK.ink).when(lit, (el) => el.bg(INK.ink))
  .hover((s) => s.bg(lit ? INK.inkDim : INK.hover)).active((s) => s.opacity(0.8))
  .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => click(cx)).child(label);

/** A key on the dark panel: an amber plate when it can act, a dim one when it can't, as on the track map. */
export const plate = (id, label, lit, h, click) => div().id(id).flex_none().h(h).px(12).flex().items_center().justify_center()
  .rounded(4).text_size(12).bg(lit ? INK.plate : INK.flap).text_color(lit ? INK.plateText : INK.creamDim)
  .border_1().border_color(lit ? INK.amber : INK.line)
  .when(lit, (el) => el.hover((s) => s.bg(INK.amber))).active((s) => s.opacity(0.8))
  .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => click(cx)).child(label);

/** The dark viewer under the paper. Without `h` it takes the room left: a virtual list needs its parent's flex height
 *  directly, so the content goes straight in. */
export const viewer = (content, h) => div().relative().w_full().min_w(0).rounded(4).overflow_hidden().bg(INK.night)
  .border_1().border_color(INK.line).text_color(INK.cream)
  .map((el) => (h === undefined ? el.flex_1().min_h(0) : el.h(h).flex_none())).child(content);

/** A text field on the dark panel. */
export const field = (input) => div().flex_1().min_w(0).h_full().cursor_text().rounded(4).bg(INK.night).border_1().border_color(INK.line)
  .px(8).flex().items_center().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(input);
