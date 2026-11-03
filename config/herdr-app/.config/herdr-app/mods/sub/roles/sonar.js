// The sonar: a round scope in a brass ring, the sweep turning, a blip per agent. Each contact sits on its own
// bearing (from its address, so it stays put) at a range by how long it has been under; surfaced ones come
// in close, parked ones lie out at the rim. Beside it a steel plate with the crew's counts. Click a blip for the periscope, double-click to go.
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, run } from "herdr";
import { framed } from "../kit/frame.js";
import { ART, INK, WORD, STATUS_INK, tabsById, depthOf, minutesUnder, contacts, hash, periscope, goTo } from "../state.js";

// the scope GIF: 140 native px, shown at 280; its screen's radius is 60 native px
const SCOPE = 280, C = SCOPE / 2, R = 120;

export class Sonar {
  constructor(cx) {
    cx.timer.every(30000, (cx) => cx.notify());
  }

  render() {
    const list = agents(), tabs = tabsById(), ids = contacts(list), now = Date.now();
    const range = (a) => a.status === "done" ? 0.28 : a.status === "idle" ? 0.9 : 0.22 + 0.68 * depthOf(minutesUnder(a, tabs, now));
    const blips = list.map((a) => {
      const bearing = ((hash(a.address) % 360) * Math.PI) / 180, r = range(a) * R;
      const x = Math.round(C + Math.sin(bearing) * r), y = Math.round(C - Math.cos(bearing) * r);
      const right = x > C + 30;
      return div().id(`b-${a.address}`).absolute().left(x - 20).top(y - 20).size(40)
        .on_click((e) => (e?.click_count === 2 ? goTo(a.address) : periscope(a.address)))
        .child(image(`${ART}/blip-${a.status}.gif`).absolute().left(0).top(0).size(40))
        .when(a.focused, (el) => el.child(image(`${ART}/blip-focus.gif`).absolute().left(0).top(0).size(40)))
        .child(div().absolute().top(2).when(right, (el) => el.right(30)).when(!right, (el) => el.left(30))
          .text_size(12).text_color(a.focused ? "#e8ffa0" : STATUS_INK[a.status]).child(ids.get(a.address)));
    });
    const scope = div().relative().flex_none().size(SCOPE)
      .child(image(`${ART}/sonar.gif`).absolute().left(0).top(0).size(SCOPE))
      .children(blips);

    const count = (s) => list.filter((a) => a.status === s).length;
    const line = (label, n, color) => h_flex().justify_between().gap(8)
      .child(div().text_color(INK.dim).child(label)).child(div().text_color(n ? color : INK.dim).child(String(n)));
    const readout = framed("steel", v_flex().gap(6).p(8).text_size(12).bg(INK.glass)
      .child(div().text_color(INK.mid).child("CONTACTS"))
      .child(div().h(1).bg(INK.rule))
      .child(line(WORD.blocked, count("blocked"), INK.red))
      .child(line(WORD.done, count("done"), INK.gold))
      .child(line(WORD.working, count("working"), INK.mid))
      .child(line(WORD.idle, count("idle"), INK.idle))
      .child(div().h(1).bg(INK.rule))
      .child(line("TOTAL", list.length, INK.hi)), { fill: INK.glass });

    return h_flex().size_full().items_center().gap(4).pl(2)
      .child(scope)
      .child(div().flex_1().min_w(0).h(150).child(readout));
  }
}
