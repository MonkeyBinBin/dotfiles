import type { ElementTable, RenderChildren } from 'claude-code'

import { hexOf, lighten } from './palette'
import { BAR_HEIGHT, COLUMN_PX, barSvg } from './svg'
import { packCells } from './util'

// Every gauge the HUD draws, one style: a lit top edge over the fill's own colour, eighth-cell steps at its end,
// and a dark recessed trough for the rest. On the terminal the same cells go out as a Raster (where the panel
// animates them) or as Text runs (inside a button); off it the gauge is a drawing.

const UPPER_HALF = 0x2580
// ▏▎▍▌▋▊▉: one to seven eighths of a cell, from its left edge.
const LEFT_EIGHTHS = [0x258f, 0x258e, 0x258d, 0x258c, 0x258b, 0x258a, 0x2589] as const
// The trough: a shadowed top edge over a dark floor.
export const TROUGH = 0x2c2c36
export const TROUGH_EDGE = 0x1c1c24

export type GaugeCell = readonly [glyph: number, fg: number, bg: number]

// The cells of a gauge `width` wide at `share` full, in `rgb`.
export const gaugeRuns = (share: number, width: number, rgb: number): GaugeCell[] => {
  const eighths = Math.round(Math.max(0, Math.min(1, share)) * width * 8)
  const full = Math.floor(eighths / 8)
  const part = eighths % 8
  const edge = lighten(rgb, 0.4)
  return Array.from({ length: width }, (_, col): GaugeCell => {
    if (col < full) return [UPPER_HALF, edge, rgb]
    if (col === full && part > 0) return [LEFT_EIGHTHS[part - 1]!, rgb, TROUGH]
    return [UPPER_HALF, TROUGH_EDGE, TROUGH]
  })
}

export const gaugeCells = (share: number, width: number, rgb: number): string => packCells(gaugeRuns(share, width, rgb))

// A gauge brightened toward white by `t`: the low-mana pulse and the level up's flash.
export const glowCells = (share: number, width: number, rgb: number, t: number): string => gaugeCells(share, width, lighten(rgb, t))

// The gauge as Text runs, one per stretch of like cells: for a row drawn as text (a button's label).
export function gaugeText(ui: ElementTable, key: string, share: number, width: number, rgb: number) {
  const { Text } = ui
  const runs: { text: string; fg: number; bg: number }[] = []
  for (const [glyph, fg, bg] of gaugeRuns(share, width, rgb)) {
    const last = runs.at(-1)
    const ch = String.fromCodePoint(glyph)
    if (last !== undefined && last.fg === fg && last.bg === bg) last.text += ch
    else runs.push({ text: ch, fg, bg })
  }
  return runs.map((run, at) => (
    <Text key={`${key}-${at}`} color={hexOf(run.fg)} backgroundColor={hexOf(run.bg)}>
      {run.text}
    </Text>
  ))
}

export type GaugeProps = {
  key: string
  share: number
  width: number
  rgb: number
  alt: string
  Raster?: ElementTable<'terminal'>['Raster']
  // Cells drawn in place of the plain gauge (a flash, a pulse); the Raster's first frame.
  cells?: string
}

// One gauge for the surface: a Raster the animation can blit, a drawing off the terminal, Text runs otherwise.
export function gauge(ui: ElementTable, props: GaugeProps): RenderChildren {
  const { key, share, width, rgb, alt, Raster } = props
  if (Raster !== undefined) return <Raster key={key} columns={width} rows={1} cells={props.cells ?? gaugeCells(share, width, rgb)} />
  if ('Svg' in ui && ui.Svg !== undefined) {
    const Svg = ui.Svg as ElementTable<'desktop'>['Svg']
    return <Svg key={key} source={barSvg(share, 1, width, hexOf(rgb))} alt={alt} width={width * COLUMN_PX} height={BAR_HEIGHT} />
  }
  return gaugeText(ui, key, share, width, rgb)
}
