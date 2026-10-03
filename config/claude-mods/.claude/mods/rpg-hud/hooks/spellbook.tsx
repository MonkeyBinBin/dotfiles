import type { ElementTable } from 'claude-code'

import type { ToolCall, ToolCallStatus } from '../types'
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

// The newest spell first, one row each.
export function spellItems(ui: ElementTable, list: readonly ToolCall[], width: number): Item[] {
  const { Box, Text } = ui
  if (list.length === 0) {
    return [{ key: 'empty', rows: 1, node: <Text dimColor>No spells cast yet. The tome awaits.</Text> }]
  }
  const summaryWidth = Math.max(0, width - COLUMNS.mark - COLUMNS.rune - COLUMNS.tool - COLUMNS.time)
  return list
    .slice()
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
              <Text dimColor={call.status !== 'run'} color={call.status === 'run' ? 'yellow' : undefined} wrap="truncate">
                {formatMs(call.ms)}
              </Text>
            </Box>
          </Box>
        ),
      }
    })
}
