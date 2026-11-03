// The campfire band along the bottom of the window: That Monkey by the fire, reacting to every agent at once,
// one marching mercenary per working agent, and the camp's status on the right.
//
//   blocked  -> he jolts awake (alarm), the fire burns blue
//   done     -> he cheers (happy) for a moment whenever an agent finishes, then dozes off again
//   working  -> he sleeps; each working agent marches by as a mercenary
//   else     -> idle by the fire
import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, spaces, theme, run, setAgentOrder } from "herdr";
import { pick } from "../lines.js";

const ART = "mods/camp/assets";
const BG = "#151324";
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
    if (mood !== this.mood) (this.line = pick(mood, this.line)), (this.mood = mood);

    const blocked = list.filter((a) => a.status === "blocked");
    const done = list.filter((a) => a.status === "done");
    const working = list.filter((a) => a.status === "working");
    // agent.next / agent.prev go to the ones that need him first
    setAgentOrder([...blocked, ...done, ...working, ...list.filter((a) => a.status === "idle")].map((a) => a.address));

    const urgent = blocked[0] ?? done[0];
    const monkey = div().id("monkey").flex_shrink_0().w(px(60)).h(px(60))
      .child(image(`${ART}/monkey-${mood === "sleep" ? "sleep" : mood}.gif`).w(px(60)).h(px(60)))
      .when(Boolean(urgent), (el) => el.on_click(() => run("agent.focus", { terminal: urgent.address })));
    const fire = image(`${ART}/${mood === "alarm" ? "campfire-blue" : "campfire"}.gif`).flex_shrink_0().w(px(56)).h(px(60));

    const bubbleColor = { alarm: t.blocked, happy: t.done, sleep: t.dim, idle: t.muted }[mood];
    const bubble = div().flex_shrink_0().px(10).py(6).border(2).border_color(bubbleColor).bg(t.chrome)
      .text_size(12).text_color(t.foreground).whitespace_nowrap().child(this.line);

    const mercs = h_flex().items_end().gap(2).children(
      working.slice(0, MAX_MERCS).map((a) =>
        div().id(`merc-${a.address}`).flex_shrink_0().w(px(24)).h(px(26))
          .on_click(() => run("agent.focus", { terminal: a.address }))
          .child(image(`${ART}/merc-${mercColor(a)}.gif`).w(px(24)).h(px(26)))))
      .when(working.length > MAX_MERCS, (el) => el.child(div().pb(8).text_size(12).text_color(t.dim).child(`+${working.length - MAX_MERCS}`)));

    const space = spaces().find((s) => s.active);
    const stat = (color, label, n) => h_flex().gap(6).items_center()
      .child(div().size(8).bg(n ? color : t.border)).child(div().text_color(n ? t.foreground : t.dim).child(`${label} ${n}`));
    const status = v_flex().flex_shrink_0().gap(8).pr(16).text_size(12).items_end()
      .child(h_flex().gap(14)
        .child(stat(t.blocked, "求援", blocked.length))
        .child(stat(t.done, "凱旋", done.length))
        .child(stat(t.working, "出征", working.length)))
      .child(div().text_color(t.dim).child([space?.machine ?? "本機營地", space?.branch].filter(Boolean).join(" · ")));

    return h_flex().id("root").size_full().bg(BG).border_t(2).border_color(t.border).items_end().gap(12).pl(12).overflow_hidden()
      .child(monkey)
      .child(fire)
      .child(v_flex().h_full().justify_center().gap(8).flex_shrink_0().child(bubble).child(mercs))
      .child(div().flex_1())
      .child(v_flex().h_full().justify_center().child(status));
  }
}
