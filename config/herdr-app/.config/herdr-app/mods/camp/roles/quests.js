// The quest board: every agent as a notice pinned to the camp's board, grouped by who needs the person
// first (求援 blocked, 凱旋 done, 出征 working, 待命 idle), pinned ones on top. Each notice has its status
// seal, the agent's title, its space and tab, and how long it's been at it. Click: go to it. Right-click:
// pin / unpin. On a narrow sidebar only the seals show.
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, spaces, theme, run, setAgentOrder } from "herdr";
import { ART, RANK, LABEL, since, sidebarNarrow } from "../state.js";

const SLOT = "#1d1b2f";

export class Quests {
  constructor(cx) {
    // only for the "12 分" clocks
    cx.timer.every(30000, (cx) => cx.notify());
  }

  seal(t, a, size = 24) {
    return div().size(size + 4).flex_none().bg(SLOT).border(2).border_color(t.border)
      .child(image(`${ART}/icon-${a.status}.gif`).size(size));
  }

  row(t, a, tabs) {
    const tab = tabs.get(a.tab);
    const clock = a.status === "working" ? since(tab?.working_since) : a.status === "idle" ? "" : since(tab?.changed_at);
    const where = [a.space_name, tab?.named ? tab.name : `#${a.tab_index}`, clock].filter(Boolean).join(" · ");
    const color = { blocked: t.blocked, done: t.done, working: t.working, idle: t.border }[a.status];
    return h_flex().id(`q-${a.address}`).gap(8).pl(6).pr(8).py(5).items_center()
      .bg(a.focused ? t.selected : t.surface).border_l(3).border_color(color)
      .hover((s) => s.bg(t.raised))
      .on_click(() => run("pane.focus", { pane: a.pane }))
      .on_mouse_down("right", (_e, cx) => {
        run("terminal.pin", { terminal: a.address, pinned: !a.pinned });
        cx.stop_propagation();
      })
      .child(this.seal(t, a))
      .child(v_flex().flex_1().min_w(0).gap(3).text_size(12)
        .child(div().truncate().text_color(t.foreground).child(a.title || a.program?.name || a.address))
        .child(div().truncate().text_color(t.dim).child(where)))
      .when(a.pinned, (el) => el.child(div().flex_none().text_size(12).text_color(t.accent).child("釘")));
  }

  render() {
    const t = theme();
    const tabs = new Map(spaces().flatMap((s) => s.tabs.map((tb) => [tb.id, tb])));
    const list = [...agents()].sort((a, b) => (b.pinned - a.pinned) || (RANK[a.status] - RANK[b.status]) || (b.seq - a.seq));
    setAgentOrder(list.map((a) => a.address));

    if (sidebarNarrow()) {
      return v_flex().size_full().bg(t.chrome).items_center().gap(6).pt(8).overflow_y_scrollbar()
        .children(list.map((a) => div().id(`qn-${a.address}`).on_click(() => run("pane.focus", { pane: a.pane })).child(this.seal(t, a, 16))));
    }

    const groups = [
      { key: "pinned", label: "釘選", members: list.filter((a) => a.pinned) },
      ...["blocked", "done", "working", "idle"].map((s) => ({ key: s, label: LABEL[s], members: list.filter((a) => !a.pinned && a.status === s) })),
    ].filter((g) => g.members.length);

    const head = h_flex().px(10).py(8).items_center().border_b(2).border_color(t.border).text_size(12)
      .child(div().flex_1().text_color(t.foreground).child("任務公告欄"))
      .child(div().text_color(t.dim).child(`${list.length} 件`));
    const body = v_flex().id("quests").flex_1().min_h(0).overflow_y_scrollbar().px(8).py(8).gap(10)
      .when(!groups.length, (el) => el.child(div().pt(12).text_size(12).text_color(t.dim).child("沒有任務，繼續擺爛")))
      .children(groups.map((g) => v_flex().gap(4)
        .child(div().px(2).text_size(12).text_color(t.muted).child(`${g.label} ${g.members.length}`))
        .children(g.members.map((a) => this.row(t, a, tabs)))));
    return v_flex().size_full().bg(t.chrome).border_t(2).border_color(t.border).child(head).child(body);
  }
}
