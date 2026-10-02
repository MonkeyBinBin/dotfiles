import type { ElementTable } from 'claude-code'

import type { Pet } from '../types'
import { anim } from './anim'
import { PET_COLUMNS, PET_ROWS, petCells, speciesFor } from './pet-sprites'
import { formatElapsed, oneLine } from './util'
import type { Item } from './window'

// Three text rows beside the sprite, then a blank row.
const CARD_ROWS = 4
const SPRITE_GAP = 1

// Pets still out first, then the ones back, each newest first.
export const rosterOrder = (list: readonly Pet[]): Pet[] => {
  const newestFirst = list.slice().reverse()
  return [...newestFirst.filter(pet => pet.status === 'run'), ...newestFirst.filter(pet => pet.status !== 'run')]
}

const statusLine = (pet: Pet, now: number) => {
  const elapsed = formatElapsed((pet.endedAt ?? now) - pet.startedAt)
  if (pet.status === 'run') return { text: `✦ questing ${elapsed}`, color: 'yellow' }
  if (pet.status === 'ok') return { text: `✓ returned ${elapsed}`, color: 'green' }
  return { text: `✗ fainted ${elapsed}`, color: 'red' }
}

export const partySubtitle = (list: readonly Pet[]): string =>
  `${list.filter(pet => pet.status === 'run').length} questing · ${list.length} summoned`

export function petItems(
  ui: ElementTable,
  list: readonly Pet[],
  now: number,
  width: number,
  Raster?: ElementTable<'terminal'>['Raster'],
): Item[] {
  const { Box, Text } = ui
  // The animation repaints the running pets; the window decides which are on screen, so all are candidates.
  anim.pets = new Map(
    list
      .filter(pet => pet.status === 'run')
      .map(pet => [`pet-${pet.id}`, { kind: pet.kind, shown: anim.pets.get(`pet-${pet.id}`)?.shown ?? '' }]),
  )
  if (list.length === 0) {
    return [{ key: 'empty', rows: 1, node: <Text dimColor>No companions yet. Subagents you summon join the party.</Text> }]
  }
  const textWidth = Math.max(0, width - (Raster ? PET_COLUMNS + SPRITE_GAP : 0))
  return rosterOrder(list).map(pet => {
    const species = speciesFor(pet.kind)
    const status = statusLine(pet, now)
    const detail =
      pet.status === 'run'
        ? `⚔ ${pet.actions} · ${pet.lastTool ?? 'setting out'} ${pet.lastSummary ?? ''}`
        : `↩ ${pet.loot ?? `${pet.actions} actions`}`
    return {
      key: pet.id,
      rows: CARD_ROWS,
      node: (
        <Box flexDirection="row" height={CARD_ROWS}>
          {Raster && (
            <Box width={PET_COLUMNS + SPRITE_GAP}>
              <Raster key={`pet-${pet.id}`} columns={PET_COLUMNS} rows={PET_ROWS} cells={petCells(pet.kind, pet.status, 0)} />
            </Box>
          )}
          <Box flexDirection="column" width={textWidth}>
            <Box height={1}>
              <Box flexGrow={1}>
                <Text wrap="truncate">
                  <Text bold color={pet.status === 'err' ? 'gray' : species.color}>{species.name}</Text>
                  <Text dimColor> {oneLine(pet.kind, 16)}</Text>
                  {pet.camp !== undefined && <Text color="cyan"> ⚑{pet.camp}</Text>}
                </Text>
              </Box>
              <Text color={status.color}>{status.text}</Text>
            </Box>
            <Text wrap="truncate">{oneLine(pet.description, textWidth)}</Text>
            <Text dimColor wrap="truncate">
              {oneLine(detail, textWidth)}
            </Text>
          </Box>
        </Box>
      ),
    }
  })
}
