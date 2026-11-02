import type { ElementTable } from 'claude-code'

import type { SpellFilter, ToolCall } from '../types'
import { anim } from './anim'
import { emptyItem } from './empty'
import { HEX, STATUS_MARKS, TIERS, tone } from './palette'
import { formatMs, oneLine, packCells } from './util'
import type { Item } from './window'

// Fixed columns; the incantation takes what is left.
// The tool column fits 'AskUserQuestion' whole; longer names (MCP tools) are cut.
const COLUMNS = { mark: 2, rune: 2, tool: 16, time: 7 }

// A running spell's mark twinkles: ✦ ✧ ⋆ ✧, brightening and dimming, a step every few ticks.
export const RUNE_TICKS = 2
const RUNE_STEPS: ReadonlyArray<readonly [number, number]> = [
  [0x2726, 0xffd23c],
  [0x2727, 0xffe68c],
  [0x22c6, 0xb48c1e],
  [0x2727, 0xffe68c],
]
const DEFAULT_COLOR = 0x01000000

export const runeCells = (tick: number): string => {
  const [glyph, color] = RUNE_STEPS[Math.floor(tick / RUNE_TICKS) % RUNE_STEPS.length]!
  return packCells([[glyph, color, DEFAULT_COLOR]])
}

// Each tool is a school of magic: its rune and colour.
const SCHOOLS: Record<string, { rune: string; color: string }> = {
  Read: { rune: '◈', color: 'cyan' },
  Edit: { rune: '✎', color: 'yellow' },
  Write: { rune: '✒', color: 'yellow' },
  NotebookEdit: { rune: '✎', color: 'yellow' },
  Bash: { rune: 'ϟ', color: 'magenta' },
  Grep: { rune: '⌕', color: 'blue' },
  Glob: { rune: '⌕', color: 'blue' },
  Agent: { rune: '♣', color: 'green' },
  Skill: { rune: '✧', color: 'green' },
  WebFetch: { rune: '☁', color: 'blue' },
  WebSearch: { rune: '☁', color: 'blue' },
}

export const schoolOf = (tool: string) => {
  const school = SCHOOLS[tool] ?? (tool.startsWith('mcp__') ? { rune: '⚙', color: 'white' } : { rune: '•', color: 'white' })
  return { rune: school.rune, color: tone(school.color) }
}

// How rare a spell was, by what it achieved: slaying a boss is legendary; a delivery, a summons or a skill epic; a
// save or a forged file rare; the rest common. Only a spell that landed has one.
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

const EPIC_TOOLS = new Set(['Agent', 'Skill'])
const RARE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])

export const spellRarity = (call: ToolCall): Rarity | undefined => {
  if (call.status !== 'ok') return undefined
  if (call.feat === 'slay') return 'legendary'
  if (call.feat === 'deliver' || EPIC_TOOLS.has(call.tool)) return 'epic'
  if (call.feat === 'save' || RARE_TOOLS.has(call.tool)) return 'rare'
  return 'common'
}

// A landed spell's mark by its rarity, from the shared ladder; the common keep the plain tick.
const RARITY_MARKS: Record<Exclude<Rarity, 'common'>, { glyph: string; color: string }> = {
  rare: TIERS.rare,
  epic: TIERS.epic,
  legendary: TIERS.legendary,
}

// A call this long is slow, and one this long is a slog: its time turns yellow, then red.
export const SLOW_MS = 5_000
const SLOG_MS = 30_000

export const timeColor = (ms?: number): string | undefined => {
  if (ms === undefined) return undefined
  if (ms >= SLOG_MS) return HEX.red
  return ms >= SLOW_MS ? HEX.gold : undefined
}

// Short labels: the filters share the title row with the title and the scroll gauge.
const FILTERS: readonly { id: SpellFilter; label: string; empty: string }[] = [
  { id: 'all', label: 'all', empty: 'No spells cast yet. The tome awaits.' },
  { id: 'errors', label: '✗', empty: 'No fizzles. Clean casting.' },
  { id: 'slow', label: '◷', empty: `Nothing took ${SLOW_MS / 1000}s or more.` },
]

export const filterSpells = (list: readonly ToolCall[], filter: SpellFilter): ToolCall[] => {
  if (filter === 'errors') return list.filter(call => call.status === 'err')
  if (filter === 'slow') return list.filter(call => (call.ms ?? 0) >= SLOW_MS)
  return [...list]
}

// The filters for the spell book's title row: each a button with its count, the active one marked.
export function spellFilters(ui: ElementTable, list: readonly ToolCall[], active: SpellFilter, pick: (filter: SpellFilter) => void) {
  const { Box, Button } = ui
  return (
    <Box flexDirection="row" columnGap={1} height={1}>
      {FILTERS.map(one => (
        <Button
          key={`filter-${one.id}`}
          label={`${one.id === active ? '▸' : ''}${one.label} ${filterSpells(list, one.id).length}`}
          plain
          dimColor={one.id !== active}
          onPress={() => pick(one.id)}
        />
      ))}
    </Box>
  )
}

// The newest spell the filter keeps first, one row each. On the terminal a running spell's mark is a Raster the
// animation twinkles.
export function spellItems(ui: ElementTable, list: readonly ToolCall[], width: number, filter: SpellFilter = 'all', Raster?: ElementTable<'terminal'>['Raster']): Item[] {
  const { Box, Text } = ui
  const kept = filterSpells(list, filter)
  // The window decides which are on screen, so every running spell is a candidate.
  anim.spells = new Map(
    kept
      .filter(call => Raster !== undefined && call.status === 'run')
      .map(call => [`spell-${call.id}`, { shown: anim.spells.get(`spell-${call.id}`)?.shown ?? '' }]),
  )
  if (kept.length === 0) {
    const empty = (list.length === 0 ? FILTERS[0] : FILTERS.find(one => one.id === filter))?.empty ?? ''
    return [emptyItem(ui, empty, Raster)]
  }
  const summaryWidth = Math.max(0, width - COLUMNS.mark - COLUMNS.rune - COLUMNS.tool - COLUMNS.time)
  return kept
    .reverse()
    .map(call => {
      const rarity = spellRarity(call)
      const mark = rarity === undefined || rarity === 'common' ? STATUS_MARKS[call.status] : RARITY_MARKS[rarity]
      const school = schoolOf(call.tool)
      return {
        key: call.id,
        rows: 1,
        node: (
          <Box height={1}>
            <Box width={COLUMNS.mark}>
              {call.status === 'run' && Raster !== undefined ? (
                <Raster key={`spell-${call.id}`} columns={1} rows={1} cells={runeCells(anim.tick)} />
              ) : (
                <Text color={mark.color} bold={rarity === 'legendary'}>{mark.glyph}</Text>
              )}
            </Box>
            <Box width={COLUMNS.rune}>
              <Text color={school.color}>{school.rune}</Text>
            </Box>
            <Box width={COLUMNS.tool}>
              {/* A legendary spell's name burns gold whatever its school. */}
              <Text bold color={rarity === 'legendary' ? HEX.gold : school.color} wrap="truncate">
                {oneLine(call.tool, COLUMNS.tool - 1)}
              </Text>
            </Box>
            <Box width={summaryWidth}>
              <Text dimColor wrap="truncate">
                {oneLine(call.summary, summaryWidth)}
              </Text>
            </Box>
            <Box width={COLUMNS.time} justifyContent="flex-end">
              <Text
                dimColor={call.status !== 'run' && timeColor(call.ms) === undefined}
                color={call.status === 'run' ? HEX.gold : timeColor(call.ms)}
                wrap="truncate"
              >
                {formatMs(call.ms)}
              </Text>
            </Box>
          </Box>
        ),
      }
    })
}
