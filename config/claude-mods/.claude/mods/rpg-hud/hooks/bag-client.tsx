import type { ClientModule } from 'claude-code'

import type { BagItem } from '../types'
import { STATUS_GLYPHS, rarityOf, splitBar } from './diff'

export type BagRow = { kind: 'back' } | { kind: 'item'; item: BagItem } | { kind: 'note'; text: string }

export type BagProps = {
  // The rows the window shows, already scrolled.
  rows: BagRow[]
  width: number
}

type BagState = { tick: number; hover?: number }

const FRAME_MS = 320
const CURSOR = 2
const GLYPH = 2
const BAR = 8
// ` +1234 −567` after the bar.
const STATS = 12

let latest: BagProps = { rows: [], width: 0 }

const fit = (text: string, width: number): string =>
  text.length > width ? `…${text.slice(text.length - Math.max(0, width - 1))}` : text.padEnd(width)

// The bag of unsaved changes: a click on an item inspects its diff, one on the first row goes back to the map.
// Up and down walk the rows once a click gave the bag the focus; Enter opens, left or backspace goes back.
const Bag: ClientModule<BagProps, BagState> = (props, surface) => {
  const { Box, Text } = surface.elements
  latest = props
  if (surface.state === undefined) {
    // The cursor blinks on the hovered row; nothing redraws while nothing is hovered.
    surface.every(FRAME_MS, () => {
      const now = surface.state ?? { tick: 0 }
      if (now.hover !== undefined && now.hover < latest.rows.length) surface.setState({ ...now, tick: now.tick + 1 })
    })
    surface.setState({ tick: 0 })
  }
  const state = surface.state ?? { tick: 0 }
  const pathWidth = Math.max(6, props.width - CURSOR - GLYPH - BAR - STATS)
  const isPickable = (index: number) => props.rows[index]?.kind === 'item' || props.rows[index]?.kind === 'back'

  const open = (index: number) => {
    const row = props.rows[index]
    if (row?.kind === 'back') surface.post({ back: true })
    if (row?.kind === 'item') surface.post({ inspect: row.item.path })
  }

  surface.onPointer(e => {
    const index = e.y >= 0 && e.y < props.rows.length && e.x >= 0 && e.x < props.width ? e.y : undefined
    const hover = index !== undefined && isPickable(index) ? index : undefined
    if (e.type === 'up' && e.button === 'left' && hover !== undefined) return open(hover)
    if (e.type === 'leave') return state.hover === undefined ? undefined : surface.setState({ ...state, hover: undefined })
    if (e.type === 'move' && state.hover !== hover) surface.setState({ ...state, hover })
  })

  surface.onKey(e => {
    const pickable = props.rows.flatMap((_, index) => (isPickable(index) ? [index] : []))
    if (pickable.length === 0) return
    const at = state.hover === undefined ? -1 : pickable.indexOf(state.hover)
    if (e.key === 'down') surface.setState({ ...state, hover: pickable[(at + 1) % pickable.length] })
    if (e.key === 'up') surface.setState({ ...state, hover: pickable[(at - 1 + pickable.length) % pickable.length] })
    if (e.key === 'return' && state.hover !== undefined) open(state.hover)
    if (e.key === 'left' || e.key === 'backspace') surface.post({ back: true })
  })

  const cursor = (isHover: boolean) => (isHover ? (state.tick % 2 === 0 ? '▶ ' : '▷ ') : '  ')

  return (
    <Box flexDirection="column" width={props.width}>
      {props.rows.map((row, index) => {
        const isHover = state.hover === index
        if (row.kind === 'back') {
          return (
            <Text key="back" color={isHover ? 'yellow' : 'cyan'} bold={isHover}>
              {cursor(isHover)}◂ back to the map
            </Text>
          )
        }
        if (row.kind === 'note') {
          return (
            <Text key={`note-${index}`} dimColor>
              {row.text}
            </Text>
          )
        }
        const { item } = row
        const rarity = rarityOf(item.added + item.removed)
        const { plus, minus } = splitBar(item.added, item.removed, BAR)
        const stats = item.isBinary
          ? ' binary'
          : item.status === '?' && item.added === 0
            ? ' new'
            : ` +${item.added} −${item.removed}`
        return (
          <Box key={`item-${item.path}`} flexDirection="row" height={1}>
            <Text color="yellow">{cursor(isHover)}</Text>
            <Text color={rarity.color} bold>
              {(STATUS_GLYPHS[item.status] ?? '✎') + ' '}
            </Text>
            <Text color={isHover ? 'yellow' : rarity.color === 'white' ? undefined : rarity.color} bold={isHover}>
              {fit(item.path, pathWidth)}
            </Text>
            <Text color="green">{'▮'.repeat(plus)}</Text>
            <Text color="red">{'▮'.repeat(minus)}</Text>
            <Text dimColor>{'·'.repeat(BAR - plus - minus)}</Text>
            <Text color={isHover ? 'yellow' : undefined} dimColor={!isHover}>
              {fit(isHover ? ' ⏎ inspect' : stats, STATS)}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

export default Bag
