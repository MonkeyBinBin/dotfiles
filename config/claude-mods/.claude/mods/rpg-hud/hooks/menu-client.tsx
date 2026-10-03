import type { ClientModule } from 'claude-code'

import type { TextCell } from './menu'

// One menu card's icon: the plugin draws the card's frame and label button around it, and this Client takes
// the clicks on the icon and the keys once a click has given it the focus.
export type MenuIconProps = {
  id: string
  // Every slot's id in order, for the number and arrow keys.
  ids: string[]
  active: string
  // Whether the help page covers the window: a pick, even of the active tab, then closes it.
  isHelpOpen?: boolean
  icon: TextCell[][]
  dimIcon: TextCell[][]
  // The columns inside the card's frame, which the icon is centred in.
  width: number
}

type IconState = {
  isHover?: boolean
  // A pick shows at once; the plugin's redraw confirms it.
  picked?: { id: string; from: string }
}

// Every card's width: one share of `width`, narrowed by a column when that would leave the icon an odd
// number of columns to sit in, so it always sits dead centre inside the frame. Leftover columns go between
// the cards.
export const cardWidth = (width: number, count: number, iconColumns: number): number => {
  const share = Math.floor(Math.max(count, width) / count)
  return (share - 2 - iconColumns) % 2 === 0 ? share : share - 1
}

// The key that picks a slot: its number, 1 for the first.
export const slotKey = (index: number): string => String(index + 1)

const MenuIcon: ClientModule<MenuIconProps, IconState> = (props, surface) => {
  const { Box, Text } = surface.elements
  const state = surface.state ?? {}
  const active = state.picked !== undefined && state.picked.from === props.active ? state.picked.id : props.active
  const isActive = props.id === active
  const activeIndex = Math.max(0, props.ids.indexOf(active))

  const pick = (id: string | undefined) => {
    if (id === undefined || (id === active && props.isHelpOpen !== true)) return
    surface.setState({ ...state, picked: { id, from: props.active } })
    surface.post({ select: id })
  }

  surface.onPointer(e => {
    if (e.type === 'up' && e.button === 'left') return pick(props.id)
    const isHover = e.type !== 'leave'
    if (state.isHover !== isHover && e.type !== 'down') surface.setState({ ...state, isHover })
  })

  // The number keys pick their slot, ? toggles the help page, and the arrows and tab step along.
  surface.onKey(e => {
    const count = props.ids.length
    const numbered = props.ids.findIndex((_, index) => slotKey(index) === e.key)
    if (numbered >= 0) return pick(props.ids[numbered])
    if (e.key === '?') return surface.post({ help: true })
    if (e.key === 'right' || e.key === 'tab') pick(props.ids[(activeIndex + 1) % count])
    if (e.key === 'left') pick(props.ids[(activeIndex + count - 1) % count])
  })

  // The pixels centred in the frame, bright on the selected or hovered card.
  const rows = isActive || state.isHover === true ? props.icon : props.dimIcon
  return (
    <Box flexDirection="column" width={props.width}>
      {rows.map((cells, y) => {
        const room = Math.max(0, props.width - cells.length)
        const left = Math.floor(room / 2)
        return (
          <Box key={`row-${y}`} flexDirection="row" height={1}>
            <Text>{' '.repeat(left)}</Text>
            {cells.map(([glyph, color, background], x) => (
              <Text key={`c${x}`} {...(color === null ? {} : { color })} {...(background === null ? {} : { backgroundColor: background })}>
                {glyph}
              </Text>
            ))}
            <Text>{' '.repeat(room - left)}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

export default MenuIcon
