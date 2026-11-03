// The quest board: a wooden notice board with every agent pinned to it as a parchment note, grouped by who needs the
// person first (SOS blocked, Loot done, On quest working, Resting idle), pinned ones on top. A note has its
// status seal, the agent's title, its tool, space and tab, and how long it's been at it; the menu cursor points
// at the focused one. Click: go to it. Right-click: pin / unpin. On a narrow sidebar only the seals show.
import { div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, spaces, theme, run, setAgentOrder } from "herdr";
import { ART, RANK, LABEL, since, sidebarNarrow } from "../state.js";
import { framed, WOOD } from "../kit/frame.js";

const SLOT = "#1d1b2f", INK = "#2e1c10", FADED = "#7a5a3a";

export class Quests {
  constructor(cx) {
    // only for the "12m" clocks
    cx.timer.every(30000, (cx) => cx.notify());
  }

  seal(t, a, size = 24) {
    return div().size(size + 4).flex_none().bg(SLOT).border(2).border_color(INK)
      .child(image(`${ART}/icon-${a.status}.gif`).size(size));
  }

  // the agent's tool (Claude Code, Codex...): its icon on its tile, from Herdr's program table
  tool(t, prog) {
    const tile = div().size(14).flex_none().flex().items_center().justify_center().bg(prog?.tile ?? t.border);
    if (!prog?.icon) return tile.child(div().text_size(10).text_color("#ffffff").child((prog?.name ?? "?")[0]));
    return tile.child(prog.tint ? svg(prog.icon).size(10).text_color(prog.color ?? "#ffffff") : image(prog.icon).size(10));
  }

  note(t, a, tabs, i) {
    const tab = tabs.get(a.tab);
    const clock = a.status === "working" ? since(tab?.working_since) : a.status === "idle" ? "" : since(tab?.changed_at);
    const where = [a.space_name, tab?.named ? tab.name : `#${a.tab_index}`, clock].filter(Boolean).join(" · ");
    const prog = a.program;
    const paper = h_flex().gap(8).items_center().text_size(12)
      .child(this.seal(t, a))
      .child(v_flex().flex_1().min_w(0).gap(3)
        .child(h_flex().gap(6).items_center()
          .child(div().flex_1().truncate().text_color(INK).child(a.title || prog?.name || a.address))
          .when(a.pinned, (el) => el.child(div().flex_none().text_color("#c8303a").child("PIN"))))
        .child(h_flex().min_w(0).gap(5).items_center()
          .child(this.tool(t, prog))
          .child(div().flex_none().text_color(INK).child(prog?.name ?? a.app ?? "agent"))
          .child(div().truncate().text_color(FADED).child(`· ${where}`))));
    // the menu cursor points at the focused note; notes sit a little unevenly, as if pinned by hand
    return h_flex().id(`q-${a.address}`).items_center()
      .on_click(() => run("pane.focus", { pane: a.pane }))
      .on_mouse_down("right", (_e, cx) => {
        run("terminal.pin", { terminal: a.address, pinned: !a.pinned });
        cx.stop_propagation();
      })
      .child(div().w(22).flex_none().when(a.focused, (el) => el.child(
        div().relative().loop("left", { from: 0, to: 3, period: 700 }).child(image(`${ART}/cursor.png`).w(20).h(20)))))
      .child(div().flex_1().min_w(0).ml(i % 2 ? 3 : 0).mr(i % 2 ? 0 : 3).h(60)
        .child(framed("note", paper)));
  }

  render() {
    const t = theme();
    const tabs = new Map(spaces().flatMap((s) => s.tabs.map((tb) => [tb.id, tb])));
    const list = [...agents()].sort((a, b) => (b.pinned - a.pinned) || (RANK[a.status] - RANK[b.status]) || (b.seq - a.seq));
    setAgentOrder(list.map((a) => a.address));

    if (sidebarNarrow()) {
      return framed("plaque", v_flex().size_full().items_center().gap(6).pt(4).overflow_y_scrollbar()
        .children(list.map((a) => div().id(`qn-${a.address}`).on_click(() => run("pane.focus", { pane: a.pane })).child(this.seal(t, a, 16)))));
    }

    const groups = [
      { key: "pinned", label: "Pinned", members: list.filter((a) => a.pinned) },
      ...["blocked", "done", "working", "idle"].map((s) => ({ key: s, label: LABEL[s], members: list.filter((a) => !a.pinned && a.status === s) })),
    ].filter((g) => g.members.length);

    let n = 0;
    const head = h_flex().px(6).pb(6).items_center().text_size(12)
      .child(div().flex_1().text_color(WOOD.dim).child("QUEST BOARD"))
      .child(div().text_color(WOOD.dim).child(`${list.length}`));
    const body = v_flex().id("quests").flex_1().min_h(0).overflow_y_scrollbar().gap(10)
      .when(!groups.length, (el) => el.child(div().pt(12).px(6).text_size(12).text_color(WOOD.faint).child("No quests. Keep slacking.")))
      .children(groups.map((g) => v_flex().gap(4)
        .child(div().px(6).text_size(12).text_color(WOOD.faint).child(`${g.label.toUpperCase()} ${g.members.length}`))
        .children(g.members.map((a) => this.note(t, a, tabs, n++)))));
    return framed("plaque", v_flex().size_full().pt(4).child(head).child(body));
  }
}
