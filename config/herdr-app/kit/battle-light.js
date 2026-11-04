// Battle lighting: while an agent or an escort is blocked, the parts of the window the sub draws itself breathe red together.
// Goes behind a role's content; `peak` is how strong it gets there.
import { div } from "gpui-kit";
import { spaces } from "herdr";
import { sosEscorts } from "./escorts.js";

export const onAlert = () => spaces().some((s) => s.status === "blocked") || sosEscorts().length > 0;

export const battleLight = (peak = 0.6) => div().absolute().top(0).left(0).size_full().bg("#7a120c")
  .loop("opacity", { from: 0, to: peak, period: 1800 });
