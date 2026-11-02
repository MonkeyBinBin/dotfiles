import type { EngineInterface } from 'claude-code'

import { FRAME_MS } from './anim'

// Pixel-art bursts for the HUD's big moments (a level up, a revive, a boss slain, a pet summoned or back), where
// the terminal draws pictures: pixelfx effects (https://github.com/patch-gg/pixelfx, MIT) baked by rpg-battle's
// tools/bake-fx.mjs at one frame per animation tick into assets/fx/<name>/. See assets/fx/NOTICE.md.

export type BurstName = 'level-up' | 'revive' | 'confetti' | 'poof' | 'sparkle'

// A baked burst: every frame as PNG base64 and the cells it fills.
export type Burst = { frames: string[]; columns: number; rows: number }

// Read once each. A failed read is not kept: the next moment tries again, and a missing burst costs the moment
// its picture, never the pane.
const bursts = new Map<BurstName, Burst>()

export async function loadBurst($: EngineInterface, name: BurstName): Promise<Burst | undefined> {
  const known = bursts.get(name)
  if (known !== undefined) return known
  const dir = `${$.plugin.root}/assets/fx/${name}`
  const burst = await $.fs
    .read(`${dir}/meta.json`)
    .then(async text => {
      const meta = JSON.parse(text) as { frames: number; cells: [number, number] }
      const frames = await Promise.all(
        Array.from({ length: meta.frames }, async (_, n) => (await $.fs.read(`${dir}/${n}.png`, { as: 'bytes' })).base64),
      )
      return { frames, columns: meta.cells[0], rows: meta.cells[1] }
    })
    .catch(() => undefined)
  if (burst !== undefined) bursts.set(name, burst)
  return burst
}

// How long a burst plays: a frame a tick.
export const burstMs = (burst: Burst): number => burst.frames.length * FRAME_MS

// The frame `elapsed` ms in, the last held past the end.
export const burstFrame = (burst: Burst, elapsed: number): string =>
  burst.frames[Math.max(0, Math.min(burst.frames.length - 1, Math.floor(elapsed / FRAME_MS)))]!

export const isPlaying = (burst: Burst, elapsed: number): boolean => elapsed >= 0 && elapsed < burstMs(burst)
