// The control console along the bottom hull edge: a brushed gunmetal slab with four steel panels screwed to it, their
// labels engraved and paint-filled, dials and alarms sunk into wells:
//   COMPARTMENTS  a toggle plate per space, thrown and brass when shown: its status lamp, its name, a pip per agent
//                 aboard in that agent's status color, a smaller one after it per escort; + for a new space. Click to go
//                 there, right-click for its menu
//   TELEGRAPH     the engine order: EMERGENCY with one blocked (an escort counts), AHEAD with one working, else STOP
//   ALARMS        dark until they trip: SOS (blocked, escorts too), LOOT (done), PRES (under pressure), MOSS (overgrown), and CLASH: agents
//                 at work in one checkout on one branch. Click it for a new worktree; its tooltip says who
//   SYSTEMS       Settings (a gold dot when an update is ready), Add machine
import { div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, panes, spaces, run, openOverlay, exec, updates } from "herdr";
import { battleLight, onAlert } from "../kit/battle-light.js";
import { framed } from "../kit/frame.js";
import { clashes } from "../kit/clash.js";
import { engraved, metal, PAINT } from "../kit/metal.js";
import { sprite } from "../kit/sprite.js";
import { ART, INK, RANK, STATUS_INK, tabsById, minutesUnder, minutesParked, contacts, escortsOf, sosEscorts, PRESSURE_MIN, MOSS_MIN } from "../state.js";

const CONTENT = 44, MAX_PIPS = 8;
const AMBER = "#ffb055", WEED = "#7aaa5a", VIOLET = "#c8a0ff";

export function brassPlate(content, lit) {
  return framed(lit ? "brass" : "key", content);
}


// a recessed panel of the console with its engraved label
const panel = (label, content) => framed("panel", div().relative().size_full()
  .child(metal("metal-panel"))
  .child(v_flex().relative().size_full().px(4).pb(2).gap(2).child(engraved(label))
    .child(h_flex().flex_1().min_h(0).items_center().child(content))));

export class Deck {
  constructor(cx) {
    // pressure and moss trip with time
    cx.timer.every(30000, (cx) => cx.notify());
    this.tops = new Map(); // "<machine>:<folder>" -> its checkout's top folder, null when it isn't in a repo
  }

  // Which checkout and branch an agent is on. A folder's top is asked of git once, then remembered.
  checkout(a, cx) {
    const pane = panes().find((p) => p.pane === a.pane);
    if (!pane?.cwd || !pane.branch) return null;
    const on = spaces().find((s) => s.id === a.space)?.machine ?? null, key = `${on}:${pane.cwd}`;
    if (!this.tops.has(key)) {
      this.tops.set(key, null);
      cx.spawn(async (cx) => {
        const r = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: pane.cwd, on }).catch(() => null);
        if (r?.code === 0) { this.tops.set(key, r.stdout.trim()); cx.notify(); }
      });
    }
    const top = this.tops.get(key);
    return top ? `${on}:${top}@${pane.branch}` : null;
  }

  plate(id, lit, content) {
    return div().id(id).flex_none().h(CONTENT).text_size(12).active((s) => s.opacity(0.8))
      .child(brassPlate(h_flex().h_full().px(12).gap(10).items_center()
        .text_color(lit ? INK.brassText : PAINT).child(content), lit));
  }

  // a space's toggle plate
  room(s, list) {
    const crew = list.filter((a) => a.space === s.id).sort((p, q) => RANK[p.status] - RANK[q.status]);
    const pips = crew.flatMap((a) => [{ size: 6, status: a.status }, ...escortsOf(a.address).map((e) => ({ size: 4, status: e.status }))]);
    const extra = pips.length - MAX_PIPS;
    return this.plate(`sp-${s.id}`, s.active, h_flex().gap(8).items_center()
      .child(image(`${ART}/toggle-${s.active ? "down" : "up"}.png`).w(14).h(28).flex_none())
      .child(v_flex().gap(3)
        .child(h_flex().gap(6).items_center()
          .child(sprite(`lamp-${s.status ?? "idle"}`, 10).flex_none())
          .child(div().max_w(130).truncate().child(s.name)))
        .child(h_flex().h(6).gap(3).items_center()
          .children(pips.slice(0, MAX_PIPS).map((p) => div().size(p.size).bg(STATUS_INK[p.status] ?? INK.idle)))
          .when(extra > 0, (el) => el.child(div().text_size(10).child(`+${extra}`))))))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => run("space.select", { id: s.id }))
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        openOverlay({ mod: "sub-menu", kind: "popup", width: 200, frame: "none", props: { tab: "space", target: { id: s.id } } });
      });
  }

  telegraph(list) {
    const count = (st) => list.filter((a) => a.status === st).length;
    const sos = count("blocked") + sosEscorts(list).length, diving = count("working");
    const [order, word, color, detail] = sos ? ["emergency", "EMERGENCY", INK.red, `${sos} SOS`]
      : diving ? ["ahead", "AHEAD", INK.mid, `${diving} DIVING`]
      : ["stop", "ALL STOP", INK.idle, "AT REST"];
    return h_flex().gap(8).items_center()
      .child(sprite(`telegraph-${order}`, 72, 40).flex_none())
      .child(div().w(108).h(CONTENT).flex_none().child(framed("well", v_flex().size_full().px(6).justify_center().gap(4).text_size(12)
        .child(div().text_color(color).child(word))
        .child(div().text_color(INK.dim).child(detail)))));
  }

  // one alarm tile: dark until it trips; `pulse` for the one that can't wait
  alarm(label, n, color, pulse) {
    const face = div().relative().size_full().flex().items_center().justify_center().text_size(12).overflow_hidden()
      .bg(n ? `${color}40` : "#041012").text_color(n ? color : "#28444a")
      .when(n > 0 && pulse, (el) => el.child(div().absolute().top(0).left(0).size_full().bg(color).loop("opacity", { from: 0, to: 0.45, period: 900 })))
      .child(div().relative().child(n ? `${label} ${n}` : label));
    return div().w(68).h(21).child(framed("well", face));
  }

  // Trips on agents sharing a checkout; a click starts a worktree for the first of them to move to.
  clash(list, cx) {
    const groups = clashes(list, (a) => this.checkout(a, cx)), n = groups.flat().length;
    const ids = contacts(list), first = groups[0]?.[0];
    const who = groups.map((g) => `${g.map((a) => ids.get(a.address)).join(", ")} on ${g[0].space_name}`).join("; ");
    return div().id("clash").w(68).h(44).when(n > 0, (el) => el.tooltip(`Same checkout and branch: ${who}. Click for a new worktree.`)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => openOverlay({ mod: "sub-worktree", kind: "dialog", width: 460, height: 280, props: { space: first.space, folder: panes().find((p) => p.pane === first.pane)?.cwd, action: "new" } })))
      .child(framed("well", div().relative().size_full().flex().items_center().justify_center().text_size(12).overflow_hidden()
        .bg(n ? `${VIOLET}40` : "#041012").text_color(n ? VIOLET : "#28444a")
        .when(n > 0, (el) => el.child(div().absolute().top(0).left(0).size_full().bg(VIOLET).loop("opacity", { from: 0, to: 0.3, period: 1400 })))
        .child(v_flex().relative().items_center().child("CLASH").when(n > 0, (el) => el.child(String(n))))));
  }

  alarms(list, cx) {
    const tabs = tabsById(), now = Date.now();
    const count = (st) => list.filter((a) => a.status === st).length;
    const pressure = list.filter((a) => a.status === "working" && minutesUnder(a, tabs, now) >= PRESSURE_MIN).length;
    const moss = list.filter((a) => a.status === "idle" && minutesParked(a, tabs, now) >= MOSS_MIN).length;
    return h_flex().gap(4).child(v_flex().gap(2)
      .child(h_flex().gap(4).child(this.alarm("SOS", count("blocked") + sosEscorts(list).length, INK.red, true)).child(this.alarm("LOOT", count("done"), INK.gold)))
      .child(h_flex().gap(4).child(this.alarm("PRES", pressure, AMBER)).child(this.alarm("MOSS", moss, WEED))))
      .child(this.clash(list, cx));
  }

  render(cx) {
    const list = agents();
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, icon, label, action, dot) => this.plate(id, false, v_flex().gap(2).items_center()
      .child(h_flex().gap(4).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(14))
        .when(dot, (el) => el.child(div().size(6).bg(INK.gold))))
      .child(label))
      .on_mouse_down("left", stop).on_click(action);
    return h_flex().relative().size_full().items_center().gap(8).py(4).px(4)
      .child(metal("metal-slab"))
      .when(onAlert(), (el) => el.child(battleLight()))
      .child(div().relative().flex_1().min_w(0).h_full().child(panel("COMPARTMENTS",
        h_flex().id("rooms").flex_1().min_w(0).gap(8).items_center().overflow_x_scrollbar()
          .children(spaces().map((s) => this.room(s, list)))
          .child(this.plate("space-new", false, div().px(4).child("+")).on_mouse_down("left", stop).on_click(() => run("space.new"))))))
      .child(div().relative().flex_none().w(216).h_full().child(panel("TELEGRAPH", this.telegraph(list))))
      .child(div().relative().flex_none().w(244).h_full().child(panel("ALARMS", this.alarms(list, cx))))
      .child(div().relative().flex_none().w(218).h_full().child(panel("SYSTEMS", h_flex().gap(8)
        .child(button("settings", "settings", "Settings", () => run("app.settings"), Boolean(updates().app.ready)))
        .child(button("machine", "plus", "Machine", () => run("mod.open", { name: "machine-add" }), false)))));
  }
}
