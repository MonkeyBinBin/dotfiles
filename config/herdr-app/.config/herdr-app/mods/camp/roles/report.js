// The adventure log, opened from the signpost: an open book in a leather cover (framed("book")). The left page is
// That Monkey's record: his picture, level and XP, gold, quests home, and how the camp is doing. The right page,
// in ink: the agents that need the person (SOS) and the ones back with loot, each with a Go link, then the
// chronicle of the latest quests home (shared "camp.log", written by the band). Esc closes it.
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, run, shared, closeOverlay } from "herdr";
import { ART, since } from "../state.js";
import { framed } from "../kit/frame.js";

const INK = "#2e1c10", FADED = "#7a5a3a", RED = "#8a1f17", RULE = "#c8b088", SLOT = "#1d1b2f";
// the gutter between the pages: the paper darkening into the fold and back out, 2 px a step
const SPINE = ["#e6d4ac", "#d8c49a", "#c8b088", "#a8906a", "#7a6040", "#a8906a", "#c8b088", "#d8c49a", "#e6d4ac"];
const PER_LEVEL = 4;

export class Report {
  heading(label, color = RED) {
    return v_flex().gap(3)
      .child(div().text_color(color).child(label))
      .child(div().h(2).w_full().bg(RULE));
  }

  entry(a, overlay) {
    const go = () => {
      closeOverlay(overlay);
      run("pane.focus", { pane: a.pane });
    };
    return h_flex().id(`r-${a.address}`).gap(8).items_center().on_click(go)
      .child(div().size(20).flex_none().flex().items_center().justify_center().bg(SLOT).child(image(`${ART}/icon-${a.status}.gif`).size(16)))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().truncate().text_color(INK).child(a.title || a.program?.name || a.address))
        .child(div().truncate().text_color(FADED).child(`${a.program?.name ?? a.app ?? "agent"} · ${a.space_name}`)))
      .child(div().flex_none().text_color(RED).hover((s) => s.text_color(INK)).child("Go >"));
  }

  section(label, list, overlay) {
    return v_flex().gap(6)
      .child(this.heading(`${label} ${list.length}`))
      .when(!list.length, (el) => el.child(div().text_color(FADED).child("-")))
      .children(list.map((a) => this.entry(a, overlay)));
  }

  render(_cx, p) {
    const list = agents(), overlay = p.overlay;
    const wins = shared("camp.wins") ?? 0, log = shared("camp.log") ?? [];
    const level = 1 + Math.floor(wins / PER_LEVEL), into = wins % PER_LEVEL;
    const blocked = list.filter((a) => a.status === "blocked"), done = list.filter((a) => a.status === "done");
    const stat = (label, value) => h_flex().justify_between()
      .child(div().text_color(FADED).child(label)).child(div().text_color(INK).child(value));

    const left = v_flex().flex_1().min_w(0).p(10).gap(8)
      .child(div().text_size(24).text_color(INK).child("ADVENTURE LOG"))
      .child(div().text_color(FADED).child("That Monkey's camp journal"))
      .child(h_flex().justify_center().child(image(`${ART}/log-portrait.gif`).w(120).h(112)))
      .child(this.heading("RECORD", INK))
      .child(stat("Level", String(level)))
      .child(h_flex().justify_between().items_center()
        .child(div().text_color(FADED).child("XP"))
        .child(h_flex().gap(2).p(2).border(2).border_color(INK).children(
          Array.from({ length: PER_LEVEL }, (_, i) => div().w(14).h(6).bg(i < into ? RED : RULE)))))
      .child(stat("Gold", String(wins * 10)))
      .child(stat("Quests home", String(wins)))
      .child(div().pt(4).text_color(blocked.length ? RED : FADED).child(blocked.length ? "A merc needs your hand..." : "All quiet at camp."));

    const chronicle = v_flex().gap(6)
      .child(this.heading("CHRONICLE"))
      .when(!log.length, (el) => el.child(div().text_color(FADED).child("No tales yet.")))
      .children(log.map((e) => v_flex().gap(2)
        .child(div().truncate().text_color(INK).child(`* ${e.title}`))
        .child(div().truncate().text_color(FADED).child(`${e.tool} · ${e.space} · ${since(e.at) === "now" ? "just now" : `${since(e.at)} ago`}`))));

    const right = v_flex().id("log-right").flex_1().min_w(0).p(10).gap(14).overflow_y_scrollbar()
      .child(this.section("SOS", blocked, overlay))
      .child(this.section("LOOT", done, overlay))
      .child(chronicle);

    const spine = h_flex().h_full().flex_none().children(SPINE.map((c) => div().w(2).h_full().bg(c)));
    return framed("book", h_flex().size_full().text_size(12).child(left).child(spine).child(right));
  }
}
