// The Changes panel, in the sub's materials: Herdr's changes mod (cloned from 0.1.12), with a second mode.
//   WORKING  what's uncommitted, its diff, and a commit box: behaviour as in the original
//   COMMITS  what's been committed, reviewed like a pull request (review.js)
// pane.go brings the keyboard here: in WORKING, j/k or arrows go through the files showing each one's diff.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, v_virtual_list } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, settings, nextCommand } from "herdr";
import { Cursor } from "./kit/cursor.js";
import { framed } from "./kit/frame.js";
import { INK, READ, clip, counts, diffRow, diffRows, diffWidth, key as keyPlate, pathLabel, plate, well } from "./chrome.js";
import { Review } from "./review.js";

function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}
const key = () => JSON.stringify(location());
const countLines = (text) => text ? text.split("\n").length - Number(text.endsWith("\n")) : 0;
const STATUS_INK = { A: INK.add, D: INK.del, U: INK.del, M: INK.gold };

export default class Changes extends View {
  init(_props, cx) {
    this.mode = "working"; this.review = new Review(location, key);
    this.files = []; this.rows = []; this.width = 0; this.message = ""; this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Commit message" });
    this.input.on("change", (_e, cx) => {
      const hadMessage = Boolean(this.message.trim());
      this.message = this.input.value();
      if (hadMessage !== Boolean(this.message.trim())) cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.commit(cx));
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    this.cursor = new Cursor(); this.walking = false;
    cx.spawn(async (cx) => {
      for (;;) {
        if (await nextCommand() !== "focus") continue;
        this.handle.focus(); this.walking = true;
        cx.notify();
      }
    });
    this.refresh(cx);
    cx.timer.every(10000, (cx) => this.refresh(cx));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) {
          await watchFolder(root);
          if (this.watched === root) this.refresh(cx);
        }
      } catch { this.watched = null; }
    });
  }

  refresh(cx) {
    if (this.loading || this.busy) return;
    const { cwd, on } = location(), context = key();
    if (context !== this.context) {
      this.context = context; this.root = null; this.files = []; this.open = null;
      this.setLines([]); this.message = ""; this.input.set_value(""); this.error = null; this.note = null; this.watched = null; this.closed = false; this.limited = false;
    }
    if (!cwd) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (key() !== context) return;
        if (top.code !== 0) { this.root = null; this.files = []; this.setLines([]); this.open = null; this.error = "Not a git repository"; return; }
        const root = top.stdout.trim(), git = (args) => exec("git", [...READ, ...args], { cwd: root, on });
        const status = await git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]);
        if (status.code !== 0) throw new Error(status.stderr);
        const head = await git(["rev-parse", "--verify", "HEAD"]);
        const stats = {};
        const results = head.code === 0 ? [await git(["diff", "HEAD", "--numstat", "-z", "--no-renames"])] : [await git(["diff", "--cached", "--numstat", "-z", "--no-renames"]), await git(["diff", "--numstat", "-z", "--no-renames"])];
        for (const result of results) {
          if (result.code !== 0) throw new Error(result.stderr);
          for (const entry of result.stdout.split("\0")) {
            const [a, d, ...parts] = entry.split("\t");
            if (!parts.length) continue;
            const path = parts.join("\t"), old = stats[path] ?? { add: 0, del: 0 };
            stats[path] = { add: old.add + (Number(a) || 0), del: old.del + (Number(d) || 0), binary: a === "-" };
          }
        }
        const files = [];
        const entries = status.stdout.split("\0").filter(Boolean);
        for (const entry of entries.slice(0, 1000)) {
          const xy = entry.slice(0, 2), path = entry.slice(3), fresh = xy === "??";
          const conflict = xy.includes("U") || xy === "AA" || xy === "DD";
          const s = conflict ? "U" : xy.includes("D") ? "D" : fresh || xy.includes("A") ? "A" : "M";
          const stat = stats[path] ?? { add: 0, del: 0 };
          files.push({ path, status: s, fresh, ...stat });
        }
        if (key() !== context) return;
        this.root = root; this.on = on; this.hasHead = head.code === 0; this.files = files; this.limited = entries.length > 1000; this.error = null;
        this.watch(root, cx);
        if (this.open && !files.some((f) => f.path === this.open)) { this.open = null; this.setLines([]); }
        // The first file's diff shows until you pick another.
        if (!this.open && !this.closed && files.length) this.open = files[0].path;
        if (this.open) {
          try { await this.load(this.open, context); }
          catch { if (key() === context) this.setLines(["Cannot preview this diff (too large or unreadable)"]); }
        }
      } catch (e) { if (key() === context) this.error = String(e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  async load(path, context) {
    const file = this.files.find((f) => f.path === path), root = this.root, on = this.on;
    if (!file) return;
    let lines;
    if (file.fresh || (!this.hasHead && file.status === "A")) {
      const text = await readTextFile(`${root}/${path}`, { on }).catch(() => null);
      if (text === null) lines = ["Cannot preview this file (binary, too large, or unreadable)"];
      else if (text.includes("\0")) lines = ["Binary file · no text diff"];
      else {
        file.add = countLines(text);
        lines = [`@@ -0,0 +1,${file.add} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").slice(0, 1500).map(l => `+${l}`)];
      }
    } else {
      const r = await exec("git", [...READ, "diff", ...(this.hasHead ? ["HEAD"] : []), "--no-ext-diff", "--no-textconv", "--no-color", "--", path], { cwd: root, on });
      if (r.code !== 0) throw new Error(r.stderr);
      const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex((l) => l.startsWith("@@"));
      lines = first < 0 ? [file.binary ? "Binary file changed" : "No text diff available"] : all.slice(first);
    }
    if (key() === context && this.open === path) this.setLines(clip(lines));
  }

  setLines(lines) {
    this.rows = diffRows(lines);
    this.width = diffWidth(lines);
  }

  pick(path, cx) {
    this.open = this.open === path ? null : path; this.setLines([]); this.note = null;
    this.closed = !this.open;
    const context = this.context;
    if (this.open) cx.spawn(async (cx) => {
      try { await this.load(path, context); }
      catch (e) { if (key() === context && this.open === path) this.note = `Cannot preview this diff (too large or unreadable): ${e}`; }
      cx.notify();
    });
    cx.notify();
  }

  commit(cx) {
    if (!this.message.trim() || !this.root || this.busy || this.loading || this.context !== key()) return;
    const root = this.root, on = this.on, context = this.context, message = this.message.trim();
    this.busy = true; this.note = null;
    cx.spawn(async (cx) => {
      try {
        for (const args of [["add", "-A"], ["commit", "-m", message]]) {
          const r = await exec("git", args, { cwd: root, on });
          if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
        }
        if (key() === context) { this.message = ""; this.input.set_value(""); }
      } catch (e) { if (key() === context) this.note = `Commit failed: ${e}`; }
      finally { this.busy = false; this.refresh(cx); cx.notify(); }
    });
    cx.notify();
  }

  // true when the key was this panel's: the cursor is the open file, so moving shows the next diff
  walk(k, cx) {
    if (this.mode !== "working" || this.typing || !this.files.length) return false;
    if (k !== "j" && k !== "k" && k !== "down" && k !== "up") return false;
    const at = this.files.findIndex((f) => f.path === this.open);
    this.cursor.at = at;
    this.cursor.move(k === "j" || k === "down" ? 1 : -1, this.files.length);
    const next = this.files[this.cursor.at];
    if (next.path !== this.open) this.pick(next.path, cx);
    return true;
  }

  // the steel plate along the top: the two modes, and how much has changed
  header(cx) {
    const add = this.files.reduce((n, f) => n + f.add, 0), del = this.files.reduce((n, f) => n + f.del, 0);
    const mode = (id, label) => keyPlate(`mode-${id}`, label, this.mode === id, 30, (cx) => {
      this.mode = id;
      if (id === "commits") this.review.refresh(cx);
      cx.notify();
    });
    return plate(h_flex().size_full().gap(6).items_center()
      .child(mode("working", "WORKING")).child(mode("commits", "COMMITS")).child(div().flex_1())
      .when(this.mode === "working", (e) => e.child(div().text_size(11).text_color(INK.paint).child(`${this.files.length} FILES`)).child(counts(add, del))));
  }

  working() {
    const enabled = Boolean(this.message.trim() && this.root && !this.busy && !this.loading);
    const walking = this.walking && this.handle.is_focused();
    const rows = this.files.map((f) =>
      h_flex().id(`change-${f.path}`).h(26).flex_none().px(6).gap(8).items_center().cursor_pointer()
        .when(this.open === f.path, (e) => e.bg(INK.pick)).hover((s) => s.bg(INK.hover)).on_click((_e, cx) => this.pick(f.path, cx))
        .child(div().w(12).flex_none().text_size(11).text_color(STATUS_INK[f.status]).child(f.status))
        .child(pathLabel(f.path)).child(counts(f.add, f.del)));
    if (walking) this.cursor.at = this.files.findIndex((f) => f.path === this.open);
    const list = v_flex().id(walking ? "changes-list-walk" : "changes-list").size_full().when(!walking, (e) => e.overflow_y_scrollbar()).when(walking, (e) => e.overflow_hidden()).p(4)
      .on_size_change((size) => { this.cursor.height = size.height - 8; })
      .children(walking ? this.cursor.window(rows) : rows)
      .when(!this.files.length, (e) => e.child(div().p(6).text_color(INK.dim).child(this.error || (this.loading ? "Loading changes…" : this.root ? "No uncommitted changes" : "No folder"))));
    const diff = div().relative().size_full().font_family(settings().font_family ?? "JetBrains Mono").text_size(11)
      .child(div().id("changes-diff-x").size_full().overflow_x_scrollbar()
        .child(div().w_full().min_w(this.width).h_full().child(v_virtual_list("changes-diff", this.rows.length, 20, (i) => String(i),
          (range) => this.rows.slice(range.start, range.end).map((row) => diffRow(row))).size_full())))
      .child(Scrollbar.vertical("changes-diff").viewport_from_layout().absolute().inset_0())
      .when(!this.open && this.files.length > 0, (e) => e.child(div().absolute().top(6).px(10).text_color(INK.dim).child("Select a file to view its changes")));
    return [
      well(list, Math.min(190, Math.max(44, this.files.length * 26 + 16))),
      ...(this.limited ? [div().px(4).text_size(11).text_color(INK.dim).child("Showing the first 1,000 changed files")] : []),
      well(diff),
      ...(this.note ? [div().px(4).text_size(11).text_color(INK.del).child(this.note)] : []),
      h_flex().flex_none().gap(6).h(36)
        .child(div().flex_1().min_w(0).h_full().cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .child(framed("well", div().size_full().px(8).flex().items_center().child(Input.new(this.input).h_full().w_full().text_size(12).text_color(INK.hi)))))
        .child(keyPlate("commit", this.busy ? "…" : "COMMIT", enabled, 36, (cx) => this.commit(cx))),
    ];
  }

  render(cx) {
    if (key() !== this.context) this.refresh(cx);
    return v_flex().id("changes").relative().size_full().min_h(0).gap(6).p(6).rounded(12).overflow_hidden().bg("#0b1c20").text_size(12).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape" && (this.typing || this.review.typing)) { this.typing = false; this.review.typing = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); return; }
        if (e.modifiers.control || e.modifiers.platform || e.modifiers.alt) return;
        this.walking = true;
        if (this.walk(e.key, cx)) { cx.stop_propagation(); cx.notify(); }
      })
      .on_mouse_down("left", (_e, cx) => { this.walking = false; cx.notify(); })
      .on_scroll_wheel((_e, cx) => { if (this.walking) { this.walking = false; cx.notify(); } })
      .child(this.header(cx))
      .children(this.mode === "working" ? this.working() : this.review.render(cx));
  }
}
