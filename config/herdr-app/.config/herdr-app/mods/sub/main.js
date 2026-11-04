// The sub: That Monkey's submarine interface for Herdr. One mod, several roles picked by props.role, so the
// state, the lines and the art live in one place:
//   sea    the sea column: the agents as mini-subs, deeper the longer they've been under; the captain on top
//   sonar  the sonar scope under it: a blip per agent, and the crew's counts
//   deck   the control console along the bottom hull edge: the spaces as toggle plates, telegraph, alarms, systems
//   pane   a porthole header over each pane
//   log    the captain's log dialog (opened from the nameplate)
//   menu   a sub's right-click menu (state.js subMenu())
//   scope  the periscope window's bar (state.js periscope(): one agent's live terminal, floating)
import { View } from "gpui-kit";
import { props } from "herdr";
import { Sea } from "./roles/sea.js";
import { Sonar } from "./roles/sonar.js";
import { Deck } from "./roles/deck.js";
import { PaneHeader } from "./roles/pane.js";
import { CaptainsLog } from "./roles/log.js";
import { Scope } from "./roles/scope.js";
import { SubMenu } from "./roles/menu.js";

const ROLES = { sea: Sea, sonar: Sonar, deck: Deck, pane: PaneHeader, log: CaptainsLog, scope: Scope, menu: SubMenu };

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
