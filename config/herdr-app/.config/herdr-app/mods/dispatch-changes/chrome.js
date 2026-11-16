// The panel's parts, on the waybill (kit/waybill.js), and what both modes do with a diff.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { INK } from "./kit/waybill.js";

export { INK, columns, entry, field, heading, key, plate, sheet, stamp, viewer } from "./kit/waybill.js";

// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie).
export const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
export const MAX_LINES = 1500;

// Numbers each diff line once, so a frame only draws the rows on screen.
export function diffRows(lines) {
  let old = 0, next = 0;
  return lines.map((line) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (match) { old = +match[1]; next = +match[2]; return { kind: "@", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, number: old++, text: line.slice(1) || " " };
    if (kind === "+") return { kind, number: next++, text: line.slice(1) || " " };
    if (kind === " ") { old++; return { kind, number: next++, text: line.slice(1) || " " }; }
    return { kind: "", text: line };
  });
}

export const diffWidth = (lines) => Math.max(300, ...lines.map((line) => line.length * 7 + 50));
export const clip = (lines) => lines.slice(0, MAX_LINES).map((line) => (line.length > 4000 ? `${line.slice(0, 4000)}… (line truncated)` : line));

// a diff line in the dark viewer
export function diffRow({ kind, number, text }) {
  if (kind === "@") return div().w_full().px(10).h(20).flex_none().truncate().bg(INK.hunk).text_color(INK.hunkText).child(text);
  return h_flex().w_full().h(20).flex_none().gap(10).text_color("#e8dcc4")
    .when(kind === "+", (e) => e.bg("#5cf08a1c")).when(kind === "-", (e) => e.bg("#ff4a3a24"))
    .child(div().w(34).flex_none().text_right().text_color("#4a5864").child(number === undefined ? "" : String(number)))
    .child(div().flex_1().min_w(0).truncate().child(text));
}

// a changed file's name on the paper: its folder in faded ink, then the name
export const pathLabel = (path) => {
  const parts = path.split("/"), name = parts.pop();
  return h_flex().flex_1().min_w(0)
    .child(div().min_w(0).text_color(INK.faint).truncate().child(parts.length ? `${parts.join("/")}/` : ""))
    .child(div().flex_none().max_w(240).truncate().text_color(INK.ink).child(name));
};

// the + and − columns of an entry, right-aligned figures
export const COUNT_W = 38;
export const counts = (add, del) => h_flex().flex_none().gap(8).text_size(11)
  .child(div().w(COUNT_W).text_right().text_color(INK.add).child(add > 0 ? `+${add}` : ""))
  .child(div().w(COUNT_W).text_right().text_color(INK.del).child(del > 0 ? `−${del}` : ""));
