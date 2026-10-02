import type { ClientModule } from 'claude-code'

import type { TextCell } from './menu'

export type MenuSlot = {
  id: string
  label: string
  color: string
  icon: TextCell[][]
  dimIcon: TextCell[][]
}

export type MenuProps = {
  active: string
  // `icons`: a framed hotbar with a pixel icon per slot; `line`: one row of labels.
  mode: 'icons' | 'line'
  // The whole bar's width: the pane's, so its edges line up with the panels above and below.
  width: number
  slots: MenuSlot[]
}

// The selected card's backdrop: a deep indigo that the gold and the bright icon stand out on.
const CARD = '#2a2342'

type MenuState = {
  hover?: number
  // A click shows its slot active at once; the plugin's redraw confirms it.
  picked?: { id: string; from: string }
}

// Each slot's width and first column: `count` borderless slots fill `width` exactly,
// the leftover columns going one each to the first slots.
export const slotLayout = (width: number, count: number) => {
  const inner = Math.max(count, width)
  const base = Math.floor(inner / count)
  const extra = inner - base * count
  const widths = Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0))
  let left = 0
  const starts = widths.map(slotWidth => {
    const start = left
    left += slotWidth
    return start
  })
  return { widths, starts }
}

// The slot under column `x`.
export const slotAt = (x: number, starts: readonly number[], width: number): number | undefined => {
  if (x < 0 || x >= width) return undefined
  let found = 0
  starts.forEach((start, index) => {
    if (x >= start) found = index
  })
  return found
}

// `text` centred in `width` columns, the odd column going right.
export const centre = (text: string, width: number): string => {
  const room = Math.max(0, width - text.length)
  const left = Math.floor(room / 2)
  return ' '.repeat(left) + text + ' '.repeat(room - left)
}

const Menu: ClientModule<MenuProps, MenuState> = (props, surface) => {
  const { Box, Text } = surface.elements
  const state = surface.state ?? {}
  const active = state.picked !== undefined && state.picked.from === props.active ? state.picked.id : props.active
  const activeIndex = Math.max(0, props.slots.findIndex(slot => slot.id === active))
  const { widths, starts } = slotLayout(props.width, props.slots.length)

  const pick = (index: number) => {
    const slot = props.slots[index]
    if (slot === undefined || slot.id === active) return
    surface.setState({ ...state, picked: { id: slot.id, from: props.active } })
    surface.post({ select: slot.id })
  }

  surface.onPointer(e => {
    const isInside = e.y >= 0 && (surface.rows === 0 || e.y < surface.rows)
    const index = isInside ? slotAt(e.x, starts, props.width) : undefined
    if (e.type === 'up' && e.button === 'left' && index !== undefined) return pick(index)
    if (e.type === 'leave') return state.hover === undefined ? undefined : surface.setState({ ...state, hover: undefined })
    if (e.type === 'move' && state.hover !== index) surface.setState({ ...state, hover: index })
  })

  surface.onKey(e => {
    const count = props.slots.length
    if (e.key === 'right' || e.key === 'tab') pick((activeIndex + 1) % count)
    if (e.key === 'left') pick((activeIndex + count - 1) % count)
  })

  // The selected slot is a card: a deep backdrop, gold corner brackets and a jewelled label.
  // A hovered one shows its brackets in its own colour; the rest are bare, their icons dimmed.
  const cardRow = (slot: MenuSlot, index: number, y: number, rows: number) => {
    const width = widths[index] ?? 0
    const isActive = slot.id === active
    const isHover = !isActive && state.hover === index
    const back = isActive ? { backgroundColor: CARD } : {}
    const accent = isActive ? 'yellow' : slot.color
    const key = `${slot.id}-${y}`

    // The top and bottom rows carry the brackets at the corners.
    if (y === 0 || y === rows - 1) {
      const isTop = y === 0
      if (!isActive && !isHover) return <Text key={key}>{' '.repeat(width)}</Text>
      const [left, right] = isTop ? ['╭─', '─╮'] : ['╰─', '─╯']
      return (
        <Text key={key} {...back}>
          <Text color={accent} bold={isActive} dimColor={isHover}>
            {left}
          </Text>
          {' '.repeat(Math.max(0, width - 4))}
          <Text color={accent} bold={isActive} dimColor={isHover}>
            {right}
          </Text>
        </Text>
      )
    }

    // The label row, just above the bottom brackets.
    if (y === rows - 2) {
      if (isActive) {
        return (
          <Text key={key} bold color="yellow" {...back}>
            {centre(`◆ ${slot.label.toUpperCase()} ◆`, width)}
          </Text>
        )
      }
      return (
        <Text key={key} color={isHover ? slot.color : 'gray'} bold={isHover}>
          {centre(slot.label.toUpperCase(), width)}
        </Text>
      )
    }

    // An icon row: the pixels centred, the backdrop filling the gaps and see-through pixels of the card.
    const cells = (isActive || isHover ? slot.icon : slot.dimIcon)[y - 1] ?? []
    const room = Math.max(0, width - cells.length)
    const left = Math.floor(room / 2)
    return (
      <Box key={key} flexDirection="row" height={1}>
        <Text {...back}>{' '.repeat(left)}</Text>
        {cells.map(([glyph, color, background], x) => {
          const behind = background ?? (isActive ? CARD : null)
          return (
            <Text key={`c${x}`} {...(color === null ? {} : { color })} {...(behind === null ? {} : { backgroundColor: behind })}>
              {glyph}
            </Text>
          )
        })}
        <Text {...back}>{' '.repeat(room - left)}</Text>
      </Box>
    )
  }

  if (props.mode === 'line') {
    return (
      <Box flexDirection="row" height={1}>
        {props.slots.map((slot, index) => {
          const width = widths[index] ?? 0
          if (slot.id === active) {
            return (
              <Text key={slot.id} bold color="yellow" backgroundColor={CARD}>
                {centre(`◆ ${slot.label} ◆`, width)}
              </Text>
            )
          }
          return (
            <Text key={slot.id} color={state.hover === index ? slot.color : 'gray'}>
              {centre(slot.label, width)}
            </Text>
          )
        })}
      </Box>
    )
  }

  // Brackets, the icon's rows, the label, brackets.
  const iconRows = props.slots[0]?.icon.length ?? 0
  const rows = iconRows + 3
  return (
    <Box flexDirection="row" width={props.width}>
      {props.slots.map((slot, index) => (
        <Box key={slot.id} flexDirection="column" width={widths[index] ?? 0}>
          {Array.from({ length: rows }, (_, y) => cardRow(slot, index, y, rows))}
        </Box>
      ))}
    </Box>
  )
}

export default Menu
