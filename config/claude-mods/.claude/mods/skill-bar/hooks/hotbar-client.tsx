import type { ClientModule } from 'claude-code'

export type HotbarSlot = {
  // The skill's full name, what a cast fills the prompt with.
  name: string
  // What the slot shows: the name past any `plugin:` prefix.
  label: string
  // The slot's own colour, as hex.
  color: string
}

export type HotbarProps = { slots: HotbarSlot[] }

type HotbarState = {
  tick: number
  // The slot under the pointer.
  hover?: number
  // The slot just cast and the tick its flash began.
  cast?: { index: number; start: number }
}

const FRAME_MS = 80
const FLASH_TICKS = 4
// A slot is one row: `▕ ⚡ label ▏`, its inside on a dark backdrop like a hotbar cell.
export const SLOT_ROWS = 1
const GAP = 1
// Every slot's icon: an emoji draws more than a few pixel blocks could. Two columns wide.
export const ICON = '⚡'
const ICON_COLUMNS = 2
// The longest label a slot shows whole.
const MAX_LABEL = 18
// Around the label: edge, padding, icon, space, padding, edge.
const CHROME = 1 + 1 + ICON_COLUMNS + 1 + 1 + 1
// The cell's backdrop at rest, under the pointer and while it flashes (the last as rpg-hud's selected card).
const CELL = '#1e1a2b'
const CELL_HOVER = '#2a2342'
const CELL_FLASH = '#3a2f5c'
// The width laid out before the first layout reports the region's.
const FALLBACK_COLUMNS = 80

// `name` past its `plugin:` prefix, cut to fit a slot.
export const labelOf = (name: string): string => {
  const bare = name.slice(name.lastIndexOf(':') + 1)
  return bare.length > MAX_LABEL ? `${bare.slice(0, MAX_LABEL - 1)}…` : bare
}

export const slotWidth = (slot: Pick<HotbarSlot, 'label'>): number => slot.label.length + CHROME

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
    surface.every(FRAME_MS, () => {
      const now = surface.state
      // Only a flash moves on the clock; at rest nothing redraws.
      if (now?.cast === undefined) return
      const isOver = now.tick + 1 - now.cast.start >= FLASH_TICKS
      surface.setState({ ...now, tick: now.tick + 1, ...(isOver ? { cast: undefined } : {}) })
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
    const isFlash = state.cast?.index === index
    const isHover = !isFlash && state.hover === index
    const edge = isFlash ? 'yellow' : isHover ? slot.color : 'gray'
    const isDim = !isFlash && !isHover
    const back = { backgroundColor: isFlash ? CELL_FLASH : isHover ? CELL_HOVER : CELL }

    return (
      <Box key={slot.name} flexDirection="row" width={widths[index] ?? 0} height={1}>
        <Text color={edge} dimColor={isDim}>
          ▕
        </Text>
        <Text {...back}> {ICON} </Text>
        <Text bold={!isDim} color={isFlash ? 'yellow' : isHover ? slot.color : 'white'} {...back}>
          {slot.label}
        </Text>
        <Text {...back}> </Text>
        <Text color={edge} dimColor={isDim}>
          ▏
        </Text>
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
