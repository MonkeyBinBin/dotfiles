// The sonar: a round scope in a brass ring, the sweep turning, a blip per agent. Each contact sits on its own
// bearing (from its address, so it stays put) at a range by how long it has been under; surfaced ones come
// in close, parked ones lie out at the rim. Beside it a steel plate with the crew's counts. Click a blip for the
// periscope, double-click to go, right-click for its menu. Click a count to look at the next sub in that state
// through the periscope (SOS first); the keys can do it too: `sub.sos` and `sub.loot` (keys.json).
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, run, nextCommand } from "herdr";
import { framed } from "../kit/frame.js";
import { ART, INK, WORD, STATUS_INK, tabsById, depthOf, minutesUnder, contacts, hash, periscope, goTo, subMenu } from "../state.js";

// the scope GIF: 140 native px, shown at 280; its screen's radius is 60 native px
const SCOPE = 280, C = SCOPE / 2, R = 120;

export class Sonar {
  constructor(cx) {
    this.turn = {}; // status -> how many of them the count has shown so far (it cycles)
    cx.timer.every(30000, (cx) => cx.notify());
    // keys: sub.sos, sub.loot (and sub.diving, sub.parked)
    cx.spawn(async () => {
      for (;;) {
        const c = await nextCommand();
        const s = { sos: "blocked", loot: "done", diving: "working", parked: "idle" }[c];
        if (s) this.next(s);
      }
    });
  }

  // the periscope on the next sub in a state, round and round; oldest first
  next(status) {
    const list = agents().filter((a) => a.status === status).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    if (!list.length) return;
    const i = (this.turn[status] ?? 0) % list.length;
    this.turn[status] = i + 1;
    periscope(list[i].address);
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
        .on_mouse_down("right", (_e, cx) => {
          subMenu(a.address);
          cx.stop_propagation();
        })
        .child(image(`${ART}/blip-${a.status}.gif`).absolute().left(0).top(0).size(40))
        .when(a.focused, (el) => el.child(image(`${ART}/blip-focus.gif`).absolute().left(0).top(0).size(40)))
        .child(div().absolute().top(2).when(right, (el) => el.right(30)).when(!right, (el) => el.left(30))
          .text_size(12).text_color(a.focused ? "#e8ffa0" : STATUS_INK[a.status]).child(ids.get(a.address)));
    });
    const scope = div().relative().flex_none().size(SCOPE)
      .child(image(`${ART}/sonar.gif`).absolute().left(0).top(0).size(SCOPE))
      .children(blips);

    const count = (s) => list.filter((a) => a.status === s).length;
    // a count; clicked, the periscope on the next sub in that state
    const line = (label, n, color, status) => h_flex().id(`c-${label}`).justify_between().gap(8).px(4).mx(-4)
      .when(Boolean(status && n), (el) => el.hover((s) => s.bg("#0d3f28")).on_click(() => this.next(status)))
      .child(div().text_color(INK.dim).child(label)).child(div().text_color(n ? color : INK.dim).child(String(n)));
    const readout = framed("steel", v_flex().gap(6).p(8).text_size(12).bg(INK.glass)
      .child(div().text_color(INK.mid).child("CONTACTS"))
      .child(div().h(1).bg(INK.rule))
      .child(line(WORD.blocked, count("blocked"), INK.red, "blocked"))
      .child(line(WORD.done, count("done"), INK.gold, "done"))
      .child(line(WORD.working, count("working"), INK.mid, "working"))
      .child(line(WORD.idle, count("idle"), INK.idle, "idle"))
      .child(div().h(1).bg(INK.rule))
      .child(line("TOTAL", list.length, INK.hi)), { fill: INK.glass });

    return h_flex().size_full().items_center().gap(4).pl(2)
      .child(scope)
      .child(div().flex_1().min_w(0).h(150).child(readout));
  }
}
