import type { ClientModule } from 'claude-code'

import { PANEL, toHex } from './colors'

export type HotbarSlot = {
  // The skill's full name, what a cast fills the prompt with.
  name: string
  // What the slot shows: the name past any `plugin:` prefix.
  label: string
  // The rune on the slot's keycap: the label's first letter or digit.
  rune: string
  // The slot's own colour, and its cell at rest and under the pointer, as hex.
  color: string
  tint: string
  glow: string
}

export type HotbarProps = { slots: HotbarSlot[] }

type HotbarState = {
  tick: number
  // The slot under the pointer.
  hover?: number
  // The slot just cast and the tick its cooldown began.
  cast?: { index: number; start: number }
}

const FRAME_MS = 80
// How long a cast slot cools down, dark to lit, left to right.
export const COOLDOWN_TICKS = 15
// Ticks between the hover sparks' twinkles.
const TWINKLE_TICKS = 4
// A slot is one row: `✦▐C▌ label ✦`, the sparks lit only under the pointer.
export const SLOT_ROWS = 1
const GAP = 2
// The longest label a slot shows whole.
const MAX_LABEL = 18
// Around the label: spark, keycap (▐ rune ▌), space, space, spark.
const CHROME = 1 + 3 + 1 + 1 + 1
// The rune's ink on its coloured keycap, and the cooling cell's.
const INK = toHex(PANEL)
const COOLING = '#2a2533'
// The width laid out before the first layout reports the region's.
const FALLBACK_COLUMNS = 80

// `name` past its `plugin:` prefix, cut to fit a slot.
export const labelOf = (name: string): string => {
  const bare = name.slice(name.lastIndexOf(':') + 1)
  return bare.length > MAX_LABEL ? `${bare.slice(0, MAX_LABEL - 1)}…` : bare
}

export const runeOf = (label: string): string => (label.match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase()

export const slotWidth = (slot: Pick<HotbarSlot, 'label'>): number => slot.label.length + CHROME

// The cell's text while it cools: what has come back shows, the rest is shade, lightest at the sweep's front.
export const cooldownText = (text: string, elapsed: number): string => {
  const chars = [...text]
  const lit = Math.min(chars.length, Math.floor((elapsed / COOLDOWN_TICKS) * chars.length))
  return chars.map((ch, at) => (at < lit ? ch : at === lit ? '░' : at === lit + 1 ? '▒' : '▓')).join('')
}

// The slots in lines that fit `columns`: each line as many as fit, a slot wider than the whole bar alone on one.
export const hotbarLines = (widths: readonly number[], columns: number): { index: number; x: number }[][] => {
  const lines: { index: number; x: number }[][] = []
  let line: { index: number; x: number }[] = []
  let x = 0
  widths.forEach((width, index) => {
    if (line.length > 0 && x + width > columns) {
      lines.push(line)
      line = []
      x = 0
    }
    line.push({ index, x })
    x += width + GAP
  })
  if (line.length > 0) lines.push(line)
  return lines
}

const Hotbar: ClientModule<HotbarProps, HotbarState> = (props, surface) => {
  const { Box, Text } = surface.elements
  if (surface.state === undefined) {
    // Frames since the sparks last twinkled, while nothing cools.
    let idle = 0
    surface.every(FRAME_MS, () => {
      const now = surface.state
      // Only a cooldown or a hovered slot's sparks move; at rest nothing redraws.
      if (now === undefined || (now.cast === undefined && now.hover === undefined)) return
      // Sparks alone change once a twinkle: skip the frames between, then step the clock a whole twinkle.
      if (now.cast === undefined) {
        idle += 1
        if (idle < TWINKLE_TICKS) return
        idle = 0
        surface.setState({ ...now, tick: now.tick + TWINKLE_TICKS })
        return
      }
      const isCool = now.cast !== undefined && now.tick + 1 - now.cast.start >= COOLDOWN_TICKS
      surface.setState({ ...now, tick: now.tick + 1, ...(isCool ? { cast: undefined } : {}) })
    })
    surface.setState({ tick: 0 })
  }
  const state = surface.state ?? { tick: 0 }
  const widths = props.slots.map(slotWidth)
  const lines = hotbarLines(widths, surface.columns > 0 ? surface.columns : FALLBACK_COLUMNS)

  const cast = (index: number) => {
    const slot = props.slots[index]
    if (slot === undefined) return
    surface.setState({ ...state, cast: { index, start: state.tick } })
    surface.post({ cast: slot.name })
  }

  const slotAt = (x: number, y: number): number | undefined =>
    lines[Math.floor(y / SLOT_ROWS)]?.find(one => x >= one.x && x < one.x + (widths[one.index] ?? 0))?.index

  surface.onPointer(e => {
    const index = e.type === 'leave' ? undefined : slotAt(e.x, e.y)
    if (e.type === 'up' && e.button === 'left' && index !== undefined) return cast(index)
    if (state.hover !== index && e.type !== 'down') surface.setState({ ...state, hover: index })
  })

  const drawSlot = (slot: HotbarSlot, index: number) => {
    const elapsed = state.cast?.index === index ? state.tick - state.cast.start : undefined
    const isCooling = elapsed !== undefined
    const isHover = !isCooling && state.hover === index
    const spark = isHover ? (Math.floor(state.tick / TWINKLE_TICKS) % 2 === 0 ? '✦' : '✧') : ' '
    const cap = isCooling ? COOLING : slot.color
    const cell = isCooling ? COOLING : isHover ? slot.glow : slot.tint
    const text = ` ${slot.label} `

    return (
      <Box key={slot.name} flexDirection="row" width={widths[index] ?? 0} height={1}>
        <Text color={slot.color}>{spark}</Text>
        <Text color={cap}>▐</Text>
        <Text bold color={isCooling ? slot.color : INK} backgroundColor={cap}>
          {slot.rune}
        </Text>
        <Text color={cap} backgroundColor={cell}>
          ▌
        </Text>
        <Text bold={isHover} color={isCooling || isHover ? slot.color : 'white'} dimColor={isCooling} backgroundColor={cell}>
          {isCooling ? cooldownText(text, elapsed) : text}
        </Text>
        <Text color={slot.color}>{spark}</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {lines.map((line, at) => (
        <Box key={`line-${at}`} flexDirection="row" columnGap={GAP} height={SLOT_ROWS}>
          {line.map(one => {
            const slot = props.slots[one.index]
            return slot === undefined ? null : drawSlot(slot, one.index)
          })}
        </Box>
      ))}
    </Box>
  )
}

export default Hotbar
