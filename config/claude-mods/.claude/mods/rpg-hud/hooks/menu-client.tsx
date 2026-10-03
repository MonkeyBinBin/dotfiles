import type { ClientModule } from 'claude-code'

import type { TextCell } from './menu'
import { SCROLL_DOWN_KEY, SCROLL_UP_KEY } from './window'

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
  // The card's hover group: the frame, the label and these pixels light together while the pointer is anywhere
  // on the card, the surface's own hover, so nothing stays lit when the pointer leaves.
  scope: string
}

type IconState = {
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
  let state = surface.state ?? {}
  // Once the plugin's active tab moves off the one the pick was made from (the pick landed, or another card,
  // a label button or a command moved it), the pick is spent: kept, a later return to that tab would show it again.
  if (state.picked !== undefined && state.picked.from !== props.active) {
    state = { ...state, picked: undefined }
    surface.setState(state)
  }
  const active = state.picked !== undefined ? state.picked.id : props.active
  const isActive = props.id === active
  const activeIndex = Math.max(0, props.ids.indexOf(active))

  const pick = (id: string | undefined) => {
    if (id === undefined || (id === active && props.isHelpOpen !== true)) return
    surface.setState({ ...state, picked: { id, from: props.active } })
    surface.post({ select: id })
  }

  surface.onPointer(e => {
    if (e.type === 'up' && e.button === 'left') pick(props.id)
  })

  // The number keys pick their slot, ? toggles the help page, j and k scroll the window, any other letter goes
  // on to the skills page, and the left and right arrows step along. Tab is left alone: it walks the pane's buttons, as the help page says.
  surface.onKey(e => {
    const count = props.ids.length
    const numbered = props.ids.findIndex((_, index) => slotKey(index) === e.key)
    if (numbered >= 0) return pick(props.ids[numbered])
    if (e.key === '?') return surface.post({ help: true })
    // j and k, or the up and down arrows, scroll the window under the menu.
    if (e.key === SCROLL_DOWN_KEY || e.key === 'down') return surface.post({ scroll: 1 })
    if (e.key === SCROLL_UP_KEY || e.key === 'up') return surface.post({ scroll: -1 })
    // Another letter is a skill's key on the skills page, whose buttons hear no keys while this Client holds them.
    if (/^[a-z]$/.test(e.key)) return surface.post({ letter: e.key })
    if (e.key === 'right') pick(props.ids[(activeIndex + 1) % count])
    if (e.key === 'left') pick(props.ids[(activeIndex + count - 1) % count])
  })

  // The pixels centred in the frame: bright on the selected card; dim on the others, bright while their card
  // is hovered.
  return (
    <Box flexDirection="column" width={props.width}>
      {props.dimIcon.map((dimCells, y) => {
        const room = Math.max(0, props.width - dimCells.length)
        const left = Math.floor(room / 2)
        return (
          <Box key={`row-${y}`} flexDirection="row" height={1}>
            <Text>{' '.repeat(left)}</Text>
            {dimCells.map((dim, x) => {
              const bright = props.icon[y]?.[x] ?? dim
              const [glyph, color, background] = isActive ? bright : dim
              const [, brightColor, brightBackground] = bright
              const lit = {
                scope: props.scope,
                ...(brightColor === null ? {} : { color: brightColor }),
                ...(brightBackground === null ? {} : { backgroundColor: brightBackground }),
              }
              return (
                <Text
                  key={`c${x}`}
                  {...(color === null ? {} : { color })}
                  {...(background === null ? {} : { backgroundColor: background })}
                  {...(isActive ? {} : { hover: lit })}
                >
                  {glyph}
                </Text>
              )
            })}
            <Text>{' '.repeat(room - left)}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

export default MenuIcon
