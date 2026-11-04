// COMMITS: review what's been committed, like a pull request. The commits on this branch that aren't on its main line
// (else the latest few), the files of the picked one, its diff. Tick a file off as viewed; click a line of the diff to
// comment on it, then send the comments to an agent as one message. Ticks and unsent comments are kept (shared
// "review.viewed", "review.comments").
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, v_virtual_list } from "gpui-base";
import { agents, exec, focused, hc, settings, setShared, shared, spaces } from "herdr";
import { framed } from "./kit/frame.js";
import { INK, READ, clip, counts, diffRow, diffRows, diffWidth, key as keyPlate, pathLabel, well } from "./chrome.js";

const LIST_MAX = 50, LATEST = 20, KEEP_VIEWED = 100;
const SEP = "\x1f";

const ago = (s) => {
  const m = Math.floor((Date.now() / 1000 - s) / 60);
  return m < 60 ? `${Math.max(m, 0)}m` : m < 2880 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
};

export class Review {
  constructor(location, context) {
    this.location = location;
    this.contextKey = context;
    this.commits = []; this.files = []; this.rows = []; this.width = 0;
    this.input = InputState.new({ placeholder: "Click a diff line to comment" });
    this.input.on("submit", (_e, cx) => this.addComment(cx));
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
  }

  viewed() { return shared("review.viewed") ?? {}; }
  comments() { return shared("review.comments") ?? []; }

  // The branch's own commits: from where it left the main line, else just the latest.
  async log(git) {
    let base = null;
    const remote = await git(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
    const candidates = [remote.code === 0 ? remote.stdout.trim() : null, "origin/main", "origin/master", "main", "master"].filter(Boolean);
    for (const name of candidates) {
      if ((await git(["rev-parse", "--verify", "--quiet", name])).code === 0) { base = name; break; }
    }
    const format = `--format=${["%H", "%h", "%s", "%an", "%ct"].join("%x1f")}`;
    const parse = (r) => r.stdout.split("\n").filter(Boolean).map((line) => {
      const [sha, short, subject, author, at] = line.split(SEP);
      return { sha, short, subject, author, at: Number(at) };
    });
    if (base) {
      const own = parse(await git(["log", "--no-merges", format, `-n${LIST_MAX}`, `${base}..HEAD`]));
      if (own.length) return { commits: own, label: `since ${base}` };
    }
    return { commits: parse(await git(["log", "--no-merges", format, `-n${LATEST}`])), label: `latest ${LATEST}` };
  }

  refresh(cx) {
    if (this.loading) return;
    const { cwd, on } = this.location(), context = this.contextKey();
    if (context !== this.context) {
      this.context = context; this.root = null; this.commits = []; this.sha = null; this.files = []; this.open = null; this.setLines([]); this.target = null; this.error = null;
    }
    if (!cwd) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (this.contextKey() !== context) return;
        if (top.code !== 0) { this.root = null; this.commits = []; this.error = "Not a git repository"; return; }
        this.root = top.stdout.trim(); this.on = on;
        const { commits, label } = await this.log(this.git());
        if (this.contextKey() !== context) return;
        this.commits = commits; this.label = label; this.error = null;
        // the newest commit not yet reviewed, until one's picked
        if (!this.sha || !commits.some((c) => c.sha === this.sha)) {
          const next = commits.find((c) => !this.done(c.sha)) ?? commits[0];
          if (next) await this.select(next.sha, context);
        }
      } catch (e) { this.error = String(e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  git() {
    const root = this.root, on = this.on;
    return (args) => exec("git", [...READ, ...args], { cwd: root, on });
  }

  // A commit against its first parent, which also gives a merge a plain diff; the very first commit has none.
  async versus(sha, args, rootArgs) {
    const r = await this.git()(["diff", `${sha}^1`, sha, ...args]);
    return r.code === 0 ? r : this.git()(rootArgs);
  }

  async select(sha, context) {
    this.sha = sha; this.files = []; this.open = null; this.setLines([]); this.target = null;
    const r = await this.versus(sha, ["--numstat", "-z", "--no-renames"], ["show", "--numstat", "-z", "--no-renames", "--format=", sha]);
    if (r.code !== 0) throw new Error(r.stderr);
    if (this.contextKey() !== context || this.sha !== sha) return;
    this.files = r.stdout.split("\0").filter(Boolean).map((entry) => {
      const [a, d, ...parts] = entry.replace(/^\n/, "").split("\t");
      return { path: parts.join("\t"), add: Number(a) || 0, del: Number(d) || 0, binary: a === "-" };
    }).filter((f) => f.path);
    this.mark(sha, (seen) => seen, this.files.length);
    const first = this.files.find((f) => !this.isViewed(f.path)) ?? this.files[0];
    if (first) await this.load(first.path, context);
  }

  async load(path, context) {
    this.open = path; this.target = null;
    const sha = this.sha, plain = ["--no-ext-diff", "--no-textconv", "--no-color"];
    const r = await this.versus(sha, [...plain, "--", path], ["show", ...plain, "--format=", sha, "--", path]);
    if (this.contextKey() !== context || this.open !== path || this.sha !== sha) return;
    if (r.code !== 0) { this.setLines(["Cannot preview this diff (too large or unreadable)"]); return; }
    const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex((l) => l.startsWith("@@"));
    this.setLines(clip(first < 0 ? [this.files.find((f) => f.path === path)?.binary ? "Binary file changed" : "No text diff available"] : all.slice(first)));
  }

  setLines(lines) {
    this.diff = diffRows(lines);
    this.width = diffWidth(lines);
    this.compose();
  }

  // the diff's rows with this file's comments laid in under the lines they're on
  compose() {
    const mine = this.comments().filter((c) => c.sha === this.sha && c.path === this.open);
    this.rows = (this.diff ?? []).flatMap((row) => {
      const here = row.number === undefined ? [] : mine.filter((c) => c.line === row.number && c.kind === row.kind);
      return [row, ...here.map((c) => ({ kind: "note", comment: c, text: c.text }))];
    });
  }

  pickCommit(sha, cx) {
    const context = this.context;
    cx.spawn(async (cx) => {
      try { await this.select(sha, context); } catch (e) { this.note = String(e); }
      cx.notify();
    });
    cx.notify();
  }

  pickFile(path, cx) {
    const context = this.context;
    cx.spawn(async (cx) => {
      await this.load(path, context);
      cx.notify();
    });
    cx.notify();
  }

  // what's stored for a commit: its file count and the paths ticked off; the oldest fall away
  mark(sha, change, total) {
    const all = { ...this.viewed() }, was = all[sha] ?? { total: total ?? 0, seen: [] };
    const next = { total: total ?? was.total, seen: change(was.seen) };
    if (next.total === was.total && next.seen === was.seen && all[sha]) return;
    delete all[sha];
    all[sha] = next;
    const keys = Object.keys(all);
    for (const old of keys.slice(0, Math.max(0, keys.length - KEEP_VIEWED))) delete all[old];
    setShared("review.viewed", all);
  }

  isViewed(path) { return (this.viewed()[this.sha]?.seen ?? []).includes(path); }
  done(sha) { const v = this.viewed()[sha]; return Boolean(v && v.total && v.seen.length >= v.total); }

  toggleViewed(path, cx) {
    this.mark(this.sha, (seen) => (seen.includes(path) ? seen.filter((p) => p !== path) : [...seen, path]));
    cx.notify();
  }

  aim(row, cx) {
    if (row.number === undefined) return;
    this.target = { line: row.number, kind: row.kind };
    cx.notify();
  }

  addComment(cx) {
    const text = this.input.value().trim();
    if (!text || !this.target || !this.open) return;
    const commit = this.commits.find((c) => c.sha === this.sha);
    setShared("review.comments", [...this.comments(), { sha: this.sha, short: commit?.short, subject: commit?.subject, path: this.open, line: this.target.line, kind: this.target.kind, text }]);
    this.input.set_value("");
    this.target = null;
    this.compose();
    cx.notify();
  }

  removeComment(comment, cx) {
    setShared("review.comments", this.comments().filter((c) => c !== comment && !(c.sha === comment.sha && c.path === comment.path && c.line === comment.line && c.text === comment.text)));
    this.compose();
    cx.notify();
  }

  // Who the comments go to: the focused agent, else the first in this space.
  agentHere() {
    const f = focused(), space = spaces().find((s) => s.active), all = agents();
    return all.find((a) => a.address === f?.agent) ?? all.find((a) => a.space === space?.id) ?? null;
  }

  send(cx) {
    const pending = this.comments().filter((c) => this.commits.some((m) => m.sha === c.sha));
    const agent = this.agentHere();
    if (!pending.length) return;
    if (!agent) { this.note = "No agent in this space to send to"; cx.notify(); return; }
    const bySha = new Map();
    for (const c of pending) bySha.set(c.sha, [...(bySha.get(c.sha) ?? []), c]);
    const message = ["Review comments, please address them:", ...[...bySha.values()].flatMap((list) => [
      `Commit ${list[0].short}: ${list[0].subject}`,
      ...list.map((c) => `- ${c.path}:${c.line}${c.kind === "-" ? " (removed line)" : ""}: ${c.text}`),
    ])].join("\n");
    this.sending = true; this.note = null;
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["send", agent.address, message]);
        if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
        setShared("review.comments", this.comments().filter((c) => !pending.some((p) => p.sha === c.sha && p.path === c.path && p.line === c.line && p.text === c.text)));
        this.note = `Sent ${pending.length} to ${agent.title || agent.address}`;
        this.compose();
      } catch (e) { this.note = `Couldn't send: ${e}`; }
      finally { this.sending = false; cx.notify(); }
    });
    cx.notify();
  }

  // The list's rows take no ids or click handlers of their own (its keys are their identity): see clickRow.
  row(row) {
    if (row.kind === "note") {
      return h_flex().w_full().h(20).flex_none().gap(6).px(10).bg("#ffd25a1c").text_color(INK.gold)
        .child(div().flex_1().min_w(0).truncate().child(`» ${row.text}`))
        .child(div().flex_none().px(4).child("×"));
    }
    const aimed = this.target && row.number === this.target.line && row.kind === this.target.kind;
    return diffRow(row).when(Boolean(aimed), (e) => e.bg("#ffd25a30"));
  }

  // A line takes aim for a comment; a comment goes away.
  clickRow(i, cx) {
    const row = this.rows[i];
    if (!row) return;
    if (row.kind === "note") this.removeComment(row.comment, cx);
    else this.aim(row, cx);
  }

  render(cx) {
    const commit = this.commits.find((c) => c.sha === this.sha);
    const commits = v_flex().id("review-commits").size_full().overflow_y_scrollbar().p(4).children(this.commits.map((c) =>
      h_flex().id(`commit-${c.sha}`).h(24).flex_none().px(6).gap(8).items_center().cursor_pointer().hover((s) => s.bg(INK.hover))
        .when(c.sha === this.sha, (e) => e.bg(INK.pick)).on_click((_e, cx) => this.pickCommit(c.sha, cx))
        .child(div().w(12).flex_none().text_color(INK.add).child(this.done(c.sha) ? "✓" : ""))
        .child(div().flex_none().text_size(11).text_color(INK.gold).child(c.short))
        .child(div().flex_1().min_w(0).truncate().text_color(INK.hi).child(c.subject))
        .child(div().flex_none().text_size(11).text_color(INK.faint).child(ago(c.at)))))
      .when(!this.commits.length, (e) => e.child(div().p(6).text_color(INK.dim).child(this.error || (this.loading ? "Loading commits…" : "No commits"))));
    const seen = this.viewed()[this.sha]?.seen.length ?? 0;
    const files = v_flex().id("review-files").size_full().overflow_y_scrollbar().p(4)
      .children(this.files.map((f) => {
        const ticked = this.isViewed(f.path);
        return h_flex().id(`rf-${f.path}`).h(24).flex_none().px(6).gap(8).items_center().cursor_pointer().hover((s) => s.bg(INK.hover))
          .when(this.open === f.path, (e) => e.bg(INK.pick)).on_click((_e, cx) => this.pickFile(f.path, cx))
          .child(div().id(`tick-${f.path}`).flex_none().size(14).flex().items_center().justify_center().border_1().border_color(ticked ? INK.add : INK.faint).text_size(11).text_color(INK.add)
            .on_click((_e, cx) => { cx.stop_propagation(); this.toggleViewed(f.path, cx); }).child(ticked ? "✓" : ""))
          .child(pathLabel(f.path)).child(counts(f.add, f.del));
      }));
    const diff = div().relative().size_full().font_family(settings().font_family ?? "JetBrains Mono").text_size(11)
      .child(div().id("review-diff-x").size_full().overflow_x_scrollbar()
        .child(div().w_full().min_w(this.width).h_full().child(v_virtual_list("review-diff", this.rows.length, 20, (i) => String(i),
          (range) => this.rows.slice(range.start, range.end).map((row) => this.row(row))).size_full()
          .on_item_click((key, cx) => this.clickRow(Number(key), cx)))))
      .child(Scrollbar.vertical("review-diff").viewport_from_layout().absolute().inset_0());
    const pending = this.comments().filter((c) => this.commits.some((m) => m.sha === c.sha)).length;
    return [
      h_flex().flex_none().px(4).gap(8).text_size(11).text_color(INK.paint)
        .child(div().flex_1().min_w(0).truncate().child(this.label ? `${this.commits.length} COMMITS · ${this.label}` : "COMMITS"))
        .when(Boolean(commit), (e) => e.child(div().flex_none().child(`VIEWED ${seen}/${this.files.length}`))),
      well(commits, Math.min(136, Math.max(44, this.commits.length * 24 + 16))),
      well(files, Math.min(112, Math.max(40, this.files.length * 24 + 16))),
      well(diff),
      ...(this.note ? [div().px(4).text_size(11).text_color(this.note.startsWith("Sent") ? INK.mid : INK.del).child(this.note)] : []),
      h_flex().flex_none().gap(6).h(36)
        .child(div().flex_1().min_w(0).h_full().cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .child(framed("well", div().size_full().px(8).flex().items_center().child(Input.new(this.input).h_full().w_full().text_size(12).text_color(this.target ? INK.gold : INK.hi)))))
        .child(keyPlate("comment-add", "ADD", Boolean(this.target), 36, (cx) => this.addComment(cx)))
        .child(keyPlate("comment-send", this.sending ? "…" : `SEND ${pending}`, pending > 0, 36, (cx) => this.send(cx))),
    ];
  }
}
