import type { ClientModule } from 'claude-code'

import type { BagItem } from '../types'
import { STATUS_GLYPHS, rarityOf, splitBar } from './diff'
import { fit, fitTail, pickList } from './pick-list'
import type { PickState } from './pick-list'

// `label` names where back leads: the map, or the outposts for a bag opened from them.
export type BagRow = { kind: 'back'; label?: string } | { kind: 'item'; item: BagItem } | { kind: 'note'; text: string }

export type BagProps = {
  // The rows the window shows, already scrolled.
  rows: BagRow[]
  width: number
}

const CURSOR = 2
const GLYPH = 2
const BAR = 8
// ` +1234 −567` after the bar.
const STATS = 12

// The bag of unsaved changes: a click on an item inspects its diff, one on the first row goes back.
const Bag: ClientModule<BagProps, PickState> = (props, surface) => {
  const { Box, Text } = surface.elements
  const { state, cursor } = pickList(surface, {
    rows: props.rows,
    width: props.width,
    isPickable: row => row.kind !== 'note',
    open: row => {
      if (row.kind === 'back') surface.post({ back: true })
      if (row.kind === 'item') surface.post({ inspect: row.item.path })
    },
    back: () => surface.post({ back: true }),
  })
  const pathWidth = Math.max(6, props.width - CURSOR - GLYPH - BAR - STATS)

  return (
    <Box flexDirection="column" width={props.width}>
      {props.rows.map((row, index) => {
        const isHover = state.hover === index
        if (row.kind === 'back') {
          return (
            <Text key="back" color={isHover ? 'yellow' : 'cyan'} bold={isHover}>
              {cursor(isHover)}◂ back to {row.label ?? 'the map'}
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
              {fitTail(item.path, pathWidth)}
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
