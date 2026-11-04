// A pane's header, inside its porthole: a status lamp, the space and the agent's title (or the terminal's),
// the tool and how long it has been under on the right; on hover, buttons to split, zoom and close. Phosphor on
// the pane's dark glass, a thin rule under it. It signals the agent's state:
//   working  air bubbles rising out along the right
//   blocked  a red beacon turning in place of the lamp, the glass pulsing red, SOS
//   done     a gold glint sweeping across, SURFACED
// It also flashes when asked to show itself (state.js periscope(): the agent is already on screen).
// Now and then a little scene plays out behind the text, unless the agent is blocked or just surfaced.
// Props from the app: { pane, terminal }.
import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, agents, run, shared } from "herdr";
import { sprite } from "../kit/sprite.js";
import { facingRight, motionOf, pick, position, rand, route, walk } from "../swim.js";
import { FLASH_MS, INK, since, tabsById, toolOf, underSince } from "../state.js";

// What goes on behind the header's text, picked by what the agent is up to. Every actor swims a path of legs, each to an
// { x, y } mark in `ms`: climbing and diving, stopping to hang there, doubling back (its sprite turns round with it).
const HIGH = 48;

// The same way, a little off to one side and at another pace.
const trail = (legs, dy, pace) => legs.map((l) => ({ ...l, y: l.y + dy, ms: l.ms * pace }));

// One actor per entry. `after`: ms before it sets off. `rock`: how much it rocks on top of its path.
const SCENES = {
  chase: (W, right) => {
    const fleeing = route(W, 80, right, { speed: 780, steps: 7, rise: 12, turns: 0.12, easing: "ease-out" });
    return [{ name: "shoal", w: 80, h: 48, legs: fleeing }, { name: "reef-shark", w: 88, h: 48, legs: trail(fleeing, 2, 3.2), after: 1000 }];
  },
  school: (W, right) => {
    const legs = route(W, 80, right, { speed: 280, steps: 7, rise: 10, turns: 0.3 });
    return [{ name: "shoal", w: 80, h: 48, legs, rock: 3 }, { name: "shoal", w: 80, h: 48, legs: trail(legs, 5, 1.04), after: 1300, rock: 3, opacity: 0.55 }];
  },
  sub: (W) => [{ tool: true, w: 52, h: 40, legs: route(W, 52, true, { speed: 240, steps: 6, rise: 7, stops: 0.25 }), rock: 2 }],
  turtle: (W, right) => [{ name: "sea-turtle", w: 80, h: 48, legs: route(W, 80, right, { speed: 120, steps: 6, rise: 9, turns: 0.2, stops: 0.2 }), rock: 3 }],
  puffer: (W, right) => [{ name: "puffer", w: 80, h: 48, legs: route(W, 80, right, { speed: 200, steps: 6, rise: 8, turns: 0.3, stops: 0.5 }) }],
  angler: (W, right) => [{ name: "angler", w: 80, h: 48, legs: route(W, 80, right, { speed: 120, steps: 7, rise: 6, stops: 0.4, lunges: 0.25 }), rock: 2 }],
  whale: (W, right) => [{ name: "great-whale", w: 240, h: 48, opacity: 0.95, legs: route(W, 240, right, { speed: 90, steps: 4, rise: 3 }) }],
  // the jellies climb in pulses, drifting sideways as they go; the bubbles rise straight, wobbling
  jellies: (W) => [[0.42, 40, 36, 0, 1], [0.55, 30, 27, 1200, 0.6], [0.67, 40, 36, 2400, 1]].map(([at, w, h, after, opacity]) => {
    const home = at * W, legs = Array.from({ length: 5 }, (_, i) => ({ x: home + rand(-46, 46), y: 44 - ((i + 1) * (HIGH + h)) / 5, ms: rand(1100, 1700), easing: "ease-out" }));
    return { still: "jelly", w, h, after, opacity, rises: true, from: { x: home, y: 44 }, legs };
  }),
  bubbles: (W) => Array.from({ length: 11 }, (_, i) => {
    const size = 4 + (i % 3) * 3, x = (0.25 + ((i * 37) % 50) / 100) * W;
    return { bubble: size, w: size, h: size, wobble: 3, after: i * 260, rises: true, from: { x, y: 44 }, legs: [{ x, y: -size - 4 - HIGH / 2, ms: 1900 + (i % 4) * 500, easing: "linear" }] };
  }),
};
const BUSY = ["chase", "school", "sub", "bubbles", "chase", "jellies"], CALM = ["whale", "turtle", "jellies", "angler", "puffer", "bubbles"];
const REST_MS = [7000, 16000]; // the empty water between scenes
const PACE = 1.5; // every scene's time is stretched by this: raise it to slow them all

export class PaneHeader {
  constructor(cx) {
    this.hovered = false;
    this.scene = null;
    this.scenes = 0;
    this.status = null;
    this.tool = "other";
    this.rest(cx, 1500 + Math.random() * 6000);
  }

  rest(cx, ms) {
    cx.timer.after(ms, (cx) => this.play(cx));
  }

  // Set the actors at their marks, then walk each along its legs: a transition animates each later change of target.
  play(cx) {
    if (this.status === "blocked" || this.status === "done") return this.rest(cx, 4000);
    const W = window.viewport_size().width, right = Math.random() < 0.5;
    const actors = SCENES[pick(this.status === "working" ? BUSY : CALM)](W, right);
    for (const a of actors) {
      a.from ??= { x: a.legs[0].x < a.legs.at(-1).x ? -a.w - 10 : W + 10, y: 0 };
      a.leg = -1;
      a.after = (a.after ?? 0) * PACE;
      a.legs = a.legs.map((l) => ({ ...l, ms: l.ms * PACE }));
    }
    this.scene = { id: ++this.scenes, actors };
    cx.notify();
    const longest = Math.max(...actors.map((a) => walk(cx, a)));
    cx.timer.after(longest + 300, (cx) => {
      this.scene = null;
      cx.notify();
      this.rest(cx, REST_MS[0] + Math.random() * (REST_MS[1] - REST_MS[0]));
    });
  }

  actor(a, i) {
    const now = position(a), motion = motionOf(now), right = facingRight(a);
    const body = a.bubble ? div().size(a.bubble).rounded_full().border_1().border_color("#8ad8ff")
      : a.tool ? sprite(`minisub-${this.tool}`, a.w, a.h)
      : a.still ? sprite(a.still, a.w, a.h)
      : sprite(`${a.name}-${right ? "r" : "l"}`, a.w, a.h);
    const centered = a.rises ? now.y : Math.round((HIGH - a.h) / 2 + now.y);
    const el = div().id(`act-${this.scene.id}-${i}`).absolute().opacity(a.opacity ?? 0.85).left(Math.round(now.x)).top(centered)
      .transition("left", motion).transition("top", motion);
    if (a.wobble) return el.child(div().relative().loop("left", { from: -a.wobble, to: a.wobble, period: 900 }).child(body));
    return el.child(a.rock ? div().relative().loop("top", { from: -a.rock, to: a.rock, period: 2300 }).child(body) : body);
  }

  button(id, icon, command, args) {
    return div().id(id).p(3).text_color(INK.dim).hover((s) => s.text_color(INK.hi))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/pane/${icon}.svg`).size(14));
  }

  render(cx, p) {
    const me = panes().find((x) => x.pane === p.pane);
    if (!me) return div();
    const pane = me.pane, prog = me.program, on = me.focused;
    const agent = agents().find((a) => a.pane === pane);
    const title = agent?.title || me.title || prog?.name || "shell";
    const tab = agent && tabsById().get(agent.tab);
    const clock = agent?.status === "working" ? since(underSince(agent, tabsById())) : "";
    const right = [((prog?.agent || prog?.shell) && prog.name) || "", clock].filter(Boolean).join(" · ");
    const st = me.status;
    this.status = st;
    this.tool = agent ? toolOf(agent) : "other";
    // the state's light behind the text: a red pulse, or a gold glint sweeping across
    const alarm = div().absolute().top(0).left(0).size_full().bg("#4a100a").loop("opacity", { from: 0, to: 0.85, period: 1100 });
    const glint = div().absolute().top(0).h_full().w(90).bg("#ffd25a26").loop("left", { from: -120, to: 2400, period: 3200 });
    const flash = shared("sub.flash"), flashing = flash?.pane === pane && flash.until > Date.now();
    // the flash ends by itself: look again once it's over
    if (flashing && this.flashUntil !== flash.until) {
      this.flashUntil = flash.until;
      cx.timer.after(FLASH_MS + 50, (cx) => cx.notify());
    }
    const word = st === "blocked" ? ["SOS", INK.red] : st === "done" ? ["SURFACED", INK.gold] : null;
    return h_flex().id(`ph-${pane}`).relative().overflow_hidden().size_full().px(18).gap(10).items_center().text_size(12)
      .bg(INK.glass).border_b(1).border_color(st === "blocked" ? "#5a1410" : INK.rule)
      .when(Boolean(this.scene) && st !== "blocked" && st !== "done", (el) => el.children(this.scene.actors.map((a, i) => this.actor(a, i))))
      .when(st === "blocked", (el) => el.child(alarm))
      .when(st === "done", (el) => el.child(glint))
      .when(flashing, (el) => el.child(div().absolute().top(0).left(0).size_full().bg(INK.gold).loop("opacity", { from: 0, to: 0.5, period: 400 })))
      .on_hover((hovered, cx) => {
        this.hovered = hovered;
        cx.notify();
      })
      .on_click(() => run("pane.focus", { pane }))
      .child(st === "blocked" ? sprite("beacon", 21, 24).flex_none() : sprite(`lamp-${st ?? "idle"}`, 10).flex_none())
      .child(div().flex_none().text_color(on ? INK.mid : INK.dim).child(agent?.space_name ?? tab?.name ?? ""))
      .child(div().flex_none().text_color(INK.dim).child("/"))
      .child(div().flex_1().min_w(0).truncate().text_color(on ? INK.hi : INK.dim).child(title))
      .when(!this.hovered && st === "working", (el) => el.child(sprite("bubbles", 72, 24).flex_none().opacity(0.8)))
      .when(!this.hovered && Boolean(word), (el) => el.child(div().flex_none().text_color(word[1]).child(word[0])))
      .when(!this.hovered && Boolean(right), (el) => el.child(div().flex_none().text_color(on ? INK.mid : INK.dim).child(right)))
      .when(this.hovered, (el) => el
        .child(this.button(`pb-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(`pb-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(`pb-z-${pane}`, me.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(`pb-x-${pane}`, "close", "pane.close", { pane })));
  }
}
