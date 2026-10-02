import type { ElementTable } from 'claude-code'

import { rarityOf, splitBar } from './diff'

export type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }

// What an Edit or Write result carries that the card reads.
export type EditOutput = {
  filePath: string
  structuredPatch?: Hunk[]
  type?: 'create' | 'update'
  content?: string
  userModified?: boolean
  staged?: boolean
}

// The card shows this many diff lines; the transcript's own expansion (ctrl+o) still has the whole result.
export const CARD_LINES = 40
const BAR = 20

export const countPatch = (hunks: readonly Hunk[]) => {
  let added = 0
  let removed = 0
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) added += 1
      else if (line.startsWith('-')) removed += 1
    }
  }
  return { added, removed }
}

// The hunks as unified-diff text of at most `max` lines; a hunk cut short gets a header that counts what it kept,
// so the text still parses as hunks.
export const patchSource = (hunks: readonly Hunk[], max: number) => {
  const out: string[] = []
  let shown = 0
  let total = 0
  for (const hunk of hunks) {
    total += hunk.lines.length
    const room = max - shown
    if (room <= 0) continue
    const kept = hunk.lines.slice(0, room)
    const oldLines = kept.filter(line => !line.startsWith('+')).length
    const newLines = kept.filter(line => !line.startsWith('-')).length
    out.push(`@@ -${hunk.oldStart},${oldLines} +${hunk.newStart},${newLines} @@`, ...kept)
    shown += kept.length
  }
  return { source: out.join('\n'), hidden: total - shown }
}

const shortPath = (path: string, cwd: string): string => (path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path)

// An Edit or Write result as a spell card: what was cast on which file, its +/− and rarity, then the diff itself.
export function renderEditCard(ui: ElementTable, tool: string, output: EditOutput, cwd: string) {
  const { Box, Text, Code } = ui
  const hunks = output.structuredPatch ?? []
  const isCreate = tool === 'Write' && output.type === 'create'
  const created = isCreate ? (output.content ?? '').split('\n') : []
  const { added, removed } = isCreate ? { added: created.length, removed: 0 } : countPatch(hunks)
  const rarity = rarityOf(added + removed)
  const { plus, minus } = splitBar(added, removed, BAR)
  const verb = isCreate ? '✚ Conjured' : tool === 'Write' ? '✒ Rewrote' : '✎ Enchanted'
  const patch = isCreate ? { source: created.slice(0, CARD_LINES).join('\n'), hidden: Math.max(0, created.length - CARD_LINES) } : patchSource(hunks, CARD_LINES)

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={rarity.color} paddingX={1}>
      <Box height={1}>
        <Box flexGrow={1}>
          <Text wrap="truncate">
            <Text bold color={rarity.color}>
              {verb}
            </Text>
            <Text bold> {shortPath(output.filePath, cwd)}</Text>
          </Text>
        </Box>
        <Text>
          <Text color="green">+{added}</Text>
          <Text color="red"> −{removed}</Text>
          <Text color={rarity.color}> [{rarity.name}]</Text>
        </Text>
      </Box>
      <Text>
        <Text color="green">{'▮'.repeat(plus)}</Text>
        <Text color="red">{'▮'.repeat(minus)}</Text>
        <Text dimColor>{'·'.repeat(BAR - plus - minus)}</Text>
        {output.staged === true && <Text color="yellow">  ✋ held for review: the file is unchanged</Text>}
        {output.userModified === true && <Text color="cyan">  ✎ you reshaped the spell</Text>}
      </Text>
      {patch.source.length > 0 &&
        (isCreate ? (
          <Code source={patch.source} path={output.filePath} startLine={1} wrap="truncate-end" />
        ) : (
          <Code source={patch.source} format="diff" path={output.filePath} wrap="truncate-end" />
        ))}
      {patch.hidden > 0 && <Text dimColor>⋯ {patch.hidden} more lines (ctrl+o shows the whole result)</Text>}
    </Box>
  )
}
