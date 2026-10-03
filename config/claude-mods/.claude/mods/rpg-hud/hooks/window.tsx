import type { ElementTable, RenderChildren } from 'claude-code'

// One entry of a window's scrolling body: `rows` tall, never cut in half.
export type Item = { key: string; rows: number; node: RenderChildren }

// The border's two rows, the title row and the rule under it.
export const WINDOW_CHROME_ROWS = 4
// The border's column and the padding column on each side.
export const WINDOW_CHROME_COLUMNS = 4

export const totalRows = (items: readonly Item[]): number => items.reduce((sum, item) => sum + item.rows, 0)

export const clampOffset = (offset: number, total: number, rows: number): number =>
  Math.max(0, Math.min(offset, total - rows))

// The items that fit `rows` from `offset` down, starting at the first item that begins there or later.
export const pageItems = (items: readonly Item[], offset: number, rows: number) => {
  const total = totalRows(items)
  const start = clampOffset(offset, total, rows)
  const shown: Item[] = []
  let top = 0
  let used = 0
  for (const item of items) {
    if (top >= start && used + item.rows <= rows) {
      shown.push(item)
      used += item.rows
    }
    top += item.rows
  }
  return { shown, start, total, end: start + used }
}

export type WindowProps = {
  title: string
  subtitle?: string
  color: string
  items: readonly Item[]
  // Controls on the title row, right of the title: they stay put while the items scroll.
  actions?: RenderChildren
  // A body that scrolls itself (a Client), in place of the items: what it draws and how many rows it has in all.
  body?: { node: RenderChildren; total: number }
  offset: number
  rows: number
  width: number
}

// A framed RPG window: the title bar, a rule, and the items that fit, with a scroll gauge when they do not all fit.
export function renderWindow(ui: ElementTable, props: WindowProps) {
  const { Box, Text } = ui
  const paged = pageItems(props.items, props.offset, props.rows)
  const { shown } = paged
  let { start, total, end } = paged
  if (props.body !== undefined) {
    total = props.body.total
    start = clampOffset(props.offset, total, props.rows)
    end = Math.min(total, start + props.rows)
  }
  const inner = Math.max(0, props.width - WINDOW_CHROME_COLUMNS)
  const gauge = total > props.rows ? `${start > 0 ? '▲' : ' '}${end < total ? '▼' : ' '} ${start + 1}–${end}/${total}` : ''
  return (
    <Box
      flexDirection="column"
      width={props.width}
      height={props.rows + WINDOW_CHROME_ROWS}
      borderStyle="round"
      borderColor={props.color}
      paddingX={1}
    >
      <Box height={1}>
        <Box flexGrow={1}>
          <Text wrap="truncate">
            <Text bold color={props.color}>{props.title}</Text>
            {props.subtitle !== undefined && <Text dimColor>  {props.subtitle}</Text>}
          </Text>
        </Box>
        {props.actions}
        {gauge !== '' && <Text color={props.color}> {gauge}</Text>}
      </Box>
      <Text color={props.color} dimColor>
        {'─'.repeat(inner)}
      </Text>
      {props.body !== undefined
        ? props.body.node
        : shown.map(item => (
            <Box key={item.key} height={item.rows} flexDirection="column">
              {item.node}
            </Box>
          ))}
    </Box>
  )
}
