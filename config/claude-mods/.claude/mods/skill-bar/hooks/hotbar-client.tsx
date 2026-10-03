import type { ClientModule } from 'claude-code'

export type HotbarSlot = {
  // The skill's full name, what a cast fills the prompt with.
  name: string
  // What the slot shows: the name past any `plugin:` prefix.
  label: string
  // The slot's own colour, as hex.
  color: string
  uses: number
  isFavorite: boolean
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
// A slot is three rows: its frame's top, the icon and label, the frame's bottom.
export const SLOT_ROWS = 3
const GAP = 1
// Every slot's icon: an emoji draws more than a few pixel blocks could. Two columns wide.
export const ICON = '⚡'
const ICON_COLUMNS = 2
// The longest label a slot shows whole.
const MAX_LABEL = 18
// The frames around a slot: border, padding, icon, space, label, padding, border.
const CHROME = 1 + 1 + ICON_COLUMNS + 1 + 1 + 1
// The flash's backdrop, as the rpg-hud menu's selected card.
const CARD = '#2a2342'
// The width laid out before the first layout reports the region's.
const FALLBACK_COLUMNS = 80

// The number key that casts a slot: 1–9, then 0 for the tenth; none past it.
export const hotkeyOf = (index: number): string | undefined => (index < 9 ? String(index + 1) : index === 9 ? '0' : undefined)

// The tag on a slot's bottom edge: a star for a favourite, then how often it was cast.
export const badgeOf = (slot: Pick<HotbarSlot, 'uses' | 'isFavorite'>): string =>
  [slot.isFavorite ? '★' : '', slot.uses > 0 ? `×${slot.uses}` : ''].filter(part => part !== '').join(' ')

// `name` past its `plugin:` prefix, cut to fit a slot.
export const labelOf = (name: string): string => {
  const bare = name.slice(name.lastIndexOf(':') + 1)
  return bare.length > MAX_LABEL ? `${bare.slice(0, MAX_LABEL - 1)}…` : bare
}

// The label's columns: the label, or more when the badge needs it. The bottom edge holds ` badge ` with at least
// one rule before it and `─╯` after: badge + 5 columns against the label's + 7 across the slot.
const labelWidth = (slot: Pick<HotbarSlot, 'label' | 'uses' | 'isFavorite'>) => {
  const badge = badgeOf(slot)
  return Math.max(slot.label.length, badge === '' ? 0 : badge.length - 1)
}

export const slotWidth = (slot: Pick<HotbarSlot, 'label' | 'uses' | 'isFavorite'>): number => labelWidth(slot) + CHROME

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

  // Once a click has given the bar the focus, the number keys cast as a game's hotbar does.
  surface.onKey(e => {
    const index = props.slots.findIndex((_, at) => hotkeyOf(at) === e.key)
    if (index >= 0) cast(index)
  })

  const drawSlot = (slot: HotbarSlot, index: number) => {
    const width = widths[index] ?? 0
    const inner = width - 2
    const isFlash = state.cast?.index === index
    const isHover = !isFlash && state.hover === index
    const frame = isFlash ? 'yellow' : isHover ? slot.color : 'gray'
    const isFrameDim = !isFlash && !isHover
    const key = hotkeyOf(index)
    const badge = badgeOf(slot)
    const badgeText = badge === '' ? '' : ` ${badge} `
    const back = isFlash ? { backgroundColor: CARD } : {}
    const label = slot.label.padEnd(labelWidth(slot))

    return (
      <Box key={slot.name} flexDirection="column" width={width}>
        <Text>
          <Text color={frame} dimColor={isFrameDim}>
            ╭─
          </Text>
          {key === undefined ? (
            <Text color={frame} dimColor={isFrameDim}>
              ─
            </Text>
          ) : (
            <Text bold color={isFlash ? 'yellow' : isHover ? slot.color : 'white'}>
              {key}
            </Text>
          )}
          <Text color={frame} dimColor={isFrameDim}>
            {'─'.repeat(Math.max(0, inner - 2))}╮
          </Text>
        </Text>
        <Box flexDirection="row" height={1}>
          <Text color={frame} dimColor={isFrameDim}>
            │
          </Text>
          <Text {...back}> </Text>
          <Text {...back}>{ICON}</Text>
          <Text {...back}> </Text>
          <Text bold={!isFrameDim} color={isFlash ? 'yellow' : isHover ? slot.color : 'white'} dimColor={isFrameDim} {...back}>
            {label}
          </Text>
          <Text {...back}> </Text>
          <Text color={frame} dimColor={isFrameDim}>
            │
          </Text>
        </Box>
        <Text>
          <Text color={frame} dimColor={isFrameDim}>
            ╰{'─'.repeat(Math.max(0, inner - badgeText.length - 1))}
          </Text>
          <Text color={slot.isFavorite ? 'yellow' : frame} dimColor={isFrameDim}>
            {badgeText}
          </Text>
          <Text color={frame} dimColor={isFrameDim}>
            ─╯
          </Text>
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
