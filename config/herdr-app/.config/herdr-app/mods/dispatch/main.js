// Dispatch: a night railway dispatch office for Herdr. One mod, a role per block picked by props.role, so the trains'
// state and the inks live in one place:
//   board   the Solari split-flap departure board across the top, with a flap clock and the lines (spaces)
//   tracks  the track map down the right: the platforms (tabs), a track per train with its signal
//   pane    a carriage nameplate over each pane, with the cab's gauges
import { View } from "gpui-kit";
import { props } from "herdr";
import { Board } from "./roles/board.js";
import { Tracks } from "./roles/tracks.js";
import { PaneHeader } from "./roles/pane.js";

const ROLES = { board: Board, tracks: Tracks, pane: PaneHeader };

export default class Dispatch extends View {
  // The role is read from props() on first render: init's own argument doesn't carry the layout's props.
  render(cx) {
    const p = props() ?? {};
    if (!this.role) this.role = new (ROLES[p.role ?? (p.pane ? "pane" : "board")] ?? Board)(cx);
    return this.role.render(cx, p);
  }
}
