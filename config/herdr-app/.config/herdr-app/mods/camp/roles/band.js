// The campfire stage along the bottom of the window, under a line of pines: That Monkey by the fire, reacting
// to every agent at once, one marching mercenary per working agent, and the camp's signpost on the right (the tally; click: report).
//
//   blocked  -> he jolts awake (alarm), the fire burns blue
//   done     -> he cheers (happy) for a moment whenever an agent finishes, then dozes off again
//   working  -> he sleeps; each working agent marches by as a mercenary
//   else     -> idle by the fire
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, theme, run, shared, setShared, openOverlay } from "herdr";
import { ART } from "../state.js";

const BG = "#151324", GRASS = "#3f6e40", SOIL = "#1d3a24", SIGN_INK = "#140c08", SIGN_FAINT = "#6a421e";
// a few stars over the band's sky (left %, top px, twinkle period ms); they sit where no GIF covers them
const STARS = [[46, 14, 2300], [58, 30, 3100], [63, 10, 2700], [71, 40, 3600], [79, 18, 2000], [88, 34, 2900], [93, 8, 3300]];
const HAPPY_MS = 3600;
const TREE_H = 24; // the pine tiles: 12 native px
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

  render(cx) {
    const t = theme(), list = agents();
    this.watch(list, cx);
    const mood = this.moodOf(list);

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

    // the signpost in the grass: each arrow board carries a seal and a count (SOS, Loot, Quest from the top);
    // click it for the report. Boards sit where camp/signpost.js draws them: tops at -42, -31, -20, 9 px tall,
    // the post at x -2..1, in a crop from (-10, -56); here at 2x.
    const board = (top, status, n) => h_flex().absolute().top((top + 56) * 2 + 1).left(26).h(16).gap(3).items_center()
      .child(image(`${ART}/icon-${status}.gif`).size(16))
      .child(div().text_size(12).text_color(n ? SIGN_INK : SIGN_FAINT).child(String(n)));
    const signpost = div().id("signpost").relative().flex_shrink_0().w(px(40)).h(px(60))
      .on_click(() => openOverlay({ mod: "camp", kind: "dialog", width: 400, height: 460, frame: "none", props: { role: "report" } }))
      .child(image(`${ART}/signpost.gif`).w(px(40)).h(px(60)))
      .child(board(-42, "blocked", blocked.length))
      .child(board(-31, "done", done.length))
      .child(board(-20, "working", working.length));

    // the night over the camp, its ground (the same grass and soil rows the GIFs are baked with), a few stars
    const ground = v_flex().absolute().left(0).right(0).bottom(0).h(6)
      .child(div().h(2).bg(GRASS)).child(div().h(4).bg(SOIL));
    const stars = STARS.map(([l, top, period], i) => div().absolute().top(top).left(`${l}%`).size(2).bg(i % 3 ? "#e6e8ff" : "#ffe6b0")
      .loop("opacity", { from: 0.25, to: 1, period }));
    // the forest round the camp against the sky: pine tiles along the top, the sky showing through above them
    const treeline = h_flex().h(TREE_H).flex_none().overflow_hidden()
      .children(Array.from({ length: 32 }, () => image(`${ART}/treeline.png`).w(128).h(TREE_H).flex_none()));
    return v_flex().size_full()
      .child(treeline)
      .child(div().id("root").relative().flex_1().bg(BG).overflow_hidden()
        .children(stars)
        .child(ground)
        .child(h_flex().size_full().items_end().gap(12).pl(12)
          .child(monkey)
          .child(fire)
          .child(mercs)
          .child(div().flex_1())
          .child(div().pr(24).child(signpost))));
  }
}
