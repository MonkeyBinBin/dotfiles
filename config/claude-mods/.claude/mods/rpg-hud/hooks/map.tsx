import type { ElementTable } from 'claude-code'

import type { GitMap, TouchedFile } from '../types'
import { GRAPH_LIMIT, isLinear, parseLog } from './git'
import type { GraphRow } from './git'
import { layoutLanes } from './lanes'
import type { LaneRow } from './lanes'
import { oneLine } from './util'
import type { Item } from './window'

const LANE_COLORS = ['cyan', 'magenta', 'yellow', 'green', 'blue', 'red']
const HASH_COLUMNS = 8
// The age column on the right: `11mo` and a space.
const AGE_COLUMNS = 5
// The trail's glyph, the marker and a space before the hash.
const TRAIL_COLUMNS = 4
// '🎒' at the end of a commit still to be pushed.
const LOOT_COLUMNS = 3

// Edited files first, then the most read.
export const exploredOrder = (files: readonly TouchedFile[]): TouchedFile[] =>
  files.slice().sort((a, b) => b.edits - a.edits || b.reads - a.reads || a.path.localeCompare(b.path))

export const mapSubtitle = (map: GitMap): string => {
  if (!map.isRepo) return 'uncharted'
  const rows = parseLog(map.graph, map.remotes)
  return `@ ${map.branch || 'detached'} · ${isLinear(rows) ? 'one road' : 'branching paths'}`
}

export type Stop =
  | { kind: 'camp'; dirty: number }
  | { kind: 'town'; remotes: string[]; isHere: boolean }
  | { kind: 'step'; row: GraphRow; place: 'here' | 'carried' | 'road' }
  | { kind: 'end'; isCut: boolean }

// A linear history as a road walked from the newest commit back: the camp of unsaved work, you at HEAD,
// the commits carried but not yet delivered, the remote's town where they would go, then the road behind.
export const trailStops = (rows: readonly GraphRow[], dirty: number): Stop[] => {
  const stops: Stop[] = []
  if (dirty > 0) stops.push({ kind: 'camp', dirty })
  const townAt = rows.findIndex(row => row.remotes.length > 0)
  rows.forEach((row, index) => {
    if (index === townAt) stops.push({ kind: 'town', remotes: row.remotes, isHere: row.isHead })
    const place = row.isHead ? 'here' : townAt === -1 || index < townAt ? 'carried' : 'road'
    stops.push({ kind: 'step', row, place })
  })
  stops.push({ kind: 'end', isCut: rows.length >= GRAPH_LIMIT })
  return stops
}

// A row's lanes, each glyph in its lane's colour; the HEAD commit is the player.
const Lanes = (ui: ElementTable, lanes: LaneRow, width: number, isHead: boolean) => {
  const { Text } = ui
  const glyphs = lanes.cells.map((cell, index) => {
    const color = LANE_COLORS[cell.color % LANE_COLORS.length] ?? 'cyan'
    if (cell.isCommit === true) {
      return isHead ? (
        <Text key={`c-${index}`} bold color="yellow">@</Text>
      ) : (
        <Text key={`c-${index}`} color={color}>●</Text>
      )
    }
    return (
      <Text key={`c-${index}`} color={color}>
        {cell.glyph}
      </Text>
    )
  })
  // Narrower rows padded out so every hash starts in the same column.
  const pad = width - lanes.cells.length
  return pad > 0 ? [...glyphs, <Text key="pad">{' '.repeat(pad)}</Text>] : glyphs
}

const row = (key: string, node: Item['node']): Item => ({ key, rows: 1, node })

// Branches checked out in another outpost (worktree), to the outpost's name.
export type Camps = Readonly<Record<string, string>>

// The outposts camped on a commit's branches: `refs` as git decorates it (`HEAD -> main, feat/x`).
export const campsOn = (refs: string, camps: Camps): string[] =>
  refs
    .split(',')
    .map(ref => ref.trim().replace(/^HEAD -> /, ''))
    .flatMap(ref => (camps[ref] === undefined ? [] : [camps[ref]]))

const Flags = (ui: ElementTable, names: readonly string[]) => {
  const { Text } = ui
  return names.length === 0 ? null : <Text color="cyan"> ⚑{names.join(' ⚑')}</Text>
}

// The camp of unsaved work, with the button that opens the bag of changes.
const campRow = (ui: ElementTable, dirty: number, lead: string, openBag: () => void): Item => {
  const { Box, Text, Button } = ui
  return row(
    'camp',
    <Box height={1}>
      <Box flexGrow={1}>
        <Text wrap="truncate">
          <Text color="yellow">{lead}</Text>
          <Text color="red">⛺</Text>
          <Text bold color="red"> camp </Text>
          <Text dimColor>· {dirty} unsaved</Text>
        </Text>
      </Box>
      <Button key="open-bag" label="🎒 open the bag ▸" plain onPress={openBag} />
    </Box>,
  )
}

function trailItems(ui: ElementTable, rows: readonly GraphRow[], dirty: number, width: number, actions: MapActions): Item[] {
  const { openBag, camps } = actions
  const { Box, Text } = ui
  const subjectWidth = (extra: number) => Math.max(4, width - TRAIL_COLUMNS - HASH_COLUMNS - AGE_COLUMNS - extra)
  return trailStops(rows, dirty).map((stop, index) => {
    switch (stop.kind) {
      case 'camp':
        return campRow(ui, stop.dirty, '╭ ', openBag)
      case 'town':
        return row(
          'town',
          <Text wrap="truncate">
            <Text color="cyan">╞═</Text>
            <Text>🏰</Text>
            <Text bold color="cyan"> {stop.remotes.join(', ')} </Text>
            <Text color="cyan" dimColor>
              {'═'.repeat(Math.max(0, width - 8 - stop.remotes.join(', ').length - (stop.isHere ? 11 : 6)))}
            </Text>
            <Text color={stop.isHere ? 'green' : 'cyan'}>{stop.isHere ? ' you\'re here' : ' town'}</Text>
          </Text>,
        )
      case 'end':
        return row(
          'end',
          <Text color="gray" dimColor>
            {stop.isCut ? `╵ ⋯ the road goes on beyond ${GRAPH_LIMIT} steps` : '╵ ⚐ where it all began'}
          </Text>,
        )
      case 'step': {
        const { row: commit, place } = stop
        const isFirst = index === 0
        // One solid line down the column: colour, not the glyph, tells the carried steps from the road behind.
        const trail = isFirst ? '╭' : '│'
        const marker =
          place === 'here' ? (
            <Text bold color="yellow">@</Text>
          ) : place === 'carried' ? (
            <Text color="yellow">◆</Text>
          ) : (
            <Text color="gray">◇</Text>
          )
        const loot = place === 'carried'
        const flags = campsOn(commit.refs, camps)
        return row(
          `s-${commit.hash}`,
          <Box height={1}>
            <Box flexGrow={1}>
              <Text wrap="truncate">
                <Text color={place === 'road' ? 'gray' : 'yellow'}>{trail} </Text>
                {marker}
                <Text> </Text>
                <Text color="yellow" dimColor>{commit.hash.slice(0, 7)} </Text>
                <Text bold={place === 'here'} dimColor={place === 'road'}>
                  {oneLine(commit.subject, subjectWidth((loot ? LOOT_COLUMNS : 0) + flags.join('  ').length + flags.length * 2))}
                </Text>
                {Flags(ui, flags)}
              </Text>
            </Box>
            {loot && <Text> 🎒</Text>}
            <Box width={AGE_COLUMNS} justifyContent="flex-end">
              <Text dimColor>{commit.age}</Text>
            </Box>
          </Box>,
        )
      }
    }
  })
}

function branchItems(ui: ElementTable, rows: readonly GraphRow[], width: number, camps: Camps): Item[] {
  const { Box, Text } = ui
  const lanes = layoutLanes(rows)
  // Every subject starts in the same column, past the widest row of lanes.
  const graphWidth = Math.max(...lanes.map(lane => lane.cells.length))
  return rows.map((line, index) => {
    const refs = line.refs === '' ? '' : `(${line.refs})`
    const flags = campsOn(line.refs, camps)
    // The refs, their space, and each ⚑flag with its space.
    const extras = (refs === '' ? 0 : refs.length + 1) + flags.reduce((sum, name) => sum + name.length + 2, 0)
    const subjectWidth = Math.max(4, width - graphWidth - HASH_COLUMNS - extras - AGE_COLUMNS)
    return row(
      `g-${line.hash}`,
      <Box height={1}>
        <Box flexGrow={1}>
          <Text wrap="truncate">
            {Lanes(ui, lanes[index] as LaneRow, graphWidth, line.isHead)}
            <Text color="yellow" dimColor>{line.hash.slice(0, 7)} </Text>
            {refs !== '' && <Text color="green">{refs}</Text>}
            {Flags(ui, flags)}
            {refs !== '' && <Text> </Text>}
            <Text bold={line.isHead}>{oneLine(line.subject, subjectWidth)}</Text>
          </Text>
        </Box>
        <Box width={AGE_COLUMNS} justifyContent="flex-end">
          <Text dimColor>{line.age}</Text>
        </Box>
      </Box>,
    )
  })
}

// Where the party stands, the history as a road (one line) or a lane graph (branches), then the places explored.
export type MapActions = {
  openBag: () => void
  openOutposts: () => void
  // How many outposts (worktrees) the repository has, the session's own included.
  outposts: number
  camps: Camps
}

export function mapItems(ui: ElementTable, map: GitMap, touched: readonly TouchedFile[], width: number, actions: MapActions): Item[] {
  const { Box, Text, Button } = ui
  const { openBag } = actions
  if (!map.isRepo) return [row('none', <Text dimColor>Uncharted land: this folder is not a git repository.</Text>)]

  const rows = parseLog(map.graph, map.remotes)
  const items: Item[] = [
    row(
      'where',
      <Box height={1}>
        <Box flexGrow={1}>
          <Text wrap="truncate">
            <Text bold color="yellow">@ {map.branch || 'detached'}</Text>
            {map.ahead > 0 && <Text color="green">  ↑{map.ahead} to deliver</Text>}
            {map.behind > 0 && <Text color="red">  ↓{map.behind} behind</Text>}
            {map.dirty > 0 ? (
              <Text color="red">  ⚠ {map.dirty} unsaved</Text>
            ) : (
              <Text color="green" dimColor>
                {'  ✓ all saved'}
              </Text>
            )}
          </Text>
        </Box>
        {actions.outposts > 1 && (
          <Button key="open-outposts" label={`🏕 ${actions.outposts} outposts ▸`} plain onPress={actions.openOutposts} />
        )}
      </Box>,
    ),
    row('gap-top', <Text> </Text>),
    ...(isLinear(rows)
      ? trailItems(ui, rows, map.dirty, width, actions)
      : [...(map.dirty > 0 ? [campRow(ui, map.dirty, '', openBag)] : []), ...branchItems(ui, rows, width, actions.camps)]),
    row('gap', <Text> </Text>),
    row(
      'explored',
      <Text bold color="cyan">
        ✧ Explored <Text dimColor>{touched.length} places</Text>
      </Text>,
    ),
  ]
  if (touched.length === 0) items.push(row('nothing', <Text dimColor>Nothing explored yet.</Text>))
  for (const file of exploredOrder(touched)) {
    items.push(
      row(
        `f-${file.path}`,
        <Text wrap="truncate">
          {file.edits > 0 ? <Text color="yellow">◆ </Text> : <Text color="cyan">◇ </Text>}
          <Text>{oneLine(file.path, width - 14)}</Text>
          <Text dimColor>
            {file.edits > 0 ? `  ✎${file.edits}` : ''}
            {file.reads > 0 ? `  ◈${file.reads}` : ''}
          </Text>
        </Text>,
      ),
    )
  }
  return items
}
