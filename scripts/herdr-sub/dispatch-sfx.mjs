#!/usr/bin/env node
// Synthesizes the dispatch board's split-flap clatter into mods/dispatch/sounds/flap.mp3 (via ffmpeg).
//
// A Solari board is dozens of modules turning at once on a shared drive, dropping flaps in near step (about 16 a
// second) until each reaches its character: a rhythmic mechanical "trrrr" at the flap rate that thins out as the
// modules finish one by one, the last few clacks on their own. Each flap is a hard plastic card slapping onto the one
// below: an impact, not a tone, so it is modal synthesis on noise, never pure sine waves:
//   - the impact: a 2-3 ms burst of noise, the contact itself
//   - the plastic: that burst ringing through a few stiff, heavily damped, inharmonic resonances (0.9-5 kHz, each a
//     band-pass filter a few ms long), different on every flap as no two cards land alike
//   - the body: a short low "tok" from the module's frame (~250-400 Hz, band-passed)
//   - the card settling a few ms later, a smaller tick
// then a little of a hall's early reflections, and a soft limiter.
//
//   node scripts/herdr-sub/dispatch-sfx.mjs

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../config/herdr-app/.config/herdr-app/mods/dispatch/sounds");
const RATE = 44100;
const MODULES = 36, RATE_HZ = 16, MAX_FLAPS = 14;

// a seeded random, so the sound is the same on every run
let seed = 11;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const between = (a, b) => a + (b - a) * rand();

const LEN = 1.6;
const out = new Float64Array(Math.round(RATE * LEN));

// A two-pole band-pass (RBJ biquad, constant peak gain) run over `input`, added into `into` from `start`.
function bandpass(input, into, start, f, q, gain) {
  const w = (2 * Math.PI * f) / RATE, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
  const b0 = alpha / a0, b2 = -alpha / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length && start + i < into.length; i++) {
    const x = input[i], y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    into[start + i] += gain * y;
  }
}

// The excitation: a noise burst with a sharp attack and a fast exponential fall, then silence for the ringing.
function burst(ms, len = 0.03) {
  const n = new Float64Array(Math.round(RATE * len)), tau = ms / 1000;
  for (let i = 0; i < n.length; i++) {
    const t = i / RATE;
    n[i] = (rand() * 2 - 1) * Math.exp(-t / tau) * Math.min(1, i / 8);
  }
  return n;
}

function clack(start, gain) {
  const hit = burst(between(0.5, 0.9));
  // the plastic's modes: stiff, inharmonic, damped within a few ms (low q)
  const base = between(850, 1150);
  for (const [ratio, q, g] of [[1, 5, 0.9], [1.83, 6, 0.8], [2.97, 7, 0.6], [4.6, 6, 0.35]])
    bandpass(hit, out, start, base * ratio * between(0.94, 1.06), q, gain * g);
  // the impact itself, bright and dry
  bandpass(hit, out, start, between(6000, 8000), 1.2, gain * 0.5);
  // the frame's low tok
  bandpass(burst(1.2), out, start, between(250, 400), 2.5, gain * 0.7);
}

function flap(at, gain) {
  const start = Math.round(at * RATE);
  clack(start, gain);
  // the card settling onto the stack
  clack(start + Math.round(between(0.006, 0.012) * RATE), gain * between(0.18, 0.3));
}

// every module turns on the same beat, a few ms either side of it, for its own number of flaps
const BEAT = 1 / RATE_HZ;
for (let m = 0; m < MODULES; m++) {
  const flaps = 1 + Math.floor(rand() * MAX_FLAPS);
  const lag = between(0, 0.012), loud = between(0.55, 1);
  for (let i = 0; i < flaps; i++) flap(lag + i * BEAT + between(-0.0025, 0.0025), loud * between(0.75, 1));
}

// a hall's early reflections, each a little darker than the last
const wet = new Float64Array(out.length);
for (const [ms, g] of [[13, 0.22], [29, 0.16], [47, 0.11], [71, 0.07]]) {
  const d = Math.round((ms / 1000) * RATE);
  let lp = 0;
  for (let i = d; i < out.length; i++) {
    lp += 0.35 * (out[i - d] - lp);
    wet[i] += g * lp;
  }
}
for (let i = 0; i < out.length; i++) out[i] += wet[i];

// normalise, then a soft limiter; trim the silent tail
let peak = 0;
for (const v of out) peak = Math.max(peak, Math.abs(v));
let end = out.length;
while (end > 0 && Math.abs(out[end - 1]) < peak * 0.002) end--;
const pcm = new Float32Array(Math.min(out.length, end + Math.round(RATE * 0.03)));
for (let i = 0; i < pcm.length; i++) pcm[i] = Math.tanh((out[i] / peak) * 1.1) * 0.85;

const file = join(OUT, "flap.mp3");
mkdirSync(OUT, { recursive: true });
const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "f32le", "-ar", String(RATE), "-ac", "1", "-i", "-", "-codec:a", "libmp3lame", "-q:a", "3", file],
  { input: Buffer.from(pcm.buffer) });
if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
console.log(`flap.mp3  ${(pcm.length / RATE).toFixed(2)} s`);
