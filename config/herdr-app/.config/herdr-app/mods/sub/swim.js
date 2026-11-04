// Things that swim a path of legs, each to an { x, y } mark in `ms`: a transition animates each later change of target,
// so a timer per leg moves them while the motion itself stays native. Shared by the sea column and the pane headers.
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];

// A path across the width. `speed` in px/s, `steps` legs on the way, `rise` how far it strays up and down;
// `turns` the chance a leg doubles back (by `back` px), `stops` the chance it hangs still after one, `lunges` the
// chance of a burst.
export function route(W, w, right, { speed, steps, rise, turns = 0, stops = 0, lunges = 0, back = [70, 170], easing = "ease-in-out" }) {
  const from = right ? -w - 10 : W + 10, to = right ? W + 10 : -w - 10, dir = right ? 1 : -1, span = Math.abs(to - from) / steps;
  const legs = [];
  let x = from, y = 0;
  const leg = (nx, ny, px, ease = easing) => {
    legs.push({ x: nx, y: ny, ms: Math.max(250, (Math.hypot(nx - x, ny - y) / px) * 1000), easing: ease });
    x = nx;
    y = ny;
  };
  for (let i = 1; i < steps; i++) {
    const on = from + dir * span * i + dir * rand(-span, span) * 0.2, level = rand(-rise, rise);
    if (Math.random() < lunges) leg(on, level, speed * 3.2, "ease-out");
    else leg(on, level, speed);
    if (Math.random() < stops) legs.push({ x, y, ms: rand(700, 1700), easing: "linear" });
    if (Math.random() < turns) {
      leg(x - dir * rand(...back), rand(-rise, rise), speed * 0.8);
      leg(x + dir * rand(back[0] * 1.3, back[1] * 1.3), rand(-rise, rise), speed * 0.8);
    }
  }
  leg(to, rand(-rise, rise) * 0.4, speed);
  return legs;
}

// Walks an actor (`legs`, its own `after`) along its path; returns when it ends, counted from now. `done` runs then.
export function walk(cx, a, done) {
  let at = 120 + (a.after ?? 0);
  a.leg = -1;
  a.legs.forEach((l, i) => {
    cx.timer.after(at, (cx) => {
      a.leg = i;
      cx.notify();
    });
    at += l.ms;
  });
  if (done) cx.timer.after(at + 100, done);
  return at;
}

// Where it is now: the leg it's on, or its starting mark.
export const position = (a) => (a.leg < 0 ? a.from : a.legs[a.leg]);

// Which way it's facing: where this leg went, or the last leg that went anywhere, else where the path is headed.
export function facingRight(a) {
  for (let n = a.leg, prev; n >= 0; n--) {
    prev = n ? a.legs[n - 1].x : a.from.x;
    if (Math.abs(a.legs[n].x - prev) > 4) return a.legs[n].x > prev;
  }
  return a.legs.at(-1).x > a.from.x;
}

export const motionOf = (mark) => ({ duration: mark.ms ?? 1, easing: mark.easing ?? "linear" });
