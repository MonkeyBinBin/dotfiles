// The sea column: a cross-section of the water in a brass porthole frame. Every agent is a mini-sub in its
// tool's livery; the longer it has been under, the deeper it hangs (the ruler on the left reads minutes).
//   done     surfaced at the waterline, a loot crate in tow, listed in the sky
//   blocked  a red flare trail up to the surface, a pulsing ring round it
//   working  hanging at its depth, an hour down it hovers just over the seabed
//   idle     parked down on the sand
// That Monkey stands in the hatch of his own sub at the top right: alarmed when one is blocked, cheering for a
// moment when one surfaces with loot, dozing while the crew works, else watching the sea. Every sub that
// surfaces is entered in the captain's log (shared "sub.log", "sub.dives"; the log role reads them).
// Under 30 minutes and more, a sub is under pressure: an amber warning ring turns round it. Parked an hour and
// more, it overgrows with barnacles and weed. One that just surfaced throws up a splash and fires a gold flare.
// Click a sub (or its tag) to watch it through the periscope (a floating window with its live terminal);
// double-click to go to it; right-click for its menu (periscope, go, pin, rename, close). The order the column reads in is agent.next's.
// A sub's escorts (state.js escortsOf) are tiny torpedoes on a line of their own in its tag: hover for who and how long, click one with a
// terminal for its periscope.
import { div, image, svg, Background, PathBuilder } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, run, setAgentOrder, shared, setShared } from "herdr";
import { battleLight, onAlert } from "../kit/battle-light.js";
import { framed } from "../kit/frame.js";
import { sprite } from "../kit/sprite.js";
import { facingRight, motionOf, position, rand, route, walk } from "../swim.js";
import { ART, INK, RANK, WORD, RULER, STATUS_INK, toolOf, toolName, titleOf, since, tabsById, periscope, goTo, subMenu, underSince, depthOf, minutesUnder, minutesParked, contacts, escortsOf, PRESSURE_MIN, MOSS_MIN } from "../state.js";

// The scenery strips, baked at 4x and shown at 2x: sky 64, surface 40, seabed 30 native px, all 176 wide.
const W = 352, SKY = 128, SURFACE = 80, SEABED = 60, WATERLINE = SKY + 4;
const WATER_TOP = "#0c4a66", WATER_DEEP = "#03151f";
// The layout round it (layouts/sub.json): bars, the gap, the sonar under it, this frame's own border.
const CHROME = 48 + 96 + 8 + 296 + 36;
// a layer filling its (relative) parent with a top-to-bottom gradient
const RECT = () => PathBuilder.fill().move_to("0%", "0%").line_to("100%", "0%").line_to("100%", "100%").line_to("0%", "100%").close().build();
const gradient = (from, to) => window.paint_path(RECT(), Background.linear_gradient(180, from, to)).absolute().top(0).left(0).size_full();
// A sprite plays there and back: given twice as long, and taken away at the far end, it plays once.
const LOG_MAX = 20, SPLASH_MS = 1800;
// the swimmers, top to bottom of the water: `lane` (0..1), how they swim (swim.js route), ms before the first crossing
const SWIMMERS = [
  { name: "shoal", lane: 0.12, speed: 46, steps: 4, rise: 20, turns: 0.25, stops: 0.1, wait: 0 },
  { name: "sea-turtle", lane: 0.4, speed: 22, steps: 3, rise: 12, turns: 0.1, stops: 0.3, wait: 6000 },
  { name: "puffer", lane: 0.66, speed: 28, steps: 4, rise: 14, turns: 0.35, stops: 0.5, wait: 14000 },
];
const SWIM_W = 80, SWIM_H = 48;
// the light from above: each shaft breathes at its own pace, how bright at most
const RAYS = [[0, 7300, 0.55], [1, 9100, 0.4], [2, 6100, 0.5], [3, 11300, 0.35]];
const BUBBLE_EVERY = [6000, 15000], BUBBLES = 7;
// the subs hang right of the ruler's labels, nose toward them; HULL_X keeps the propeller clear of the tag
const SUB_X = 62, ROW = 44, SUB_W = 52, SUB_H = 40, HULL_X = -6, LOOT_H = 60, CAPTAIN = [196, 140], HAPPY_MS = 3600;
const TOOL_ICON = 14;
// a compact tag has no line for its escorts: one small torpedo sits in its only line
const ESCORT_W = 36, ESCORT_H = 21, ESCORT_ROW = ESCORT_H + 4, COMPACT_ESCORT_W = 24, COMPACT_ESCORT_H = 14, MAX_ESCORTS = 5;
// The agent's icon from the app's program table, or null when it has none: a one-color glyph or a picture.
const toolIcon = (p, color) => !p?.icon ? null
  : p.tint ? svg(p.icon).size(TOOL_ICON).flex_none().text_color(color)
  : image(p.icon).size(TOOL_ICON).flex_none();

export class Sea {
  constructor(cx) {
    this.prev = new Map(); // agent address -> last status seen
    this.started = false;
    this.happyUntil = 0;
    this.surfacing = new Map(); // address -> until when its splash and flare show
    this.swimmers = SWIMMERS.map((s) => ({ ...s, trip: 0, right: Math.random() < 0.5, leg: -1, legs: null }));
    for (const s of this.swimmers) cx.timer.after(s.wait + 100, (cx) => this.swim(cx, s));
    this.jelly = { from: { x: 270, y: 0 }, legs: [], leg: -1 };
    this.crab = { from: { x: 140, y: 0 }, legs: [], leg: -1 };
    this.pulse(cx);
    this.scuttle(cx);
    this.vent = null;
    this.vents = 0;
    this.nextVent(cx);
    // the depths and clocks move with time
    cx.timer.every(30000, (cx) => cx.notify());
  }

  // One crossing, then a while out of sight before coming back the other way. A new id per trip: it starts from its
  // mark at once, with no transition across the water.
  swim(cx, s) {
    s.right = !s.right;
    s.trip += 1;
    s.legs = route(W, SWIM_W, s.right, { ...s, back: [24, 60] });
    s.from = { x: s.right ? -SWIM_W - 10 : W + 10, y: 0 };
    s.leg = -1;
    cx.notify();
    walk(cx, s, (cx) => cx.timer.after(rand(3000, 9000), (cx) => this.swim(cx, s)));
  }

  // The jelly's way of getting about: a quick push up as its bell squeezes, then a long slow sink, drifting all the while.
  pulse(cx) {
    const j = this.jelly, was = position(j) ?? j.from;
    j.from = { x: was.x, y: was.y };
    let { x, y } = j.from;
    j.legs = [];
    for (let i = 0; i < 4; i++) {
      x = Math.max(36, Math.min(W - 80, x + rand(-24, 24)));
      y = Math.max(-90, Math.min(70, y - rand(16, 30) + (y < -50 ? 24 : 0)));
      j.legs.push({ x, y, ms: rand(1000, 1400), easing: "ease-out" });
      y = Math.min(80, y + rand(7, 14));
      j.legs.push({ x, y, ms: rand(2200, 3400), easing: "linear" });
    }
    walk(cx, j, (cx) => this.pulse(cx));
  }

  // The crab scuttles a little way along the sand, stops to look about, and goes on.
  scuttle(cx) {
    const c = this.crab, was = position(c) ?? c.from;
    c.from = { x: was.x, y: 0 };
    let x = c.from.x;
    c.legs = [];
    for (let i = 0; i < 4; i++) {
      const nx = Math.max(56, Math.min(W - 110, x + rand(26, 80) * (Math.random() < 0.5 ? -1 : 1)));
      c.legs.push({ x: nx, y: 0, ms: (Math.abs(nx - x) / 22) * 1000 + 200, easing: "ease-in-out" });
      c.legs.push({ x: nx, y: 0, ms: rand(1200, 4200), easing: "linear" });
      x = nx;
    }
    walk(cx, c, (cx) => this.scuttle(cx));
  }

  // A string of bubbles let go from somewhere on the seabed, rising all the way to the surface.
  nextVent(cx) {
    cx.timer.after(rand(...BUBBLE_EVERY), (cx) => {
      const id = ++this.vents;
      this.vent = { id, x: rand(50, W - 60), up: false };
      cx.notify();
      cx.timer.after(120, (cx) => {
        this.vent.up = true;
        cx.notify();
      });
      cx.timer.after(BUBBLES * 500 + 7000, (cx) => {
        this.vent = null;
        cx.notify();
        this.nextVent(cx);
      });
    });
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
      for (const a of surfaced) this.surfacing.set(a.address, Date.now() + SPLASH_MS);
      cx.timer.after(SPLASH_MS + 50, (cx) => cx.notify());
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
      subMenu(a.address);
      cx.stop_propagation();
    };
  }

  // the lock-on brackets round the focused agent's tag, standing off it evenly whatever size it comes out
  brackets() {
    const arm = (pos, sides) => {
      let el = div().absolute().size(10).border_color("#e8ffa0");
      for (const s of sides) el = el[`border_${s}`](2);
      for (const [k, v] of Object.entries(pos)) el = el[k](v);
      return el;
    };
    return div().absolute().top(-6).left(-6).right(-6).bottom(-6).loop("opacity", { from: 0.45, to: 1, period: 900 })
      .child(arm({ top: 0, left: 0 }, ["t", "l"])).child(arm({ top: 0, right: 0 }, ["t", "r"]))
      .child(arm({ bottom: 0, left: 0 }, ["b", "l"])).child(arm({ bottom: 0, right: 0 }, ["b", "r"]));
  }

  // the tiny torpedoes of an agent's escorts, and how many didn't fit; a compact tag has room for one
  escorts(a, compact) {
    // past the most that fit, the last torpedo gives way to the +N
    const list = escortsOf(a.address), room = compact ? 1 : list.length > MAX_ESCORTS ? MAX_ESCORTS - 1 : MAX_ESCORTS;
    const w = compact ? COMPACT_ESCORT_W : ESCORT_W, h = compact ? COMPACT_ESCORT_H : ESCORT_H;
    if (!list.length) return null;
    return h_flex().flex_none().gap(2).items_center()
      .children(list.slice(0, room).map((e) => div().id(`esc-${a.address}-${e.key}`).relative().flex_none().w(w).h(h)
        .tooltip([e.name, WORD[e.status] ?? e.status, since(e.since)].filter(Boolean).join(" · "))
        .when(Boolean(e.address), (el) => el
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click(() => periscope(e.address)))
        .child(sprite(`torpedo-${e.tool}`, w, h))
        .when(e.status === "blocked", (el) => el.child(div().absolute().top(0).right(0).size(4).bg(INK.red)))))
      .when(list.length > room, (el) => el.child(div().text_color(INK.seaDim).child(`+${list.length - room}`)));
  }

  // an agent's tag: contact number, title, status word; its tool's icon (else its name), space, clock under it. `alert`: under pressure
  // or overgrown, which changes its word and clock
  tag(a, id, tabs, w, compact, alert) {
    const clock = a.status === "idle" ? (alert ? `${since(tabs.get(a.tab)?.changed_at)} idle` : "") : since(a.status === "working" ? underSince(a, tabs) : tabs.get(a.tab)?.changed_at);
    const word = alert === "pressure" ? ["PRESSURE", "#ffb055"] : alert === "moss" ? ["OVERGROWN", "#7aaa5a"] : [WORD[a.status], STATUS_INK[a.status]];
    const title = a.status === "blocked" ? INK.redSoft : a.status === "idle" ? INK.seaDim : INK.sea;
    const escorts = this.escorts(a, compact);
    const line1 = h_flex().gap(8).items_center()
      .child(div().flex_none().text_color(INK.seaId).child(id))
      .child(div().flex_1().min_w(0).truncate().text_color(title).child(titleOf(a)))
      .when(a.pinned, (el) => el.child(div().flex_none().text_color(INK.gold).child("PIN")))
      .when(compact && Boolean(escorts), (el) => el.child(escorts))
      .child(div().flex_none().text_color(word[1]).child(word[0]));
    // on a dark, see-through backing so passing sea life never muddles the text
    const tagEl = v_flex().relative().w(w).gap(4).text_size(12).px(6).py(3).mx(-6).bg("#03151fe6")
      .child(line1)
      .when(!compact, (el) => {
        const color = alert === "pressure" ? "#ffb055" : INK.seaDim, icon = toolIcon(a.program, color);
        return el.child(h_flex().pl(14).gap(6).items_center().text_color(color)
          .when(Boolean(icon), (row) => row.child(icon))
          .child(div().flex_1().min_w(0).truncate().child([icon ? null : toolName(a), a.space_name, clock].filter(Boolean).join(" · "))))
          .when(Boolean(escorts), (tall) => tall.child(div().pl(14).child(escorts)));
      });
    return a.focused ? tagEl.child(this.brackets()) : tagEl;
  }

  render(cx) {
    const list = agents(), tabs = tabsById(), ids = contacts(list), now = Date.now();
    this.watch(list, cx);
    const vh = window.viewport_size?.().height ?? 900;
    const H = Math.max(SKY + SURFACE + SEABED, vh - CHROME);

    // surfaced ones, the latest up first (so a fresh splash is never past the three shown)
    const done = list.filter((a) => a.status === "done").sort((p, q) => (tabs.get(q.tab)?.changed_at ?? 0) - (tabs.get(p.tab)?.changed_at ?? 0));
    const under = list.filter((a) => a.status !== "done");
    // where each one under wants to hang (row top), then nudged apart so tags never overlap
    // (the bottom of the depth scale stays a row above the sand, which is for the parked)
    const top = WATERLINE + 30, bottom = H - 16;
    const yOf = (f) => top + f * (bottom - top - 2 * ROW);
    // a sub with escorts takes a taller row, its center still on its depth; when those don't all fit, every tag goes compact
    const room = bottom - top, row = under.length * ROW > room ? Math.max(22, Math.floor(room / under.length)) : ROW;
    const heightOf = (a) => row + (escortsOf(a.address).length ? ESCORT_ROW : 0);
    const compact = row < 40 || under.reduce((sum, a) => sum + heightOf(a), 0) > room;
    const want = under.map((a) => {
      const h = compact ? row : heightOf(a);
      return { a, h, y: a.status === "idle" ? bottom - h : yOf(depthOf(minutesUnder(a, tabs, now))) - (h - ROW) / 2 };
    }).sort((p, q) => p.y - q.y || RANK[p.a.status] - RANK[q.a.status]);
    for (let i = 0; i < want.length; i++) want[i].y = Math.max(want[i].y, i ? want[i - 1].y + want[i - 1].h : top);
    for (let i = want.length - 1; i >= 0; i--) want[i].y = Math.min(want[i].y, (i < want.length - 1 ? want[i + 1].y : bottom) - want[i].h);
    setAgentOrder([...done, ...want.map((w) => w.a)].sort((p, q) => (q.pinned - p.pinned) || (RANK[p.status] - RANK[q.status])).map((a) => a.address));

    // scenery: sky, the surface, the deepening water, the seabed; a few fish and a jelly for life
    const scene = v_flex().absolute().top(0).left(0).w(W).h(H)
      .child(sprite("sea-sky", W, SKY).flex_none())
      .child(sprite("sea-water", W, SURFACE).flex_none())
      .child(div().relative().w(W).flex_1().child(gradient(WATER_TOP, WATER_DEEP)))
      .child(sprite("sea-seabed", W, SEABED).flex_none());
    // sea life, behind the crew: swimmers cross their lanes and turn round off-screen,
    // the jelly drifts, garden eels stand out of their burrows in the sand, the crab scuttles along the seabed,
    // the seahorse bobs by the kelp
    const water = (f) => Math.round(WATERLINE + 40 + f * (H - SEABED - WATERLINE - 64));
    const life = [
      ...this.swimmers.filter((s) => s.legs).map((s) => {
        const now = position(s), motion = motionOf(now);
        return div().id(`swim-${s.name}-${s.trip}`).absolute().left(Math.round(now.x)).top(water(s.lane) + Math.round(now.y))
          .transition("left", motion).transition("top", motion)
          .child(sprite(`${s.name}-${facingRight(s) ? "r" : "l"}`, SWIM_W, SWIM_H));
      }),
      ...(() => {
        const now = position(this.jelly) ?? this.jelly.from, motion = motionOf(now);
        return [div().id("jelly").absolute().left(Math.round(now.x)).top(water(0.5) + Math.round(now.y))
          .transition("left", motion).transition("top", motion).child(sprite("jelly", 40, 36))];
      })(),
      // the colony's burrows sit on the seabed strip's sand (its top 40 px down; the sprite's burrows 82 px down)
      sprite("eel-colony", 144, 84).absolute().left(84).top(H - SEABED + 40 - 82),
      ...(() => {
        const now = position(this.crab) ?? this.crab.from;
        return [div().id("crab").absolute().top(H - 52).left(Math.round(now.x)).transition("left", motionOf(now)).child(sprite("crab", 48, 32))];
      })(),
      div().absolute().left(300).top(H - SEABED - 30).loop("top", { from: H - SEABED - 34, to: H - SEABED - 22, period: 3400 })
        .child(sprite("seahorse", 32, 48)),
    ];
    // the shafts of light, over the water and behind everything in it
    const rays = RAYS.map(([n, period, peak]) => image(`${ART}/sea-ray-${n}.png`).absolute().left(0).top(WATERLINE + 2).w(W).h(180)
      .loop("opacity", { from: 0.05, to: peak, period }));
    // a string of bubbles on its way up, each wobbling as it goes
    const bubbles = this.vent ? Array.from({ length: BUBBLES }, (_, i) => {
      const size = 3 + (i % 3) * 2;
      return div().id(`vent-${this.vent.id}-${i}`).absolute().left(Math.round(this.vent.x + (i % 3) * 3)).top(this.vent.up ? WATERLINE + 8 : H - SEABED + 6)
        .transition("top", { duration: 5200 + (i % 3) * 700, delay: i * 500, easing: "ease-in" }).opacity(0.75)
        .child(div().relative().loop("left", { from: -3, to: 3, period: 1100 + i * 90 }).child(div().size(size).rounded_full().border_1().border_color("#8ad8ff")));
    }) : [];
    // the ruler: minutes under
    const ruler = RULER.map((m) => {
      const y = Math.round(yOf(depthOf(m)) + ROW / 2);
      // the gauge's red zone: from the pressure line down
      const c = m >= PRESSURE_MIN ? "#ffb055" : INK.ruler;
      return h_flex().absolute().left(0).top(y - 7).gap(4).items_center().text_size(12).text_color(c).opacity(0.75)
        .child(div().w(m % 15 ? 6 : 10).h(2).bg(c)).child(`${m} min`);
    });

    // the captain, his hatch at the waterline on the right
    const captain = sprite(`captain-${this.mood(list)}`, CAPTAIN[0], CAPTAIN[1]).absolute().top(WATERLINE - 132).left(W - 168);

    // surfaced subs bobbing at the waterline, their tags in the sky; one just up throws a splash and a flare
    for (const [k, until] of this.surfacing) if (until < now) this.surfacing.delete(k);
    const surfaced = done.slice(0, 3).map((a, i) => div().id(`s-${a.address}`).absolute().left(10 + i * 50).top(WATERLINE - 28)
      .on_click(this.go(a)).on_mouse_down("right", this.pin(a))
      .child(sprite(`minisub-${toolOf(a)}-loot`, SUB_W, LOOT_H)));
    const burst = (name, a, i, top, h) => div().id(`${name}-${a.address}-${this.surfacing.get(a.address)}`).absolute().left(10 + i * 50 + 24 - 40).top(top)
      .child(sprite(name, 80, h, { period: SPLASH_MS * 2 }));
    const bursts = done.slice(0, 3).flatMap((a, i) => this.surfacing.has(a.address) ? [burst("splash", a, i, WATERLINE - 48, 56), burst("flare", a, i, WATERLINE - 84, 88)] : []);
    const sky = v_flex().absolute().left(16).top(14).w(192).gap(6)
      .child(div().text_size(12).text_color("#9ab8ff").child(`SURFACED · ${done.length}`))
      .children(done.slice(0, 2).map((a) => div().id(`st-${a.address}`).on_click(this.go(a)).on_mouse_down("right", this.pin(a))
        .child(this.tag(a, ids.get(a.address), tabs, 196, true))))
      .when(done.length > 2, (el) => el.child(div().text_size(12).text_color(INK.seaDim).child(`+${done.length - 2} more`)));

    // the ones under: flare trails first (behind), then each sub with its tag
    const subScale = compact ? 0.6 : 1;
    const flares = want.filter((w) => w.a.status === "blocked").map((w) => {
      // up from the top of the hull, centered in its row
      const h = Math.max(0, w.y + (w.h - SUB_H * subScale) / 2 - WATERLINE);
      return v_flex().absolute().left(SUB_X + 18).top(WATERLINE + 4).h(h).gap(4)
        .children(Array.from({ length: Math.floor(h / 6) }, () => div().size(2).bg(INK.red)));
    });
    const subs = want.map(({ a, y, h }) => {
      const s = subScale;
      const alert = a.status === "working" && minutesUnder(a, tabs, now) >= PRESSURE_MIN ? "pressure"
        : a.status === "idle" && minutesParked(a, tabs, now) >= MOSS_MIN ? "moss" : null;
      const look = alert === "moss" ? sprite(`minisub-${toolOf(a)}-moss`, SUB_W * s, LOOT_H * s)
        : sprite(`minisub-${toolOf(a)}`, SUB_W * s, SUB_H * s);
      // the hull's box is its own height whatever hangs under it (moss), so the hull and the tag center on each other
      const hull = div().relative().flex_none().w(SUB_W).h(SUB_H * s)
        .when(a.status === "blocked", (el) => el.child(sprite("blip-blocked", 56).absolute().left(HULL_X - 4).top(-10)))
        .when(alert === "pressure" && !compact, (el) => el.child(sprite("pressure", 80, 76).absolute().left(HULL_X - 16).top(-28)))
        .child(div().absolute().left(compact ? 0 : HULL_X).top(0).child(look));
      return h_flex().id(`u-${a.address}`).absolute().left(SUB_X).top(Math.round(y)).w(W - SUB_X - 8).h(h).items_center().pl(2)
        .on_click(this.go(a)).on_mouse_down("right", this.pin(a))
        .child(hull)
        .child(div().flex_none().child(this.tag(a, ids.get(a.address), tabs, W - SUB_X - 8 - 62, compact, alert)));
    });

    const sea = div().relative().size_full().overflow_hidden()
      .child(scene).children(rays).children(bubbles).children(life).when(onAlert(), (el) => el.child(battleLight(0.35))).children(ruler).children(flares)
      .child(captain).children(surfaced).children(bursts).child(sky).children(subs)
      .when(!list.length, (el) => el.child(div().absolute().left(0).w(W).top(Math.round(H * 0.55)).flex().justify_center()
        .text_size(12).text_color(INK.seaDim).child("No crew out. Calm seas.")));
    return framed("bezel", sea, { fill: WATER_DEEP });
  }
}
