// The context window as an RPG status window under the slime's floor: a framed
// CTX bar with one run of blocks per category in /context's own colours, free
// space as dim shade, and the categories listed inside the frame.

import type { ContextCategoryKind } from 'claude-code'

import type { ContextInfo } from '../types'
import { RIGHT_MARGIN, formatTokens } from './hud'

// A mana crystal: single-width, so column math stays exact.
const PREFIX = '◈ '
export const TITLE = '◈ MANA'
export const CTX_LABEL = 'CTX '
export const OPEN = '▕'
export const CLOSE = '▏'
export const FRAME = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' } as const
// '│ ' on the left, ' │' on the right.
const SIDE = 2
const MIN_GAUGE = 10

const GLYPH: Record<ContextCategoryKind, string> = {
  used: '█',
  buffer: '▒',
  free: '░',
  deferred: '',
}

export type GaugeRun = { glyph: string; length: number; color: string; dim: boolean }
export type LegendItem = { name: string; tokens: string; color: string }
export type ManaLevel = 'ok' | 'low' | 'critical'
export type ContextGauge = {
  prefix: string
  // The frame's full width, borders included.
  width: number
  status: string
  runs: GaugeRun[]
  suffix: string
  percentColor: string
  legend: LegendItem[]
  // The legend broken into rows that fit the band, each item whole.
  legendRows: LegendItem[][]
}

const LEGEND_GAP = 2

const itemWidth = (item: LegendItem): number => [...`■ ${item.name} ${item.tokens}`].length

// Greedy rows from the left edge; an item wider than a row gets one to itself.
export const wrapLegend = (items: readonly LegendItem[], available: number): LegendItem[][] => {
  const room = Math.max(1, available)
  const rows: LegendItem[][] = []
  let row: LegendItem[] = []
  let used = 0
  for (const item of items) {
    const width = itemWidth(item)
    const needed = row.length === 0 ? width : used + LEGEND_GAP + width
    if (row.length > 0 && needed > room) {
      rows.push(row)
      row = [item]
      used = width
    } else {
      row.push(item)
      used = needed
    }
  }
  if (row.length > 0) rows.push(row)
  return rows
}

// Green while roomy, amber as it nears its limit, red just short of it. The
// limit is where auto-compaction runs, or the full window when it is off.
export const manaLevel = (info: Pick<ContextInfo, 'percent' | 'max' | 'compactAt'>): ManaLevel => {
  const limit = info.compactAt !== undefined && info.max > 0 ? (info.compactAt / info.max) * 100 : 100
  if (info.percent >= limit - 10) return 'critical'
  if (info.percent >= limit - 25) return 'low'
  return 'ok'
}

const LEVEL_COLOR: Record<ManaLevel, string> = { ok: '#5ad27a', low: '#ffd23c', critical: '#ff5f5f' }
const LEVEL_STATUS: Record<ManaLevel, string> = { ok: 'STABLE', low: 'LOW MP', critical: 'DANGER' }

export const percentColor = (info: Pick<ContextInfo, 'percent' | 'max' | 'compactAt'>): string =>
  LEVEL_COLOR[manaLevel(info)]

// Cells per slice by largest remainder, so the runs fill the gauge exactly and
// every non-empty slice keeps at least one cell.
export const allocateCells = (slices: readonly ContextInfo['slices'][number][], width: number): number[] => {
  const total = slices.reduce((sum, s) => sum + s.tokens, 0)
  // Negated so a NaN total bails too: no slice would take a cell and the loop below would never end.
  if (!(total > 0) || width <= 0) return slices.map(() => 0)
  const exact = slices.map(s => (s.tokens / total) * width)
  const cells = exact.map((x, at) => ((slices[at]?.tokens ?? 0) > 0 ? Math.max(1, Math.floor(x)) : 0))
  let left = width - cells.reduce((sum, n) => sum + n, 0)
  const order = exact.map((x, at) => ({ at, rest: x - Math.floor(x) })).sort((a, b) => b.rest - a.rest)
  for (let i = 0; left > 0 && order.length > 0; i = (i + 1) % order.length) {
    const at = order[i]?.at ?? 0
    if ((slices[at]?.tokens ?? 0) > 0) {
      cells[at] = (cells[at] ?? 0) + 1
      left -= 1
    }
  }
  // Minimums can overshoot on a narrow gauge: take back from the largest.
  while (left < 0) {
    const big = cells.indexOf(Math.max(...cells))
    cells[big] = (cells[big] ?? 0) - 1
    left += 1
  }
  return cells
}

// `framed` lays out the terminal status window; without it, the plain one-line
// gauge (prefix, bar, suffix) and its legend span the whole band.
export const layoutGauge = (info: ContextInfo, columns: number, framed = true): ContextGauge | undefined => {
  const slices = info.slices.filter(s => s.kind !== 'deferred')
  if (slices.length === 0 || info.max <= 0) return undefined
  const suffix = ` ${info.percent}% ${formatTokens(info.total)}/${formatTokens(info.max)}`
  const frameWidth = columns - RIGHT_MARGIN
  const inner = framed ? frameWidth - SIDE * 2 : frameWidth
  const lead = framed ? CTX_LABEL : PREFIX
  const width = inner - [...lead].length - OPEN.length - CLOSE.length - [...suffix].length
  if (width < MIN_GAUGE) return undefined
  const cells = allocateCells(slices, width)
  const runs: GaugeRun[] = []
  slices.forEach((s, at) => {
    const length = cells[at] ?? 0
    if (length > 0) runs.push({ glyph: GLYPH[s.kind], length, color: s.color, dim: s.kind === 'free' })
  })
  const legend = slices
    .filter(s => s.kind === 'used' && s.tokens > 0)
    .map(s => ({ name: s.name, tokens: formatTokens(s.tokens), color: s.color }))
  const level = manaLevel(info)
  return {
    prefix: PREFIX,
    width: frameWidth,
    status: LEVEL_STATUS[level],
    runs,
    suffix,
    percentColor: LEVEL_COLOR[level],
    legend,
    legendRows: wrapLegend(legend, inner),
  }
}

// The frame's inner width, between '│ ' and ' │'.
export const innerWidth = (gauge: ContextGauge): number => gauge.width - SIDE * 2

// Dashes between the title and the status tag: '╭─ ' title ' ' fill ' ' status ' ─╮'.
export const topFill = (gauge: ContextGauge): number =>
  Math.max(1, gauge.width - 8 - [...TITLE].length - [...gauge.status].length)

// The plain-text gauge, for surfaces without colour runs and for tests.
export const gaugeLine = (gauge: ContextGauge): string =>
  `${gauge.prefix}${OPEN}${gauge.runs.map(r => r.glyph.repeat(r.length)).join('')}${CLOSE}${gauge.suffix}`

export const legendLines = (gauge: ContextGauge): string[] =>
  gauge.legendRows.map(row => row.map(item => `■ ${item.name} ${item.tokens}`).join(' '.repeat(LEGEND_GAP)))

// The whole status window as plain text, every row exactly the frame's width.
export const frameLines = (gauge: ContextGauge): string[] => {
  const { tl, tr, bl, br, h, v } = FRAME
  const inner = innerWidth(gauge)
  const bar = gauge.runs.map(r => r.glyph.repeat(r.length)).join('')
  const pad = (text: string) => text + ' '.repeat(Math.max(0, inner - [...text].length))
  return [
    `${tl}${h} ${TITLE} ${h.repeat(topFill(gauge))} ${gauge.status} ${h}${tr}`,
    `${v} ${CTX_LABEL}${OPEN}${bar}${CLOSE}${gauge.suffix} ${v}`,
    ...legendLines(gauge).map(line => `${v} ${pad(line)} ${v}`),
    `${bl}${h.repeat(gauge.width - 2)}${br}`,
  ]
}
