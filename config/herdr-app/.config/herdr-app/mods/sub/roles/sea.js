// The sea column: a cross-section of the water in a brass porthole frame. Every agent is a mini-sub in its
// tool's livery; the longer it has been under, the deeper it hangs (the ruler on the left reads minutes).
//   done     surfaced at the waterline, a loot crate in tow, listed in the sky
//   blocked  a red flare trail up to the surface, a pulsing ring round it
//   working  hanging at its depth
//   idle     parked down on the seabed
// That Monkey stands in the hatch of his own sub at the top right: alarmed when one is blocked, cheering for a
// moment when one surfaces with loot, dozing while the crew works, else watching the sea. Every sub that
// surfaces is entered in the captain's log (shared "sub.log", "sub.dives"; the log role reads them).
// Click a sub (or its tag) to watch it through the periscope (a floating window with its live terminal);
// double-click to go to it; right-click to pin it. The order the column reads in is agent.next's.
import { div, image, Background, PathBuilder } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, run, setAgentOrder, shared, setShared } from "herdr";
import { framed } from "../kit/frame.js";
import { ART, INK, RANK, WORD, RULER, STATUS_INK, toolOf, toolName, titleOf, since, tabsById, periscope, goTo, underSince, depthOf, minutesUnder, contacts } from "../state.js";

// The scenery strips, baked at 4x and shown at 2x: sky 64, surface 40, seabed 30 native px, all 176 wide.
const W = 352, SKY = 128, SURFACE = 80, SEABED = 60, WATERLINE = SKY + 4;
const WATER_TOP = "#0c4a66", WATER_DEEP = "#03151f";
// The layout round it (layouts/sub.json): bars, the gap, the sonar under it, this frame's own border.
const CHROME = 48 + 48 + 8 + 296 + 36;
// a layer filling its (relative) parent with a top-to-bottom gradient
const RECT = () => PathBuilder.fill().move_to("0%", "0%").line_to("100%", "0%").line_to("100%", "100%").line_to("0%", "100%").close().build();
const gradient = (from, to) => window.paint_path(RECT(), Background.linear_gradient(180, from, to)).absolute().top(0).left(0).size_full();
const LOG_MAX = 20;
// the swimmers' lanes, top to bottom of the water (0..1)
const LANES = [["school", 0.08], ["turtle", 0.32], ["puffer", 0.6]];
const ROW = 44, SUB_W = 52, SUB_H = 40, LOOT_H = 60, CAPTAIN = [196, 140], HAPPY_MS = 3600;

export class Sea {
  constructor(cx) {
    this.prev = new Map(); // agent address -> last status seen
    this.started = false;
    this.happyUntil = 0;
    // the depths and clocks move with time
    cx.timer.every(30000, (cx) => cx.notify());
  }

  // Agents that just surfaced with loot make him cheer and go in the log; seeded on the first render so a
  // restart doesn't.
  watch(list, cx) {
    const surfaced = [];
    for (const a of list) {
      const was = this.prev.get(a.address);
      if (this.started && a.status === "done" && was && was !== "done") surfaced.push(a);
      this.prev.set(a.address, a.status);
    }
    this.started = true;
    if (surfaced.length) {
      const dives = shared("sub.dives") ?? 0;
      const entries = surfaced.map((a, i) => ({ n: dives + i + 1, title: titleOf(a), tool: toolName(a), app: toolOf(a), space: a.space_name, at: Date.now() }));
      setShared("sub.dives", dives + surfaced.length);
      setShared("sub.log", [...entries.reverse(), ...(shared("sub.log") ?? [])].slice(0, LOG_MAX));
      this.happyUntil = Date.now() + HAPPY_MS;
      cx.timer.after(HAPPY_MS + 50, (cx) => cx.notify());
    }
  }

  mood(list) {
    if (list.some((a) => a.status === "blocked")) return "alarm";
    if (Date.now() < this.happyUntil) return "happy";
    if (list.some((a) => a.status === "working")) return "sleep";
    return "idle";
  }

  go(a) {
    return (e) => (e?.click_count === 2 ? goTo(a.address) : periscope(a.address));
  }
  pin(a) {
    return (_e, cx) => {
      run("terminal.pin", { terminal: a.address, pinned: !a.pinned });
      cx.stop_propagation();
    };
  }

  // the lock-on brackets round the focused agent's tag
  brackets(w, h) {
    const arm = (pos, sides) => {
      let el = div().absolute().size(10).border_color("#e8ffa0");
      for (const s of sides) el = el[`border_${s}`](2);
      for (const [k, v] of Object.entries(pos)) el = el[k](v);
      return el;
    };
    return div().absolute().top(-6).left(-6).w(w + 12).h(h + 12).loop("opacity", { from: 0.45, to: 1, period: 900 })
      .child(arm({ top: 0, left: 0 }, ["t", "l"])).child(arm({ top: 0, right: 0 }, ["t", "r"]))
      .child(arm({ bottom: 0, left: 0 }, ["b", "l"])).child(arm({ bottom: 0, right: 0 }, ["b", "r"]));
  }

  // an agent's tag: contact number, title, status word; tool · space · clock under it
  tag(a, id, tabs, w, compact) {
    const clock = a.status === "idle" ? "" : since(a.status === "working" ? underSince(a, tabs) : tabs.get(a.tab)?.changed_at);
    const title = a.status === "blocked" ? INK.redSoft : a.status === "idle" ? INK.seaDim : INK.sea;
    const line1 = h_flex().gap(8).items_center()
      .child(div().flex_none().text_color(INK.seaId).child(id))
      .child(div().flex_1().min_w(0).truncate().text_color(title).child(titleOf(a)))
      .when(a.pinned, (el) => el.child(div().flex_none().text_color(INK.gold).child("PIN")))
      .child(div().flex_none().text_color(STATUS_INK[a.status]).child(WORD[a.status]));
    const tagEl = v_flex().relative().w(w).gap(4).text_size(12)
      .child(line1)
      .when(!compact, (el) => el.child(div().pl(26).truncate().text_color(INK.seaDim)
        .child([toolName(a), a.space_name, clock].filter(Boolean).join(" · "))));
    return a.focused ? tagEl.child(this.brackets(w, compact ? 14 : 32)) : tagEl;
  }

  render(cx) {
    const list = agents(), tabs = tabsById(), ids = contacts(list), now = Date.now();
    this.watch(list, cx);
    const vh = window.viewport_size?.().height ?? 900;
    const H = Math.max(SKY + SURFACE + SEABED, vh - CHROME);

    const done = list.filter((a) => a.status === "done");
    const under = list.filter((a) => a.status !== "done");
    // where each one under wants to hang (row top), then nudged apart so tags never overlap
    const top = WATERLINE + 30, bottom = H - 34;
    const yOf = (f) => top + f * (bottom - top - ROW);
    const want = under.map((a) => ({ a, y: a.status === "idle" ? bottom - ROW : yOf(depthOf(minutesUnder(a, tabs, now))) }))
      .sort((p, q) => p.y - q.y || RANK[p.a.status] - RANK[q.a.status]);
    const room = bottom - top, row = want.length * ROW > room ? Math.max(22, Math.floor(room / want.length)) : ROW;
    const compact = row < 40;
    for (let i = 0; i < want.length; i++) want[i].y = Math.max(want[i].y, i ? want[i - 1].y + row : top);
    for (let i = want.length - 1; i >= 0; i--) want[i].y = Math.min(want[i].y, i < want.length - 1 ? want[i + 1].y - row : bottom - row);
    setAgentOrder([...done, ...want.map((w) => w.a)].sort((p, q) => (q.pinned - p.pinned) || (RANK[p.status] - RANK[q.status])).map((a) => a.address));

    // scenery: sky, the surface, the deepening water, the seabed; a few fish and a jelly for life
    const scene = v_flex().absolute().top(0).left(0).w(W).h(H)
      .child(image(`${ART}/sea-sky.gif`).w(W).h(SKY).flex_none())
      .child(image(`${ART}/sea-surface.gif`).w(W).h(SURFACE).flex_none())
      .child(div().relative().w(W).flex_1().child(gradient(WATER_TOP, WATER_DEEP)))
      .child(image(`${ART}/sea-seabed.gif`).w(W).h(SEABED).flex_none());
    // sea life, behind the crew: swimmers cross their lanes and turn round off-screen (the GIFs carry it all),
    // the jelly drifts, garden eels stand out of their burrows in the sand, the crab scuttles along the seabed,
    // the seahorse bobs by the kelp
    const water = (f) => Math.round(WATERLINE + 40 + f * (H - SEABED - WATERLINE - 64));
    const life = [
      ...LANES.map(([name, f]) => image(`${ART}/${name}.gif`).absolute().left(0).top(water(f)).w(W).h(48)),
      div().absolute().left(250).top(water(0.55)).loop("left", { from: 220, to: 290, period: 9000 })
        .child(div().relative().loop("top", { from: 0, to: 26, period: 5200 }).child(image(`${ART}/jelly.gif`).w(40).h(36))),
      // the colony's burrows sit on the seabed strip's sand (its top 40 px down; the GIF's burrows 82 px down)
      image(`${ART}/garden-eels.gif`).absolute().left(84).top(H - SEABED + 40 - 82).w(144).h(84),
      image(`${ART}/crab.gif`).absolute().top(H - 52).w(48).h(32).loop("left", { from: 60, to: 230, period: 14000 }),
      div().absolute().left(300).top(H - SEABED - 30).loop("top", { from: H - SEABED - 34, to: H - SEABED - 22, period: 3400 })
        .child(image(`${ART}/seahorse.gif`).w(32).h(48)),
    ];
    // the ruler: minutes under
    const ruler = RULER.map((m) => {
      const y = Math.round(yOf(depthOf(m)) + ROW / 2);
      return h_flex().absolute().left(0).top(y - 7).gap(4).items_center().text_size(12).text_color(INK.ruler).opacity(0.75)
        .child(div().w(m % 15 ? 6 : 10).h(2).bg(INK.ruler)).child(`${m}m`);
    });

    // the captain, his hatch at the waterline on the right
    const captain = image(`${ART}/captain-${this.mood(list)}.gif`).absolute().top(WATERLINE - 132).left(W - 168).w(CAPTAIN[0]).h(CAPTAIN[1]);

    // surfaced subs bobbing at the waterline, their tags in the sky
    const surfaced = done.slice(0, 3).map((a, i) => div().id(`s-${a.address}`).absolute().left(10 + i * 50).top(WATERLINE - 28)
      .on_click(this.go(a)).on_mouse_down("right", this.pin(a))
      .child(image(`${ART}/minisub-${toolOf(a)}-loot.gif`).w(SUB_W).h(LOOT_H)));
    const sky = v_flex().absolute().left(12).top(10).w(196).gap(6)
      .child(div().text_size(12).text_color("#9ab8ff").child(`SURFACED · ${done.length}`))
      .children(done.slice(0, 2).map((a) => div().id(`st-${a.address}`).on_click(this.go(a)).on_mouse_down("right", this.pin(a))
        .child(this.tag(a, ids.get(a.address), tabs, 196, true))))
      .when(done.length > 2, (el) => el.child(div().text_size(12).text_color(INK.seaDim).child(`+${done.length - 2} more`)));

    // the ones under: flare trails first (behind), then each sub with its tag
    const flares = want.filter((w) => w.a.status === "blocked").map((w) => {
      const h = Math.max(0, w.y - WATERLINE);
      return v_flex().absolute().left(46).top(WATERLINE + 4).h(h).gap(4)
        .children(Array.from({ length: Math.floor(h / 6) }, () => div().size(2).bg(INK.red)));
    });
    const subs = want.map(({ a, y }) => {
      const s = compact ? 0.6 : 1;
      return div().id(`u-${a.address}`).absolute().left(28).top(Math.round(y)).w(W - 36).h(row)
        .on_click(this.go(a)).on_mouse_down("right", this.pin(a))
        .when(a.status === "blocked", (el) => el.child(image(`${ART}/blip-blocked.gif`).absolute().left(0).top(-10).size(56)))
        .child(image(`${ART}/minisub-${toolOf(a)}.gif`).absolute().left(2).top(compact ? -4 : 0).w(SUB_W * s).h(SUB_H * s))
        .child(div().absolute().left(58).top(compact ? 2 : 4).child(this.tag(a, ids.get(a.address), tabs, W - 36 - 66, compact)));
    });

    const sea = div().relative().size_full().overflow_hidden()
      .child(scene).children(life).children(ruler).children(flares)
      .child(captain).children(surfaced).child(sky).children(subs)
      .when(!list.length, (el) => el.child(div().absolute().left(0).w(W).top(Math.round(H * 0.55)).flex().justify_center()
        .text_size(12).text_color(INK.seaDim).child("No crew out. Calm seas.")));
    return framed("bezel", sea, { fill: WATER_DEEP });
  }
}
