// The captain's log, opened from the nameplate: a dialog in the sub's brass porthole frame, phosphor on glass.
// The left page is That Monkey's record: his portrait in the hatch, rank and the dives to the next one, subs home,
// and how the crew is doing. The right page lists who needs the person (SOS) and who's back with loot, each with a
// Go link, then the log entries of the latest subs home (shared "sub.log", written by the sea). Esc closes it.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, run, shared, setShared, closeOverlay } from "herdr";
import { framed } from "../kit/frame.js";
import { sprite } from "../kit/sprite.js";
import { INK, WORD, escortsOf, toolOf, toolName, titleOf, since } from "../state.js";

// ranks by subs brought home
const RANKS = [[0, "Ensign"], [5, "Lieutenant"], [15, "Commander"], [40, "Captain"], [100, "Admiral"]];
const STEPS = 10;

function rank(dives) {
  let i = 0;
  while (i + 1 < RANKS.length && dives >= RANKS[i + 1][0]) i++;
  const [from, name] = RANKS[i], next = RANKS[i + 1];
  return { name, next: next?.[1], into: next ? (dives - from) / (next[0] - from) : 1, left: next ? next[0] - dives : 0 };
}

export class CaptainsLog {
  close() {
    setShared("sub.log.open", null);
  }

  heading(label, color = INK.mid) {
    return v_flex().gap(4)
      .child(div().text_color(color).child(label))
      .child(div().h(1).w_full().bg(INK.rule));
  }

  // an agent waiting on the person: its sub, title, tool · space, and Go
  entry(a, overlay) {
    const go = () => {
      closeOverlay(overlay);
      run("agent.focus", { terminal: a.address });
    };
    return h_flex().id(`l-${a.address}`).gap(10).items_center().on_click(go)
      .child(sprite(`minisub-${toolOf(a)}`, 39, 30).flex_none())
      .child(v_flex().flex_1().min_w(0).gap(3)
        .child(div().truncate().text_color(a.status === "blocked" ? INK.redSoft : INK.hi).child(titleOf(a)))
        .child(div().truncate().text_color(INK.dim).child(`${toolName(a)} · ${a.space_name}`)))
      .child(div().flex_none().text_color(INK.gold).hover((s) => s.text_color(INK.hi)).child("GO >"));
  }

  section(label, list, overlay, color) {
    return v_flex().gap(8)
      .child(this.heading(`${label} · ${list.length}`, list.length ? color : INK.dim))
      .when(!list.length, (el) => el.child(div().text_color(INK.dim).child("-")))
      .children(list.map((a) => this.entry(a, overlay)));
  }

  render(_cx, p) {
    const list = agents(), overlay = p.overlay;
    const dives = shared("sub.dives") ?? 0, log = shared("sub.log") ?? [], r = rank(dives);
    // an agent with an escort calling for help is listed too: Go takes the person to it
    const blocked = list.filter((a) => a.status === "blocked" || escortsOf(a.address).some((e) => e.status === "blocked")), done = list.filter((a) => a.status === "done");
    const working = list.filter((a) => a.status === "working").length;
    const stat = (label, value, color = INK.hi) => h_flex().justify_between()
      .child(div().text_color(INK.dim).child(label)).child(div().text_color(color).child(value));
    const lit = Math.round(r.into * STEPS);
    const mood = blocked.length ? "alarm" : working ? "sleep" : "idle";

    const left = v_flex().w(250).flex_none().p(14).gap(10)
      .child(h_flex().gap(10).items_center()
        .child(svg("mods/sub/icons/log.svg").size(24).flex_none().text_color(INK.gold))
        .child(div().text_size(22).text_color(INK.hi).child("CAPTAIN'S LOG")))
      .child(div().text_color(INK.dim).child("Captain, on watch"))
      .child(h_flex().justify_center().child(sprite(`captain-${mood}`, 196, 140)))
      .child(this.heading("RECORD"))
      .child(stat("Rank", r.name, INK.gold))
      .child(h_flex().justify_between().items_center()
        .child(div().text_color(INK.dim).child(r.next ? `To ${r.next}` : "Top rank"))
        .child(h_flex().gap(2).children(Array.from({ length: STEPS }, (_, i) => div().w(9).h(8).bg(i < lit ? INK.mid : INK.rule)))))
      .child(stat("Subs home", String(dives)))
      .child(stat("Out now", String(working)))
      .child(div().pt(2).text_color(blocked.length ? INK.red : INK.dim)
        .child(blocked.length ? "A crew is calling for you..." : "Calm seas."));

    const entries = v_flex().gap(8)
      .child(this.heading("LOG"))
      .when(!log.length, (el) => el.child(div().text_color(INK.dim).child("No entries yet.")))
      .children(log.map((e) => h_flex().gap(10).items_start()
        .child(div().flex_none().w(36).text_color(INK.dim).child(`#${String(e.n ?? 0).padStart(3, "0")}`))
        .child(v_flex().flex_1().min_w(0).gap(3)
          .child(div().truncate().text_color(INK.hi).child(e.title))
          .child(div().truncate().text_color(INK.dim)
            .child(`${e.tool} · ${e.space} · ${since(e.at) === "now" ? "just now" : `${since(e.at)} ago`}`)))));

    const right = v_flex().id("log-right").flex_1().min_w(0).p(14).gap(16).overflow_y_scrollbar()
      .child(this.section(WORD.blocked, blocked, overlay, INK.red))
      .child(this.section(WORD.done, done, overlay, INK.gold))
      .child(entries);

    return framed("bezel", h_flex().size_full().text_size(12).bg(INK.glass)
      .child(left)
      .child(div().w(1).h_full().flex_none().my(14).bg(INK.rule))
      .child(right), { fill: INK.glass });
  }
}
