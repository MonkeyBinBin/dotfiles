// 戰報: the battle report dialog, opened from the band's tally. That Monkey cheering, how many quests came home
// since Herdr started, and every agent that needs the person (求援) or came back (凱旋), each with a 前往 button.
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, theme, run, shared, closeOverlay } from "herdr";
import { ART } from "../state.js";

const STAGE = "#151324", SLOT = "#1d1b2f";

export class Report {
  entry(t, a, overlay) {
    return h_flex().id(`r-${a.address}`).gap(8).px(8).py(6).items_center().bg(t.surface)
      .child(div().size(28).flex_none().bg(SLOT).border(2).border_color(t.border).child(image(`${ART}/icon-${a.status}.gif`).size(24)))
      .child(v_flex().flex_1().min_w(0).gap(3)
        .child(div().truncate().text_color(t.foreground).child(a.title || a.program?.name || a.address))
        .child(div().truncate().text_color(t.dim).child(`${a.space_name} · ${a.tab_name || `#${a.tab_index}`}`)))
      .child(div().id(`go-${a.address}`).flex_none().px(8).py(4).border(2).border_color(t.accent).text_color(t.accent)
        .hover((s) => s.bg(t.accent).text_color(t.accent_foreground))
        .on_click(() => {
          closeOverlay(overlay);
          run("pane.focus", { pane: a.pane });
        })
        .child("前往"));
  }

  section(t, label, color, list, overlay) {
    return v_flex().gap(4)
      .child(div().text_color(color).child(`${label} ${list.length}`))
      .when(!list.length, (el) => el.child(div().pl(2).text_color(t.dim).child("—")))
      .children(list.map((a) => this.entry(t, a, overlay)));
  }

  render(_cx, p) {
    const t = theme(), list = agents(), overlay = p.overlay;
    const wins = shared("camp.wins") ?? 0;
    const blocked = list.filter((a) => a.status === "blocked"), done = list.filter((a) => a.status === "done");
    return v_flex().size_full().bg(t.popover).text_size(12).p(12).gap(12)
      .child(h_flex().gap(12).items_center()
        .child(div().flex_none().bg(STAGE).border(2).border_color(t.border).child(image(`${ART}/monkey-happy.gif`).w(90).h(90)))
        .child(v_flex().flex_1().gap(6)
          .child(div().text_size(24).text_color(t.foreground).child("戰報"))
          .child(div().text_color(t.muted).child(`這次開營以來凱旋 ${wins} 次`))
          .child(div().text_color(t.dim).child(blocked.length ? "有傭兵在等你出手…" : "營地一切平安"))))
      .child(v_flex().id("report-list").flex_1().min_h(0).overflow_y_scrollbar().gap(12)
        .child(this.section(t, "求援", t.blocked, blocked, overlay))
        .child(this.section(t, "凱旋", t.done, done, overlay)));
  }
}
