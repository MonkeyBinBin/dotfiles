// The track map down the right: on top the platforms (the shown space's tabs) as plates, then one track per train, oldest
// first so a train keeps its track. Each track is a night scene in pixel art (scripts/herdr-sub/fx/dispatch/scene.js):
// an engine shed on the left (one of several styles, taken in turn per track), the line under its catenary past a colour-light signal, a station platform on the right
// (one of several styles, taken in turn per track). A train keeps its livery; its status shows in its lamps, windows
// and doors, and in the signal.
// Trains move as trains do: they pull in braking to a stand, wait, and pull away gathering speed.
// Each run of a service is a different train, drawn at random from the models (state.js MODELS); one that comes to a
// stand keeps its model and shares it, so the pane header's arriving train matches.
//   working  a service: it runs in from the left, brakes into the platform, stands, then pulls out to the right; again
//   done     it pulls into the platform and stands there with its doors open; yellow signal
//   blocked  it brakes to a stand at the red signal
//   idle     it is shunted into the shed and parked there, lamps out; signal dark
// The tracks sit at the column's foot like a yard; the room above them is night sky (scene-sky), stars and a moon.
// With no agents at all the yard still shows one track, empty: shed and platform with nothing in them, signal dark.
// A track's click goes to that agent; a platform's click shows that tab, + opens a new one.
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, run } from "herdr";
import { INK, LAMP, MODELS, STATUS_INK, trains, modelOf, randomModel, rememberModel } from "../state.js";
import { sprite } from "../kit/sprite.js";

const ART = "mods/dispatch/assets";
const PLATFORMS_H = 44;
const PLATFORM_NAME_W = 100; // a named platform's plate truncates its name past this
const LANE_H = 96, LANE_MIN = 80;
const MORE_H = 24; // the "+N MORE IN THE YARD" line under the tracks
const RAIL_FROM_BOTTOM = 14;
// Every piece is baked at 4x and shown at a quarter: one art pixel to a point. Sizes in points.
const TRAIN_W = 125, TRAIN_H = 35, WHEELS = 35; // the wheels stand WHEELS below the sprite's top
const SKY = { w: 640, h: 720, ink: "#05080e" }; // scene-sky's size, and the night at its foot (and at scene-back's top)
const BACK = { w: 640, h: 90 }, TRACK = { w: 640, h: 17, above: 3 }, DEPOT = { w: 150, h: 68 }, PLATFORM = { w: 150, h: 57 }, SIGNAL = { w: 7, h: 51, foot: 3 };
const ASPECT = { working: "green", done: "yellow", blocked: "red", idle: "dark" };
// the platform styles (scene.js): each new track takes the next one in turn (from a random start) and keeps it
const PLATFORM_STYLES = ["modern", "heritage", "rural", "glass"];
// the engine shed styles, taken in turn the same way
const DEPOT_STYLES = ["brick", "steel", "timber", "sawtooth"];
// the empty yard's track takes its shed and platform styles like any other, under this key
const EMPTY_KEY = "(empty)";

// How a train moves: braking into a stand, pulling away, shunting; ms per px of travel, clamped.
const ARRIVE_MS = 5600, DWELL_MS = 2800, DEPART_MS = 4400, HEADWAY_MS = 1800, LEG_LEAD = 60;
// a track opening for a new agent, or closing after its agent has gone and its train has pulled out
const OPEN_MS = 500, CLOSE_MS = 600, LANE_GAP = 4;
const shuntMs = (dx) => Math.max(1600, Math.min(6000, Math.abs(dx) * 12));

const piece = (name, { w, h }) => image(`${ART}/${name}.png`).w(w).h(h);
// Frames overlap as they hand over (not `exact`): a train's frames differ only in its wheels, and an exact handover
// leaves both half-transparent for a moment, which reads as a flicker.
const train = (model, look) => sprite(`train-${model}-${look}`, TRAIN_W, TRAIN_H, { art: ART });
// Every train image, drawn into a 1 px corner (their corners are transparent) so each is loaded before a train needs
// it: a new model or look otherwise shows nothing for the moment its image takes to load.
const preload = () => div().absolute().left(0).top(0).w(1).h(1).overflow_hidden()
  .children(MODELS.flatMap((model) => LOOKS.map((look) => image(`${ART}/train-${model}-${look}.png`).absolute().left(0).top(0).w(TRAIN_W * 4).h(TRAIN_H))));
const LOOKS = ["working", "halt", "done", "blocked", "idle"];

/** Where things stand on a track `w` wide: the shed's bay, the signal, the platform; off either end. */
function spots(w) {
  const platformX = Math.max(DEPOT.w + 40, w - PLATFORM.w), signalX = platformX - 22;
  return {
    platformX, signalX,
    at: { depot: 12, signal: signalX - TRAIN_W - 8, platform: platformX + 12, offLeft: -TRAIN_W - 16, offRight: w + 16 },
  };
}

// CSS's cubic-bezier easings (what the native transitions follow), to work out where a train is part way along a leg.
const CURVES = { linear: [0, 0, 1, 1], "ease-in": [0.42, 0, 1, 1], "ease-out": [0, 0, 0.58, 1], "ease-in-out": [0.42, 0, 0.58, 1] };
function eased(name, u) {
  const [x1, y1, x2, y2] = CURVES[name] ?? CURVES.linear;
  const bez = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let lo = 0, hi = 1, t = u;
  for (let i = 0; i < 24; i++) {
    t = (lo + hi) / 2;
    if (bez(x1, x2, t) < u) lo = t;
    else hi = t;
  }
  return bez(y1, y2, t);
}
/** Where a train is now: part way along its leg, or where it stands. */
function whereNow(m) {
  const l = m.leg;
  if (!l) return m.x;
  const u = Math.min(1, Math.max(0, (Date.now() - l.start) / l.ms));
  return l.from + (l.to - l.from) * eased(l.easing, u);
}

/** The trains given a track when they don't all fit: the ones that need the person (held at a signal, then arrived) come
 *  first, the rest fill up oldest first; they still show in their own order so tracks move as little as possible. */
function onTrack(list, fit) {
  if (list.length <= fit) return list;
  const rank = { blocked: 0, done: 1, gone: 3 };
  const chosen = new Set([...list].sort((a, b) => (rank[a.status] ?? 2) - (rank[b.status] ?? 2) || list.indexOf(a) - list.indexOf(b)).slice(0, fit));
  return list.filter((t) => chosen.has(t));
}

export class Tracks {
  constructor() {
    this.size = { width: 440, height: 600 };
    // per train: where it's headed (px), its current leg, which sprite, its journey's token and run number
    this.runs = new Map();
    this.order = []; // addresses, first seen first
    this.lastSeen = new Map(); // address -> its train as last seen, for a gone agent's track
    this.started = false;
    this.platformOf = new Map();
    this.nextPlatform = Math.floor(Math.random() * PLATFORM_STYLES.length);
    this.depotOf = new Map();
    this.nextDepot = Math.floor(Math.random() * DEPOT_STYLES.length);
    // the platforms wrap onto more rows as the tabs outgrow one; the tracks get what's left (measured)
    this.platformsH = PLATFORMS_H;
  }

  // A train's journey for its status. A transition carries it along each leg and timers start the next; a new status
  // starts a new journey (the token stops the old one's timers). Positions are kept in px with each leg's start, so a
  // journey that changes mid-leg carries on from where the train really is: a native transition retargeted mid-flight
  // would restart from the old leg's start and the train would jump.
  plan(t, cx) {
    const key = t.agent.address, st = t.status, W = this.size.width, at = spots(W).at;
    let m = this.runs.get(key);
    const first = !m;
    if (!m) this.runs.set(key, (m = { x: at.offLeft, ms: 1, easing: "linear", leg: null, look: "working", token: 0, run: 0, model: modelOf(key),
      born: this.started, grown: !this.started }));
    // a track for a new agent opens out first
    if (first && this.started) cx.timer.after(30, (cx) => {
      m.grown = true;
      cx.notify();
    });
    m.status = st;
    const token = ++m.token;
    // each leg's timer hands its own cx to the next (a cx must never be kept for later)
    const later = (cx, ms, fn) => cx.timer.after(ms, (cx) => {
      if (m.token !== token) return;
      fn(cx);
      cx.notify();
    });
    const here = () => whereNow(m);
    const go = (x, ms, easing) => {
      m.leg = { from: here(), to: x, start: Date.now(), ms, easing };
      Object.assign(m, { x, ms, easing });
    };
    // stop the current element where the train is and carry on with a new one from there
    const freeze = () => {
      m.x = here();
      m.leg = null;
      m.ms = 1;
      m.run++;
    };
    // a fresh run appears off the left end with no motion, then sets off: a different train each time
    const enter = () => {
      m.run++;
      Object.assign(m, { x: at.offLeft, ms: 1, easing: "linear", leg: null, look: "working", model: randomModel() });
    };
    // a train that comes to a stand keeps its model and shares it
    const stand = (cx, look) => {
      m.look = look;
      cx.timer.after(16, () => rememberModel(key, m.model));
    };
    const x0 = here();
    const onLine = x0 > at.offLeft + 4 && x0 < at.offRight - 4;
    // a train pulling out (heading off the right end) runs on until it's gone; only then does the next one come in
    const leaving = m.leg && m.leg.to >= at.offRight - 4 && Date.now() < m.leg.start + m.leg.ms;
    const after = leaving ? m.leg.start + m.leg.ms - Date.now() + HEADWAY_MS : 0;

    if (st === "gone") {
      // the agent has gone: its train pulls out to the right from wherever it is, then the track closes up
      const close = (cx) => {
        m.closing = true;
        later(cx, CLOSE_MS, () => (m.closed = true));
      };
      if (leaving) later(cx, Math.max(0, after - HEADWAY_MS) + 200, close);
      else if (onLine) {
        freeze();
        m.look = "working";
        later(cx, LEG_LEAD, (cx) => {
          const ms = Math.round(DEPART_MS * Math.min(1, (at.offRight - m.x) / (at.offRight - at.platform)) + 600);
          go(at.offRight, ms, "ease-in");
          later(cx, ms + 200, close);
        });
      } else close(cx);
      return;
    }

    if (st === "working") {
      // a service: run in braking to a stand at the platform, stand there, pull away, the next one after a headway
      const service = (cx) => {
        enter();
        later(cx, LEG_LEAD, (cx) => {
          go(at.platform, ARRIVE_MS, "ease-out");
          later(cx, ARRIVE_MS, (cx) => {
            m.look = "halt";
            later(cx, DWELL_MS, (cx) => {
              m.look = "working";
              go(at.offRight, DEPART_MS, "ease-in");
              later(cx, DEPART_MS + HEADWAY_MS, service);
            });
          });
        });
      };
      if (leaving) later(cx, after, service);
      else if (!first && onLine) {
        // on the line: pull away to the right from wherever it is
        freeze();
        m.look = "working";
        later(cx, LEG_LEAD, (cx) => {
          const ms = Math.round(DEPART_MS * Math.min(1, (at.offRight - m.x) / (at.offRight - at.platform)) + 600);
          go(at.offRight, ms, "ease-in");
          later(cx, ms + HEADWAY_MS, service);
        });
      } else service(cx);
      return;
    }

    const target = at[{ done: "platform", blocked: "signal", idle: "depot" }[st]];
    if (first && !this.started) {
      // already there when the board opens (a train for a new agent runs in instead)
      Object.assign(m, { x: target, ms: 1 });
      return stand(cx, st);
    }
    if (leaving) {
      // let the last one pull out, then this one runs in from the left and brakes to a stand
      later(cx, after, (cx) => arrive(cx));
    } else if (onLine) {
      // on the line: move on from where it is (up to the platform, back to the signal, or into the shed)
      freeze();
      m.look = "working";
      later(cx, LEG_LEAD, (cx) => {
        const ms = shuntMs(target - m.x);
        go(target, ms, "ease-in-out");
        later(cx, ms, (cx) => stand(cx, st));
      });
    } else arrive(cx);

    function arrive(cx) {
      enter();
      later(cx, LEG_LEAD, (cx) => {
        go(target, ARRIVE_MS, "ease-out");
        later(cx, ARRIVE_MS, (cx) => stand(cx, st));
      });
    }
  }

  /** This track's platform style: the next one in turn the first time it shows, so neighbours differ. */
  platform(key) {
    if (!this.platformOf.has(key)) this.platformOf.set(key, PLATFORM_STYLES[this.nextPlatform++ % PLATFORM_STYLES.length]);
    return this.platformOf.get(key);
  }

  /** This track's engine shed style: the next one in turn the first time it shows. */
  depot(key) {
    if (!this.depotOf.has(key)) this.depotOf.set(key, DEPOT_STYLES[this.nextDepot++ % DEPOT_STYLES.length]);
    return this.depotOf.get(key);
  }

  platforms() {
    const space = spaces().find((s) => s.active);
    const tabs = (space?.tabs ?? []).filter((t) => !t.settled);
    const plate = (id, label, lit, status, onClick, tip) => h_flex().id(id).flex_none().h(26).px(9).gap(6).items_center().rounded(4)
      .bg(lit ? INK.plate : INK.flap).border_1().border_color(lit ? INK.plate : INK.steelDim)
      .hover((s) => s.border_color(INK.plate)).on_click(onClick)
      .when(Boolean(tip), (el) => el.tooltip(tip)) // the full name, which the plate may truncate
      .when(Boolean(status), (el) => el.child(div().flex_none().size(7).rounded_full().bg(LAMP[status])))
      .child(div().max_w(PLATFORM_NAME_W).truncate().text_size(13).text_color(lit ? INK.plateText : INK.creamDim).child(label));
    // every tab shows: the plates wrap onto more rows rather than run off the edge, + at the end of the last one
    // pb one short of pt: the bottom border makes up the difference, so one row is exactly PLATFORMS_H
    return h_flex().id("platforms").flex_none().flex_wrap().overflow_hidden().min_h(PLATFORMS_H).px(12).pt(9).pb(8).gap(6).items_center().border_b(1).border_color(INK.steelDim)
      .on_size_change((size, cx) => {
        if (Math.round(size.height) === this.platformsH) return;
        this.platformsH = Math.round(size.height);
        cx.notify();
      })
      .child(div().flex_none().text_size(11).text_color(INK.creamDim).mr(4).child("PLATFORM"))
      .children(tabs.map((t) =>
        plate(`pf-${t.id}`, t.named ? `${t.index} ${t.name.toUpperCase()}` : String(t.index), t.active, t.status, () => run("tab.select", { id: t.id }), t.named ? t.name : null)))
      .child(plate("pf-new", "+", false, null, () => run("tab.new", {})));
  }

  /** A track's night scene without its train: the shed, the platform, the signal showing `aspect`, the rails, and a
   *  plate at the corner reading `code` in `color`. */
  scenery(id, key, w, h, aspect, code, color) {
    const { platformX, signalX } = spots(w);
    const rail = h - RAIL_FROM_BOTTOM;
    return div().id(id).absolute().left(0).top(LANE_GAP).w(w).h(h).overflow_hidden()
      .child(div().absolute().left(0).top(rail - BACK.h).child(piece("scene-back", BACK)))
      .child(div().absolute().left(0).top(rail - DEPOT.h).child(piece(`scene-depot-${this.depot(key)}`, DEPOT)))
      .child(div().absolute().left(platformX).top(rail - PLATFORM.h).child(piece(`scene-platform-${this.platform(key)}`, PLATFORM)))
      .child(div().absolute().left(signalX).top(rail + SIGNAL.foot - SIGNAL.h).child(piece(`signal-${aspect}`, SIGNAL)))
      .child(div().absolute().left(0).top(rail - TRACK.above).child(piece("scene-track", TRACK)))
      .child(div().absolute().left(6).top(4).text_size(11).px(4).rounded(2).bg("#07090bcc").border_1().border_color(color).text_color(color).child(code));
  }

  /** The yard with no agents at all: one empty track, its signal dark, nothing in the shed or at the platform. */
  emptyYard(w, h) {
    return div().id("slot-empty").relative().w(w).flex_none().overflow_hidden().h(h + LANE_GAP)
      .child(this.scenery("lane-empty", EMPTY_KEY, w, h, "dark", "NO SERVICE", INK.creamDim));
  }

  lane(t, w, h, cx) {
    const key = t.agent.address;
    if (this.runs.get(key)?.status !== t.status) this.plan(t, cx);
    const m = this.runs.get(key);
    const { at } = spots(w);
    // a train that has come to a stand stays at its spot when the track's width changes
    const resting = { done: "platform", blocked: "signal", idle: "depot" }[t.status];
    if (resting && m.look === t.status && (!m.leg || Date.now() > m.leg.start + m.leg.ms)) m.x = at[resting];
    const rail = h - RAIL_FROM_BOTTOM;
    const gone = t.status === "gone";
    const color = gone ? INK.steelDim : STATUS_INK[t.status];
    // the train: a new element per run, so a fresh run starts off the left end instead of sliding back there
    const consist = div().id(`train-${key}-${m.run}`).absolute().top(rail - WHEELS).left(Math.round(m.x))
      .transition("left", { duration: m.ms, easing: m.easing })
      .child(train(m.model, m.look));
    const lane = this.scenery(`lane-${key}`, key, w, h, ASPECT[t.status] ?? "dark", t.code, color)
      .when(!gone, (el) => el.on_click(() => run("agent.focus", { terminal: key })))
      .child(consist)
      .hover((s) => s.opacity(0.92));
    // the slot the track sits in: it opens out for a new agent and closes up after one has gone, so the tracks
    // below slide rather than jump
    const open = !m.closing && m.grown;
    return div().id(`slot-${key}`).relative().w(w).flex_none().overflow_hidden()
      .h(open ? h + LANE_GAP : 0).opacity(open ? 1 : 0)
      .transition("height", { duration: m.closing ? CLOSE_MS : OPEN_MS, easing: "ease-in-out" })
      .transition("opacity", { duration: m.closing ? CLOSE_MS : OPEN_MS, easing: "ease-in-out" })
      .child(lane);
  }

  render(cx) {
    const live = trains();
    const byKey = new Map(live.map((t) => [t.agent.address, t]));
    // tracks in the order their agents first showed up; a gone agent's track stays until it has closed
    for (const t of live) {
      if (!this.order.includes(t.agent.address)) this.order.push(t.agent.address);
      this.lastSeen.set(t.agent.address, t);
    }
    this.order = this.order.filter((k) => {
      if (byKey.has(k)) return true;
      const m = this.runs.get(k);
      if (m && !m.closed) return true; // still pulling out or closing up
      // closed, or it never had a track (it was in the yard): let it go
      this.runs.delete(k);
      this.lastSeen.delete(k);
      return false;
    });
    const list = this.order.map((k) => byKey.get(k) ?? { ...this.lastSeen.get(k), status: "gone" });
    const { width, height } = this.size;
    // when not every train gets a track, the line saying how many wait in the yard takes its room from the tracks
    const fitIn = (h) => Math.max(1, Math.floor(h / (LANE_MIN + LANE_GAP)));
    let room = Math.max(0, height - this.platformsH - 8);
    if (list.length > fitIn(room)) room -= MORE_H;
    const fit = fitIn(room);
    const laneH = Math.max(LANE_MIN, Math.min(LANE_H, Math.floor(room / Math.max(1, Math.min(list.length, fit))) - LANE_GAP));
    const view = v_flex().id("tracks").size_full().bg(INK.board).overflow_hidden()
      .on_size_change((size, cx) => {
        if (size.width === this.size.width && size.height === this.size.height) return;
        this.size = size;
        cx.notify();
      })
      .relative()
      .child(preload())
      .child(this.platforms())
      // the yard: the tracks stacked at the column's foot under one night sky that fills whatever room they leave
      .child(v_flex().flex_1().min_h(0).bg(SKY.ink)
        .child(div().flex_1().min_h(0).relative().overflow_hidden()
          .child(div().absolute().left(0).bottom(0).child(piece("scene-sky", SKY))))
        .child(v_flex().flex_none()
          .when(list.length === 0, (el) => el.child(this.emptyYard(width, laneH)))
          .children(onTrack(list, fit).map((t) => this.lane(t, width, laneH, cx))))
        .when(list.length > fit, (el) => el.child(h_flex().flex_none().h(MORE_H).px(14).items_center().text_size(12).text_color(INK.creamDim).child(`+${list.length - fit} MORE IN THE YARD`))));
    // trains seen from now on are new agents: their tracks open and their trains run in
    this.started = true;
    return view;
  }
}
