// The campfire band along the bottom of the window: That Monkey by the fire, reacting to every agent at once,
// one marching mercenary per working agent, and the camp's status on the right.
//
//   blocked  -> he jolts awake (alarm), the fire burns blue
//   done     -> he cheers (happy) for a moment whenever an agent finishes, then dozes off again
//   working  -> he sleeps; each working agent marches by as a mercenary
//   else     -> idle by the fire
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, spaces, theme, run, shared, setShared, openOverlay } from "herdr";
import { pick } from "../lines.js";
import { ART, INK, PAPER, rpgWindow } from "../state.js";

const BG = "#151324", GRASS = "#3f6e40", SOIL = "#1d3a24";
// a few stars over the band's sky (left %, top px, twinkle period ms); they sit where no GIF covers them
const STARS = [[46, 14, 2300], [58, 30, 3100], [63, 10, 2700], [71, 40, 3600], [79, 18, 2000], [88, 34, 2900], [93, 8, 3300]];
const HAPPY_MS = 3600;
const MAX_MERCS = 5;
// GIFs are baked at 4x their pixels and shown at 2x, so 1:1 on a 2x screen.
const px = (n) => n * 2;

const mercColor = (a) => {
  const app = `${a.app ?? ""} ${a.program?.key ?? ""}`;
  if (/claude/.test(app)) return "orange";
  if (/codex/.test(app)) return "green";
  if (/gemini|copilot/.test(app)) return "blue";
  return "purple";
};

export class Band {
  constructor(_cx) {
    this.prev = new Map(); // agent address -> last status seen
    this.happyUntil = 0;
    this.mood = null;
    this.line = "";
    this.started = false;
  }

  // Agents that just finished make him cheer; seeded on the first render so a restart doesn't.
  watch(list, cx) {
    let finished = false;
    for (const a of list) {
      const was = this.prev.get(a.address);
      if (this.started && a.status === "done" && was && was !== "done") finished = true;
      this.prev.set(a.address, a.status);
    }
    this.started = true;
    if (finished) {
      setShared("camp.wins", (shared("camp.wins") ?? 0) + 1);
      this.happyUntil = Date.now() + HAPPY_MS;
      cx.timer.after(HAPPY_MS + 50, (cx) => cx.notify());
    }
  }

  moodOf(list) {
    if (list.some((a) => a.status === "blocked")) return "alarm";
    if (Date.now() < this.happyUntil) return "happy";
    if (list.some((a) => a.status === "working")) return "sleep";
    return "idle";
  }

  // A speech balloon: cream paper, dark ink, a stepped pixel tail down-left toward his head.
  balloon(t, mood) {
    const edge = { alarm: t.blocked, happy: t.done }[mood] ?? INK;
    const row = (left, w) => h_flex().ml(left).h(2)
      .child(div().w(2).h_full().bg(edge)).child(div().w(w).h_full().bg(PAPER)).child(div().w(2).h_full().bg(edge));
    const tail = v_flex().absolute().left(10).bottom(-8)
      .child(row(6, 6)).child(row(4, 4)).child(row(2, 2)).child(div().ml(0).w(4).h(2).bg(edge));
    return div().id("balloon").absolute().left(px(52)).top(6)
      .child(div().px(10).py(6).bg(PAPER).border(2).border_color(edge)
        .text_size(12).text_color(INK).whitespace_nowrap().child(this.line))
      .child(tail);
  }

  render(cx) {
    const t = theme(), list = agents();
    this.watch(list, cx);
    const mood = this.moodOf(list);
    if (mood !== this.mood) (this.line = pick(mood, this.line)), (this.mood = mood);

    const blocked = list.filter((a) => a.status === "blocked");
    const done = list.filter((a) => a.status === "done");
    const working = list.filter((a) => a.status === "working");

    const urgent = blocked[0] ?? done[0];
    const monkey = div().id("monkey").flex_shrink_0().w(px(60)).h(px(60))
      .child(image(`${ART}/monkey-${mood}.gif`).w(px(60)).h(px(60)))
      .when(Boolean(urgent), (el) => el.on_click(() => run("agent.focus", { terminal: urgent.address })));
    const fire = image(`${ART}/${mood === "alarm" ? "campfire-blue" : "campfire"}.gif`).flex_shrink_0().w(px(56)).h(px(60));

    const mercs = h_flex().items_end().gap(2).children(
      working.slice(0, MAX_MERCS).map((a) =>
        div().id(`merc-${a.address}`).flex_shrink_0().w(px(24)).h(px(28))
          .on_click(() => run("agent.focus", { terminal: a.address }))
          .child(image(`${ART}/merc-${mercColor(a)}.gif`).w(px(24)).h(px(28)))))
      .when(working.length > MAX_MERCS, (el) => el.child(div().pb(14).text_size(12).text_color(t.foreground).child(`+${working.length - MAX_MERCS}`)));

    const space = spaces().find((s) => s.active);
    const stat = (color, label, n) => h_flex().gap(6).items_center()
      .child(div().size(8).bg(n ? color : t.border)).child(div().text_color(n ? t.foreground : t.dim).child(`${label} ${n}`));
    const tally = div().id("tally").flex_shrink_0()
      .on_click(() => openOverlay({ mod: "camp", kind: "dialog", width: 400, height: 460, frame: "none", props: { role: "report" } }))
      .child(rpgWindow(v_flex().gap(8).px(12).py(8).text_size(12).items_end()
        .child(h_flex().gap(14)
          .child(stat(t.blocked, "SOS", blocked.length))
          .child(stat(t.done, "Loot", done.length))
          .child(stat(t.working, "Quest", working.length)))
        .child(div().text_color(t.dim).child([space?.machine ?? "Home camp", space?.branch, "Report >"].filter(Boolean).join(" · ")))));

    // the night over the camp, its ground (the same grass and soil rows the GIFs are baked with), a few stars
    const ground = v_flex().absolute().left(0).right(0).bottom(0).h(6)
      .child(div().h(2).bg(GRASS)).child(div().h(4).bg(SOIL));
    const stars = STARS.map(([l, top, period], i) => div().absolute().top(top).left(`${l}%`).size(2).bg(i % 3 ? "#e6e8ff" : "#ffe6b0")
      .loop("opacity", { from: 0.25, to: 1, period }));
    return div().id("root").relative().size_full().bg(BG).overflow_hidden()
      .children(stars)
      .child(ground)
      .child(h_flex().size_full().items_end().gap(12).pl(12)
        .child(monkey)
        .child(fire)
        .child(mercs)
        .child(div().flex_1())
        .child(v_flex().h_full().justify_center().pr(10).child(tally)))
      .child(this.balloon(t, mood));
  }
}
