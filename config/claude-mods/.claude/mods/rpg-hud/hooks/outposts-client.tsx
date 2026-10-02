import type { ClientModule } from 'claude-code'

import type { Outpost } from '../types'
import { fit, pickList } from './pick-list'
import type { PickState } from './pick-list'

export type OutpostRow = { kind: 'back' } | { kind: 'outpost'; outpost: Outpost } | { kind: 'note'; text: string }

export type OutpostsProps = {
  // The rows the window shows, already scrolled.
  rows: OutpostRow[]
  width: number
}

// The cursor, the marker, the branch and the right-hand status columns.
const CURSOR = 2
const MARK = 3
const BRANCH = 16
const STATUS = 13
const AGE = 5

// Where the outpost stands: here, a lock, a ruin, or a plain camp.
export const markerOf = (outpost: Outpost): { glyph: string; color: string } => {
  if (outpost.isPrunable) return { glyph: '💀', color: 'gray' }
  if (outpost.isHere) return { glyph: '@ ', color: 'yellow' }
  if (outpost.isLocked) return { glyph: '🔒', color: 'cyan' }
  return { glyph: '⚑ ', color: 'green' }
}

// The worktrees as outposts: a click on one opens its bag, one on the first row goes back to the map.
// A ruin (prunable: its folder is gone) has nothing to open.
const Outposts: ClientModule<OutpostsProps, PickState> = (props, surface) => {
  const { Box, Text } = surface.elements
  const { state, cursor } = pickList(surface, {
    rows: props.rows,
    width: props.width,
    isPickable: row => row.kind === 'back' || (row.kind === 'outpost' && !row.outpost.isPrunable),
    open: row => {
      if (row.kind === 'back') surface.post({ back: true })
      if (row.kind === 'outpost') surface.post({ outpost: row.outpost.path })
    },
    back: () => surface.post({ back: true }),
  })
  const nameWidth = Math.max(6, props.width - CURSOR - MARK - BRANCH - STATUS - AGE)

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
        const { outpost } = row
        const marker = markerOf(outpost)
        const distance = `${outpost.ahead > 0 ? `↑${outpost.ahead}` : ''}${outpost.behind > 0 ? `↓${outpost.behind}` : ''}`
        let status = { text: outpost.dirty > 0 ? `⚠ ${outpost.dirty} unsaved` : '✓ saved', color: outpost.dirty > 0 ? 'red' : 'green' }
        if (outpost.isPrunable) status = { text: 'prunable', color: 'gray' }
        else if (isHover) status = { text: '⏎ open bag', color: 'yellow' }
        const right = outpost.isHere && !isHover ? 'here' : outpost.isLocked && !isHover ? 'lock' : outpost.age
        return (
          <Box key={`o-${outpost.path}`} flexDirection="row" height={1}>
            <Text color="yellow">{cursor(isHover)}</Text>
            <Text color={marker.color}>{fit(marker.glyph, MARK)}</Text>
            <Text bold={isHover || outpost.isHere} color={isHover ? 'yellow' : undefined} dimColor={outpost.isPrunable}>
              {fit(outpost.name, nameWidth)}
            </Text>
            <Text color="green" dimColor={!isHover}>
              {fit(`${outpost.branch || '(detached)'}${distance === '' ? '' : ` ${distance}`}`, BRANCH)}
            </Text>
            <Text color={status.color} dimColor={status.color === 'green'}>
              {fit(status.text, STATUS)}
            </Text>
            <Text dimColor>{fit(right, AGE)}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

export default Outposts
