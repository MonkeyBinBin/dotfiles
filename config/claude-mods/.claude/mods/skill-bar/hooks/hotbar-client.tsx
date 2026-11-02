import type { ClientModule } from 'claude-code'

import { PANEL, toHex } from './colors'

export type HotbarSlot = {
  // The skill's full name, what a cast fills the prompt with.
  name: string
  // What the slot shows: the name past any `plugin:` prefix.
  label: string
  // The rune on the slot's keycap: the label's first letter or digit no slot before it took.
  rune: string
  // The slot's own colour, its cell at rest and under the pointer, and its keycap's flash when ready again, as hex.
  color: string
  tint: string
  glow: string
  flash: string
  // A favourite (a most-used skill, not the project's own): a divider before the first, its use count beside it.
  isFavorite?: boolean
  isFirstFavorite?: boolean
  uses?: number
}

export type HotbarProps = { slots: HotbarSlot[] }

type HotbarState = {
  tick: number
  // The slot under the pointer.
  hover?: number
  // The slot held down under the pointer, before the release casts it.
  pressed?: number
  // The slot just cast and the tick its cooldown began.
  cast?: { index: number; start: number }
  // The slot just cooled and the tick it came back: its keycap flashes and its sparks pop.
  ready?: { index: number; start: number }
}

const FRAME_MS = 80
// How long a cast slot cools down, dark to lit, left to right.
export const COOLDOWN_TICKS = 15
// The burst of sparks a cast throws, one glyph a tick at the start of its cooldown.
export const BURST = ['·', '✦', '✧'] as const
// How long a slot's ready pop lasts once it cools.
export const READY_TICKS = 3
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
export const INK = toHex(PANEL)
export const COOLING = '#2a2533'
// Before the first favourite: the divider and a space.
const LEAD = 2
// The width laid out before the first layout reports the region's.
const FALLBACK_COLUMNS = 80

// `name` past its `plugin:` prefix, cut to fit a slot.
export const labelOf = (name: string): string => {
  const bare = name.slice(name.lastIndexOf(':') + 1)
  return bare.length > MAX_LABEL ? `${bare.slice(0, MAX_LABEL - 1)}…` : bare
}

export const runeOf = (label: string): string => (label.match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase()

// A rune per label, none twice on the bar: the first letter or digit of each not taken yet, else a free digit.
export const runesOf = (labels: readonly string[]): string[] => {
  const taken = new Set<string>()
  return labels.map(label => {
    const own = [...label.toUpperCase()].filter(ch => /[A-Z0-9]/.test(ch))
    const rune = [...own, ...'1234567890'].find(ch => !taken.has(ch)) ?? runeOf(label)
    taken.add(rune)
    return rune
  })
}

// The use count beside a favourite's label.
export const usesText = (slot: Pick<HotbarSlot, 'uses'>): string => (slot.uses === undefined ? '' : ` ×${slot.uses}`)

// Columns before the slot's spark: the divider ahead of the first favourite.
export const slotLead = (slot: Pick<HotbarSlot, 'isFirstFavorite'>): number => (slot.isFirstFavorite ? LEAD : 0)

export const slotWidth = (slot: Pick<HotbarSlot, 'label' | 'uses' | 'isFirstFavorite'>): number =>
  slotLead(slot) + slot.label.length + usesText(slot).length + CHROME

// The cell's text while it cools, split at the sweep: what has come back, the sweep's front char, what still cools.
export const cooldownParts = (text: string, elapsed: number): { lit: string; edge: string; cool: string } => {
  const chars = [...text]
  const at = Math.min(chars.length, Math.floor((elapsed / COOLDOWN_TICKS) * chars.length))
  return { lit: chars.slice(0, at).join(''), edge: chars[at] ?? '', cool: chars.slice(at + 1).join('') }
}

// The sparks beside a slot: a burst as it is cast, a pop as it comes back, a twinkle under the pointer.
export const sparkOf = (state: Pick<HotbarState, 'tick' | 'hover' | 'pressed' | 'cast' | 'ready'>, index: number): string => {
  if (state.cast?.index === index) return BURST[state.tick - state.cast.start] ?? ' '
  if (state.ready?.index === index) return '✦'
  if (state.hover === index && state.pressed === undefined) return Math.floor(state.tick / TWINKLE_TICKS) % 2 === 0 ? '✦' : '✧'
  return ' '
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
      // Only a cooldown, a ready pop or a hovered slot's sparks move; at rest nothing redraws.
      if (now === undefined || (now.cast === undefined && now.ready === undefined && now.hover === undefined)) return
      // Sparks alone change once a twinkle: skip the frames between, then step the clock a whole twinkle.
      if (now.cast === undefined && now.ready === undefined) {
        idle += 1
        if (idle < TWINKLE_TICKS) return
        idle = 0
        surface.setState({ ...now, tick: now.tick + TWINKLE_TICKS })
        return
      }
      const tick = now.tick + 1
      // A cooled slot pops as ready for a few ticks, then rests.
      const isCool = now.cast !== undefined && tick - now.cast.start >= COOLDOWN_TICKS
      const ready = isCool && now.cast !== undefined ? { index: now.cast.index, start: tick } : now.ready
      const isRested = ready !== undefined && tick - ready.start >= READY_TICKS
      surface.setState({ ...now, tick, cast: isCool ? undefined : now.cast, ready: isRested ? undefined : ready })
    })
    surface.setState({ tick: 0 })
  }
  const state = surface.state ?? { tick: 0 }
  const widths = props.slots.map(slotWidth)
  const lines = hotbarLines(widths, surface.columns > 0 ? surface.columns : FALLBACK_COLUMNS)

  const cast = (index: number) => {
    const slot = props.slots[index]
    if (slot === undefined) return
    surface.setState({ ...state, pressed: undefined, ready: state.ready?.index === index ? undefined : state.ready, cast: { index, start: state.tick } })
    surface.post({ cast: slot.name })
  }

  // The divider ahead of the first favourite is not part of its hit area.
  const slotAt = (x: number, y: number): number | undefined =>
    lines[Math.floor(y / SLOT_ROWS)]?.find(one => {
      const slot = props.slots[one.index]
      const from = one.x + (slot === undefined ? 0 : slotLead(slot))
      return x >= from && x < one.x + (widths[one.index] ?? 0)
    })?.index

  surface.onPointer(e => {
    const index = e.type === 'leave' ? undefined : slotAt(e.x, e.y)
    if (e.type === 'up' && e.button === 'left' && index !== undefined) return cast(index)
    // A press sinks the keycap until the release; a release off the bar lets it back up.
    if (e.type === 'down' && e.button === 'left') return surface.setState({ ...state, hover: index, pressed: index })
    if (e.type === 'up' && state.pressed !== undefined) return surface.setState({ ...state, hover: index, pressed: undefined })
    if (state.hover !== index && e.type !== 'down') surface.setState({ ...state, hover: index })
  })

  const drawSlot = (slot: HotbarSlot, index: number) => {
    const elapsed = state.cast?.index === index ? state.tick - state.cast.start : undefined
    const isCooling = elapsed !== undefined
    const isPressed = !isCooling && state.pressed === index
    const isReady = !isCooling && !isPressed && state.ready?.index === index
    const isHover = !isCooling && !isPressed && state.hover === index
    const spark = sparkOf(state, index)
    const cap = isCooling ? COOLING : isPressed ? INK : isReady ? slot.flash : slot.color
    const cell = isCooling || isPressed ? COOLING : isHover || isReady ? slot.glow : slot.tint
    const label = ` ${slot.label}`
    const uses = `${usesText(slot)} `

    const body = () => {
      // The text stays readable while it cools: the cell behind it sweeps back, its front a soft glow.
      if (elapsed !== undefined) {
        const parts = cooldownParts(label + uses, elapsed)
        return [
          <Text key="lit" color="white" backgroundColor={slot.tint}>
            {parts.lit}
          </Text>,
          <Text key="edge" bold color={slot.color} backgroundColor={slot.glow}>
            {parts.edge}
          </Text>,
          <Text key="cool" dimColor color={slot.color} backgroundColor={COOLING}>
            {parts.cool}
          </Text>,
        ]
      }
      const isLit = isHover || isReady
      return [
        <Text key="label" bold={isLit} color={isPressed ? slot.color : isLit ? (isReady ? 'white' : slot.color) : 'white'} backgroundColor={cell}>
          {label}
        </Text>,
        <Text key="uses" dimColor color={isLit ? slot.color : 'white'} backgroundColor={cell}>
          {uses}
        </Text>,
      ]
    }

    return (
      <Box key={slot.name} flexDirection="row" width={widths[index] ?? 0} height={1}>
        {slot.isFirstFavorite ? <Text dimColor>{'│ '}</Text> : null}
        <Text color={slot.color}>{spark}</Text>
        <Text color={cap}>▐</Text>
        <Text bold color={isCooling || isPressed ? slot.color : INK} backgroundColor={cap}>
          {slot.rune}
        </Text>
        <Text color={cap} backgroundColor={cell}>
          ▌
        </Text>
        {body()}
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
