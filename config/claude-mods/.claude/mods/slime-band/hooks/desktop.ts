// The band on surfaces that draw SVG (desktop, editor, mobile): the slime's
// track as one vector scene, animated by SMIL inside the surface's sandboxed
// frame, so the hook redraws only when the slime's state changes, never per frame.

import { SLIME_FRAMES, SLIME_PALETTE, SLIME_WIDTH } from './slime-sprite'
import type { SlimePose } from './slime-sprite'
import type { HudLayout } from './hud'
import type { ContextInfo } from '../types'
import { TUBE_ROWS, groundSvg } from './mana-tube'

// CSS pixels per sprite pixel.
export const PX = 6
// CSS pixels a band column is taken to span; an overestimate only scales the scene down to its slot.
const COLUMN_PX = 8
// The label strip above the track, in sprite pixels.
const LABEL_ROWS = 2
// Sprite rows, then grass and soil.
const SPRITE_ROWS = 6
const TRACK_PIXELS = SPRITE_ROWS + 2

// The terminal moves the slime one pixel per hop: a squash and a stretch of three 80ms ticks each.
export const HOP_MS = 480
const ALERT_MS = 400
const SNORE_MS = 800

const GRASS = ['#4caf50', '#66bb6a', '#4caf50', '#81c784']
const SOIL = ['#8d5a2b', '#8d5a2b', '#6d4220', '#8d5a2b', '#7a4b24']
const SNORE_COLOR = '#c8d2ff'
const ALERT_COLOR = '#ffd23c'

const hex = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`

// The track's width in sprite pixels for a band `columns` wide.
export const sceneWidth = (columns: number): number => Math.max(SLIME_WIDTH * 2, Math.floor((columns * COLUMN_PX) / PX))

// Horizontal runs of one colour, so a row of pixels is a handful of rects.
const runsToRects = (rows: readonly (string | undefined)[][], top: number): string => {
  let out = ''
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const color = row[x]
      let end = x + 1
      while (end < row.length && row[end] === color) end += 1
      if (color !== undefined) {
        out += `<rect x="${x * PX}" y="${(y + top) * PX}" width="${(end - x) * PX}" height="${PX}" fill="${color}"/>`
      }
      x = end
    }
  })
  return out
}

const spriteRects = (pose: SlimePose, dir: 1 | -1): string => {
  const rows = SLIME_FRAMES[pose].map(line => {
    const chars = [...line]
    if (dir === -1) chars.reverse()
    return chars.map(ch => {
      const rgb = SLIME_PALETTE[ch]
      return rgb === undefined ? undefined : hex(rgb)
    })
  })
  return runsToRects(rows, LABEL_ROWS)
}

const blink = (ms: number, from: 'visible' | 'hidden', begin = '0s') => {
  const to = from === 'visible' ? 'hidden' : 'visible'
  return `<animate attributeName="visibility" values="${from};${to}" keyTimes="0;0.5" calcMode="discrete" dur="${ms}ms" begin="${begin}" repeatCount="indefinite"/>`
}

// Where the ping-pong walk is after `ms` of hopping from (x, dir) over an area whose last slime column is `last`.
export const walkAt = (x: number, dir: 1 | -1, last: number, ms: number): { x: number; dir: 1 | -1 } => {
  if (last <= 0) return { x: 0, dir }
  const period = last * 2
  const start = dir === 1 ? x : period - x
  const u = (start + Math.floor(ms / HOP_MS)) % period
  return u < last ? { x: u, dir: 1 } : { x: period - u, dir: -1 }
}

export type SceneSlime = {
  // 'walk' hops back and forth from (x, dir); the others hold still at x.
  mode: 'walk' | 'sit' | 'sleep' | 'wait'
  x: number
  dir: 1 | -1
  // The slime's last column in the area left of the HUD.
  last: number
}

const slimeGroup = (slime: SceneSlime): string => {
  if (slime.mode !== 'walk' || slime.last <= 0) {
    const pose: SlimePose = slime.mode === 'sleep' ? 'sleep' : slime.mode === 'walk' ? 'run1' : 'sit'
    let group = `<g transform="translate(${slime.x * PX} 0)">${spriteRects(pose, slime.dir)}</g>`
    const ahead = slime.dir === 1 ? slime.x + SLIME_WIDTH : slime.x - 1
    if (slime.mode === 'wait') {
      group += `<text x="${(Math.max(0, ahead) + 0.5) * PX}" y="${(LABEL_ROWS + 3) * PX}" fill="${ALERT_COLOR}" font-weight="bold" font-size="${PX * 2.4}" text-anchor="middle">!${blink(ALERT_MS, 'visible')}</text>`
    }
    if (slime.mode === 'sleep') {
      const zx = (slime.x + (slime.dir === 1 ? SLIME_WIDTH - 2 : 1)) * PX
      group +=
        `<text x="${zx}" y="${(LABEL_ROWS + 3) * PX}" fill="${SNORE_COLOR}" font-size="${PX * 1.6}">z${blink(SNORE_MS * 2, 'visible')}</text>` +
        `<text x="${zx + PX * 2}" y="${(LABEL_ROWS + 1.5) * PX}" fill="${SNORE_COLOR}" font-size="${PX * 2}">Z${blink(SNORE_MS * 2, 'hidden')}</text>`
    }
    return group
  }
  // One ping-pong lap: right to `last`, then back. A negative begin starts it where the slime stands now.
  const lapMs = slime.last * 2 * HOP_MS
  const startMs = (slime.dir === 1 ? slime.x : slime.last * 2 - slime.x) * HOP_MS
  const begin = `-${startMs}ms`
  const facing = (dir: 1 | -1) =>
    `<g visibility="hidden">` +
    `<animate attributeName="visibility" values="${dir === 1 ? 'visible;hidden' : 'hidden;visible'}" keyTimes="0;0.5" calcMode="discrete" dur="${lapMs}ms" begin="${begin}" repeatCount="indefinite"/>` +
    `<g>${spriteRects('run1', dir)}${blink(HOP_MS, 'visible')}</g>` +
    `<g visibility="hidden">${spriteRects('run2', dir)}${blink(HOP_MS, 'hidden')}</g>` +
    `</g>`
  return (
    `<g>` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;${slime.last * PX} 0;0 0" keyTimes="0;0.5;1" dur="${lapMs}ms" begin="${begin}" repeatCount="indefinite"/>` +
    facing(1) +
    facing(-1) +
    `</g>`
  )
}

const escapeXml = (text: string) => text.replace(/[&<>"]/g, ch => `&#${ch.charCodeAt(0)};`)

// The scene's size in CSS pixels. Given to the Svg: a sandboxed frame left to size itself takes the browser's
// default 150px height and pads the scene above and below.
export const sceneSize = (width: number, hasGround = false) => ({
  width: width * PX,
  height: (LABEL_ROWS + TRACK_PIXELS + (hasGround ? TUBE_ROWS * 2 : 0)) * PX,
})

// The ground under the soil: the context window as a tube of mana, rippling `frameMs` a step.
export type SceneGround = { info: ContextInfo; isWorking: boolean; frameMs: number }

// The whole track: labels over the big numbers, the slime, the grass and soil under both, and the ground below.
export const sceneSvg = (width: number, hud: HudLayout, slime: SceneSlime, labelColors: Record<string, string>, ground?: SceneGround): string => {
  const { height } = sceneSize(width, ground !== undefined)
  const floor = [0, 1].map(row =>
    Array.from({ length: width }, (_, col) => (row === 0 ? GRASS[col % GRASS.length] : SOIL[(col * 3) % SOIL.length])),
  )
  const digits = hud.pixels.map(p => `<rect x="${p.x * PX}" y="${(p.y + LABEL_ROWS) * PX}" width="${PX}" height="${PX}" fill="${hex(p.rgb)}"/>`).join('')
  // A monospace character is about 0.6em: at this size each label character spans one sprite pixel, as a cell does.
  const labels = hud.labels
    .map(
      label =>
        `<text x="${(label.x + label.width / 2) * PX}" y="${LABEL_ROWS * PX - 2}" fill="${labelColors[label.color] ?? '#999999'}" text-anchor="middle">${escapeXml(label.text)}</text>`,
    )
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width * PX}" height="${height}" viewBox="0 0 ${width * PX} ${height}" shape-rendering="crispEdges" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="${PX / 0.6}">` +
    labels +
    digits +
    slimeGroup(slime) +
    runsToRects(floor, LABEL_ROWS + SPRITE_ROWS) +
    (ground === undefined ? '' : groundSvg(ground.info, width, ground.isWorking, PX, ground.frameMs, (LABEL_ROWS + TRACK_PIXELS) * PX)) +
    `</svg>`
  )
}
