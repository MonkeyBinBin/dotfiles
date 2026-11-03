// The sub: That Monkey's submarine interface for Herdr. One mod, several roles picked by props.role, so the
// state, the lines and the art live in one place:
//   sea    the sea column: the agents as mini-subs, deeper the longer they've been under; the captain on top
//   sonar  the sonar scope under it: a blip per agent, and the crew's counts
//   deck   the bottom hull edge: the spaces as compartment plates, Settings
//   pane   a porthole header over each pane
import { View } from "gpui-kit";
import { props } from "herdr";
import { Sea } from "./roles/sea.js";
import { Sonar } from "./roles/sonar.js";
import { Deck } from "./roles/deck.js";
import { PaneHeader } from "./roles/pane.js";

const ROLES = { sea: Sea, sonar: Sonar, deck: Deck, pane: PaneHeader };

export default class Sub extends View {
  init() {
    this.role = null;
  }

  // The role is read from props() on first render: init's own argument doesn't carry the layout's props.
  render(cx) {
    const p = props() ?? {};
    if (!this.role) this.role = new (ROLES[p.role ?? (p.pane ? "pane" : "sea")] ?? Sea)(cx);
    return this.role.render(cx, p);
  }
}
