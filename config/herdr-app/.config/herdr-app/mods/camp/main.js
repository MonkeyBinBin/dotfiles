// The camp: That Monkey's lazy-hero interface for Herdr. One mod, several roles picked by props.role,
// so the state, the lines and the art live in one place:
//   band    the campfire stage along the bottom     hero    the hero's status window, top left
//   quests  the quest board (the agents list)       pane    a wooden sign over each pane (a pane header)
//   report  the battle report dialog (opened from the band's tally)
import { View, div } from "gpui-kit";
import { props } from "herdr";
import { Band } from "./roles/band.js";
import { Quests } from "./roles/quests.js";
import { PaneSign } from "./roles/pane.js";
import { Report } from "./roles/report.js";
import { Hero } from "./roles/hero.js";

const ROLES = { band: Band, hero: Hero, quests: Quests, pane: PaneSign, report: Report };

export default class Camp extends View {
  init(_p, cx) {
    this.cx = null;
    this.role = null;
  }

  // The role is read from props() on first render: init's own argument doesn't carry the layout's props.
  pick(cx, p) {
    const role = p.role ?? (p.pane ? "pane" : "band");
    this.role = new (ROLES[role] ?? Band)(cx);
  }

  render(cx) {
    const p = props() ?? {};
    if (!this.role) this.pick(cx, p);
    return this.role.render(cx, p);
  }

  async close(cx) {
    this.role?.close?.(cx);
  }
}
