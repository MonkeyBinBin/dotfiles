// A dispatch train, one per agent on the track map, in realistic pixel art. Five models, all in the same box so the mod
// lays any of them out the same way (`model`):
//   emu     a three-car stainless commuter EMU (_emu.js)
//   bullet  a high-speed train with long aerodynamic noses (_bullet.js)
//   dmu     a two-tone diesel railcar pair, smoke from its stacks (_dmu.js)
//   loco    an electric locomotive hauling two coaches (_loco.js)
//   tram    a three-section articulated light-rail tram (_tram.js)
// The status is the livery colour (`palette`, darkest to lightest) and the lamps, the same on every model:
//   working  windows lit with passengers, headlights on, red tail lights at the back, wheels turning
//   done     standing with its doors open, the saloon lit
//   blocked  held at a signal: windows dimmed, red markers blinking at both ends
//   idle     parked: dark windows, pantographs down, lamps off, in shadow
// Facing right; origin at the rail top under the train's middle (the wheels stand on y = 0).

import { hex, wrap } from "../../core/index.js";
import { emu } from "./_emu.js";
import { bullet } from "./_bullet.js";
import { dmu } from "./_dmu.js";
import { locoTrain } from "./_loco.js";
import { tram } from "./_tram.js";

export const meta = {
  name: "Dispatch train",
  desc: "Trains in realistic pixel art (commuter EMU, high-speed, diesel railcar, locomotive and coaches, tram) in a status livery.",
  tags: ["dispatch", "vehicle", "loop"],
  size: [132, 40],
  origin: [66, 35],
  duration: 0.66,
  loop: true,
  fps: 6,
  bg: "dark",
  options: { model: "emu", state: "working", palette: ["#7a4a12", "#c8801e", "#ffb03a", "#ffe0a0"] },
};

const MODELS = { emu, bullet, dmu, loco: locoTrain, tram };

export function draw(p, t, o) {
  const frame = Math.floor((wrap(t, meta.duration) / meta.duration) * 4) % 4;
  (MODELS[o.model] ?? emu)(p, o.state, o.palette.map(hex), frame);
}
