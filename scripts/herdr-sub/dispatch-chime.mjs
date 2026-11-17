#!/usr/bin/env node
// Synthesizes the dispatch PA's chimes into mods/dispatch/sounds/ as MP3 (via ffmpeg), the two-tone gong a station
// rings before an announcement, struck on metal bars in a concourse:
//   done.mp3     arrived: a calm rising three-note chime
//   blocked.mp3  signal stop: the same bars struck harder, a falling pair rung twice, so it reads as needing you
// The dispatch board plays them (kit/alerts.js); Herdr's own sounds are off in settings.json.
//
// Each note is a struck bar: a few inharmonic partials (a vibraphone-like bar's 1 : 3.9 : 9.2, plus a soft octave),
// each decaying on its own, the higher ones faster, with a mallet's short noisy attack; then the concourse: early
// reflections and a damped feedback delay, and a soft limiter.
//
//   node scripts/herdr-sub/dispatch-chime.mjs

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../config/herdr-app/.config/herdr-app/mods/dispatch/sounds");
const RATE = 44100;
const hz = (note) => 440 * 2 ** ((note - 69) / 12); // MIDI note number

let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// partials: [ratio, amplitude, decay seconds]
const BAR = [[1, 1, 1.6], [2, 0.18, 0.9], [3.9, 0.22, 0.45], [9.2, 0.06, 0.12]];

function strike(out, start, note, gain) {
  const f = hz(note), at = Math.round(start * RATE);
  const len = Math.min(out.length - at, Math.round(RATE * 2.2));
  const phase = BAR.map(() => rand() * Math.PI * 2);
  for (let i = 0; i < len; i++) {
    const t = i / RATE, attack = Math.min(1, i / 90);
    let s = 0;
    BAR.forEach(([r, a, d], k) => { s += a * Math.exp(-t / d) * Math.sin(2 * Math.PI * f * r * t + phase[k]); });
    // the mallet: a few ms of noise
    const click = t < 0.006 ? (rand() * 2 - 1) * 0.15 * (1 - t / 0.006) : 0;
    out[at + i] += gain * attack * (s + click);
  }
}

function concourse(dry) {
  const out = Float64Array.from(dry);
  for (const [ms, g] of [[23, 0.32], [41, 0.24], [67, 0.18], [97, 0.12]]) {
    const d = Math.round((RATE * ms) / 1000);
    for (let i = d; i < out.length; i++) out[i] += g * dry[i - d];
  }
  // a damped feedback delay for the hall's tail
  const d = Math.round(RATE * 0.113);
  let lp = 0;
  for (let i = d; i < out.length; i++) {
    lp = lp * 0.55 + out[i - d] * 0.45;
    out[i] += 0.33 * lp;
  }
  return out;
}

function render(notes, len, volume) {
  const dry = new Float64Array(Math.round(RATE * len));
  for (const [time, note, gain] of notes) strike(dry, time, note, gain);
  const wet = concourse(dry);
  const fade = Math.round(RATE * 0.25);
  return Float32Array.from(wet, (x, i) => {
    const tail = i > wet.length - fade ? (wet.length - i) / fade : 1;
    return Math.tanh(x * volume) * 0.9 * tail;
  });
}

function save(name, samples) {
  const file = join(OUT, `${name}.mp3`);
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "f32le", "-ar", String(RATE), "-ac", "1", "-i", "-", "-codec:a", "libmp3lame", "-q:a", "4", file],
    { input: Buffer.from(samples.buffer) });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
  console.log(`${name}.mp3  ${(samples.length / RATE).toFixed(2)} s`);
}

mkdirSync(OUT, { recursive: true });
// G4, C5, E5: up a fourth, then a third, each left to ring
save("done", render([[0, 67, 0.5], [0.32, 72, 0.5], [0.64, 76, 0.55]], 2.6, 0.32));
// A5 down to F5, twice, struck harder and closer together
save("blocked", render([[0, 81, 0.6], [0.22, 77, 0.6], [0.62, 81, 0.6], [0.84, 77, 0.65]], 2.6, 0.38));
