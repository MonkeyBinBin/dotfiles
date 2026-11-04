// A markdown file read in a pane of its own, rendered, in the sub's materials: `pane.split {mod: "sub-md", props: {file, on}}`.
// Files opens it. It follows the file as it's saved (a remote one on a timer: folder watches are local only).
import { View, div } from "gpui-kit";
import { h_flex, v_flex, TextView } from "gpui-base";
import { props, readTextFile, watchFolder } from "herdr";
import { engraved } from "./kit/metal.js";
import { INK, plate, well } from "./kit/panel.js";

const LIMIT = 400000, POLL_MS = 10000;

export default class Markdown extends View {
  init(_props, cx) {
    this.text = null;
    this.error = null;
    this.loads = 0;
    this.load(cx);
    const { file, on } = props() ?? {};
    if (!file) return;
    if (on) cx.timer.every(POLL_MS, (cx) => this.load(cx));
    else cx.spawn(async (cx) => {
      try {
        for (;;) {
          const changed = await watchFolder(file.split("/").slice(0, -1).join("/"));
          if (changed.some((p) => file === p || file.startsWith(`${p}/`))) this.load(cx);
        }
      } catch { cx.timer.every(POLL_MS, (cx) => this.load(cx)); }
    });
  }

  load(cx) {
    const { file, on } = props() ?? {};
    if (!file) { this.error = "No file"; return; }
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(file, { on });
        if (text === null) { this.error = "This file is no longer available"; return; }
        const clipped = text.length > LIMIT ? `${text.slice(0, LIMIT)}\n\n… (file truncated)` : text;
        if (clipped !== this.text) { this.text = clipped; this.loads++; }
        this.error = null;
      } catch { this.error = "Cannot read this file"; }
      finally { cx.notify(); }
    });
  }

  render() {
    const file = props()?.file ?? "";
    const body = this.error || this.text === null
      ? div().p(10).text_color(INK.dim).child(this.error ?? "Loading…")
      : div().id("md-scroll").size_full().overflow_y_scrollbar().px(16).py(12).text_color(INK.hi)
        .child(TextView.markdown(`md-${this.loads}`, this.text).selectable());
    return v_flex().id("md").relative().size_full().min_h(0).gap(6).p(6).overflow_hidden().bg("#0b1c20").text_size(14)
      .child(plate(h_flex().size_full().gap(8).items_center()
        .child(div().flex_none().pl(4).child(engraved("LOG BOOK")))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(11).text_color(INK.paint).pr(4).child(file.split("/").pop()))))
      .child(well(body));
  }
}
