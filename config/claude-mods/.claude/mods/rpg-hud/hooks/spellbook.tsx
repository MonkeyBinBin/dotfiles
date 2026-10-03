import type { ElementTable } from 'claude-code'

import type { SpellFilter, ToolCall, ToolCallStatus } from '../types'
import { formatMs, oneLine } from './util'
import type { Item } from './window'

// Fixed columns; the incantation takes what is left.
// The tool column fits 'AskUserQuestion' whole; longer names (MCP tools) are cut.
const COLUMNS = { mark: 2, rune: 2, tool: 16, time: 7 }

export const STATUS_MARKS: Record<ToolCallStatus, { glyph: string; color: string }> = {
  run: { glyph: '✦', color: 'yellow' },
  ok: { glyph: '✓', color: 'green' },
  err: { glyph: '✗', color: 'red' },
  deny: { glyph: '⊘', color: 'gray' },
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

export const schoolOf = (tool: string) =>
  SCHOOLS[tool] ?? (tool.startsWith('mcp__') ? { rune: '⚙', color: 'white' } : { rune: '•', color: 'white' })

// A call this long is slow, and one this long is a slog: its time turns yellow, then red.
export const SLOW_MS = 5_000
const SLOG_MS = 30_000

export const timeColor = (ms?: number): string | undefined => {
  if (ms === undefined) return undefined
  if (ms >= SLOG_MS) return 'red'
  return ms >= SLOW_MS ? 'yellow' : undefined
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

// The newest spell the filter keeps first, one row each.
export function spellItems(ui: ElementTable, list: readonly ToolCall[], width: number, filter: SpellFilter = 'all'): Item[] {
  const { Box, Text } = ui
  const kept = filterSpells(list, filter)
  if (kept.length === 0) {
    const empty = (list.length === 0 ? FILTERS[0] : FILTERS.find(one => one.id === filter))?.empty ?? ''
    return [{ key: 'empty', rows: 1, node: <Text dimColor>{empty}</Text> }]
  }
  const summaryWidth = Math.max(0, width - COLUMNS.mark - COLUMNS.rune - COLUMNS.tool - COLUMNS.time)
  return kept
    .reverse()
    .map(call => {
      const mark = STATUS_MARKS[call.status]
      const school = schoolOf(call.tool)
      return {
        key: call.id,
        rows: 1,
        node: (
          <Box height={1}>
            <Box width={COLUMNS.mark}>
              <Text color={mark.color}>{mark.glyph}</Text>
            </Box>
            <Box width={COLUMNS.rune}>
              <Text color={school.color}>{school.rune}</Text>
            </Box>
            <Box width={COLUMNS.tool}>
              <Text bold color={school.color} wrap="truncate">
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
                color={call.status === 'run' ? 'yellow' : timeColor(call.ms)}
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
