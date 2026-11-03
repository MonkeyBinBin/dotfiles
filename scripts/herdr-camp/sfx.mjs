#!/usr/bin/env node
// Synthesizes the camp's 8-bit alert sounds (square-wave chiptune) into mods/camp/sounds/ as MP3 (via ffmpeg):
//   done.mp3     a little victory fanfare: an agent finished
//   blocked.mp3  a two-note alarm: an agent needs you
// Herdr plays them when settings.json says { "sounds": { "done": ..., "blocked": ... } } (install.sh sets that).
//
//   node scripts/herdr-camp/sfx.mjs

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../config/herdr-app/.config/herdr-app/mods/camp/sounds");
const RATE = 44100;
const hz = (note) => 440 * 2 ** ((note - 69) / 12); // MIDI note number

// notes: [midi, beats, duty]; a square wave with a fast attack and a decay per note, plus a quiet octave echo
function render(notes, bpm, volume = 0.28) {
  const beat = 60 / bpm, out = [];
  for (const [n, beats, duty = 0.5] of notes) {
    const len = Math.round(beats * beat * RATE), f = n ? hz(n) : 0;
    for (let i = 0; i < len; i++) {
      const t = i / RATE, env = Math.min(1, i / 120) * Math.exp(-3.2 * (i / len));
      const sq = (fr) => ((t * fr) % 1 < duty ? 1 : -1);
      out.push(f ? volume * env * (0.8 * sq(f) + 0.2 * sq(f * 2)) : 0);
    }
  }
  // a short tail so it doesn't click off
  for (let i = 0; i < RATE * 0.04; i++) out.push(0);
  return Float32Array.from(out);
}

function save(name, samples) {
  const file = join(OUT, `${name}.mp3`);
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "f32le", "-ar", String(RATE), "-ac", "1", "-i", "-", "-codec:a", "libmp3lame", "-q:a", "4", file],
    { input: Buffer.from(samples.buffer) });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
  console.log(`${name}.mp3  ${(samples.length / RATE).toFixed(2)} s`);
}

mkdirSync(OUT, { recursive: true });
// C major arpeggio up to the octave, the top note held: ta-da!
save("done", render([[72, 0.5, 0.5], [76, 0.5, 0.5], [79, 0.5, 0.5], [84, 1.5, 0.25]], 520));
// two high-low alarm pairs
save("blocked", render([[81, 0.5, 0.25], [76, 0.5, 0.25], [0, 0.25], [81, 0.5, 0.25], [76, 0.75, 0.25]], 400, 0.24));
