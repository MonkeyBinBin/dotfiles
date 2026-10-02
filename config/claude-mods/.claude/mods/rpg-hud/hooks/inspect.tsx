import type { ElementTable } from 'claude-code'

import type { BagItem, Inspect } from '../types'
import { STATUS_GLYPHS, parseDiff, rarityOf } from './diff'
import type { Item } from './window'

// The line number column and the +/− marker after it.
const GUTTER = 5
const MARK = 2

const MARKS = { add: { glyph: '+', color: 'green' }, del: { glyph: '−', color: 'red' }, ctx: { glyph: ' ', color: 'gray' } } as const

export const bagSubtitle = (bag: readonly BagItem[]): string => {
  const added = bag.reduce((sum, item) => sum + item.added, 0)
  const removed = bag.reduce((sum, item) => sum + item.removed, 0)
  return `${bag.length} items · +${added} −${removed}`
}

// One change's diff, a row a line: the back button, the item's card, then its hunks with line numbers.
export function inspectItems(
  ui: ElementTable,
  inspect: Inspect | null,
  item: BagItem | undefined,
  width: number,
  back: () => void,
): Item[] {
  const { Box, Text, Button } = ui
  const row = (key: string, node: Item['node']): Item => ({ key, rows: 1, node })
  const items: Item[] = [
    row('back', <Button key="inspect-back" label="◂ back to the bag" plain onPress={back} />),
  ]
  if (inspect === null) return [...items, row('loading', <Text dimColor>Unrolling the scroll…</Text>)]

  const rarity = rarityOf((item?.added ?? 0) + (item?.removed ?? 0))
  items.push(
    row(
      'card',
      <Text wrap="truncate">
        <Text bold color={rarity.color}>
          {STATUS_GLYPHS[item?.status ?? 'M'] ?? '✎'} {inspect.path}
        </Text>
        {item !== undefined && (
          <Text>
            <Text color="green">  +{item.added}</Text>
            <Text color="red"> −{item.removed}</Text>
          </Text>
        )}
        <Text color={rarity.color} dimColor>
          {'  '}[{rarity.name}]
        </Text>
      </Text>,
    ),
  )

  const lines = parseDiff(inspect.lines)
  if (lines.length === 0) items.push(row('empty', <Text dimColor>Nothing to read: the change is only in its mode or name.</Text>))
  const textWidth = Math.max(4, width - GUTTER - MARK)
  lines.forEach((line, index) => {
    if (line.kind === 'meta') {
      items.push(row(`l-${index}`, <Text dimColor>{line.text}</Text>))
      return
    }
    if (line.kind === 'hunk') {
      const label = `── line ${line.newStart} ${line.text}`.trimEnd() + ' '
      items.push(
        row(
          `l-${index}`,
          <Text color="cyan" dimColor wrap="truncate">
            {label + '─'.repeat(Math.max(0, width - label.length))}
          </Text>,
        ),
      )
      return
    }
    const mark = MARKS[line.kind]
    items.push(
      row(
        `l-${index}`,
        <Box height={1}>
          <Box width={GUTTER}>
            <Text dimColor>{String(line.number).padStart(GUTTER - 1)}</Text>
          </Box>
          <Box width={MARK}>
            <Text bold color={mark.color}>
              {mark.glyph}
            </Text>
          </Box>
          <Box width={textWidth}>
            <Text wrap="truncate" {...(line.kind === 'ctx' ? { dimColor: true } : { color: mark.color })}>
              {line.text.replace(/\t/g, '  ') || ' '}
            </Text>
          </Box>
        </Box>,
      ),
    )
  })
  if (inspect.isCut) items.push(row('cut', <Text dimColor>⋯ the scroll goes on; open the file to read the rest</Text>))
  return items
}
