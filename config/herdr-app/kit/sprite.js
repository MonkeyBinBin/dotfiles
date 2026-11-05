// A baked sprite as a flipbook that runs natively, with no timer. GIFs only advance while the window has focus
// (GPUI's img element), a `.loop` doesn't care. One triangle wave drives every frame of a sprite sheet; each frame
// sits behind two opacity gates, one opening and one closing, driven far past 0..1 so they clamp into hard on/off
// switches and multiply into a band of the wave. A wave has no direction, so it plays there and back: bake motion
// that reads well in reverse. Neighbours overlap for a moment so an opaque strip never flashes what's behind it; on a
// transparent one that overlap shows both frames at once, so `exact` hands over from one to the next with no overlap.
import { div, image } from "gpui-kit";
import { SPRITES } from "./sprites.js";

const ART = "mods/sub/assets";
const SHARP = 50, EXACT_SHARP = 1000; // gate steepness: a gate's ramp lasts 1/SHARP of a frame

export function sprite(name, w, h = w, opts = {}) {
  const { n, period } = SPRITES[name] ?? { n: 1 }; // an unknown name draws nothing, as a missing image does
  const src = `${ART}/${name}.png`;
  if (n === 1) return image(src).w(w).h(h);
  // Where a gate stands at its frame's edge: fully open for the overlap, halfway when `exact`.
  const S = n * (opts.exact ? EXACT_SHARP : SHARP), edge = opts.exact ? 0.5 : 1, wave = (from, to) => ({ from, to, period: opts.period ?? period, easing: "linear" });
  const frames = Array.from({ length: n }, (_, i) => {
    let el = div().absolute().top(0).left(0).w(w).h(h).overflow_hidden()
      .child(image(src).absolute().top(0).left(-i * w).w(w * n).h(h));
    const open = i / n, close = (i + 1) / n;
    if (i < n - 1) el = el.loop("opacity", wave(S * close + edge, S * (close - 1) + edge));
    if (i > 0) el = div().absolute().top(0).left(0).w(w).h(h).loop("opacity", wave(edge - S * open, S * (1 - open) + edge)).child(el);
    return el;
  });
  return div().relative().w(w).h(h).children(frames);
}
