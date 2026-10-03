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

// The items that fit `rows` from `offset` down, starting at the first item that begins there or later and
// stopping at the first that does not fit: a later, shorter item never jumps ahead of it.
export const pageItems = (items: readonly Item[], offset: number, rows: number) => {
  const total = totalRows(items)
  const start = clampOffset(offset, total, rows)
  const shown: Item[] = []
  let top = 0
  let used = 0
  for (const item of items) {
    if (top >= start) {
      if (used + item.rows > rows) break
      shown.push(item)
      used += item.rows
    }
    top += item.rows
  }
  return { shown, start, total, end: start + used }
}

// The keys that scroll a window, as vim's: the pane's buttons for them carry these as hotkeys.
export const SCROLL_UP_KEY = 'k'
export const SCROLL_DOWN_KEY = 'j'

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
  // Scrolls the window a step; given, a window with more than it shows carries ▲ and ▼ buttons keyed k and j.
  scroll?: { up: () => void; down: () => void }
}

// A framed RPG window: the title bar, a rule, and the items that fit, with a scroll gauge when they do not all fit.
export function renderWindow(ui: ElementTable, props: WindowProps) {
  const { Box, Button, Text } = ui
  const paged = pageItems(props.items, props.offset, props.rows)
  const { shown } = paged
  let { start, total, end } = paged
  if (props.body !== undefined) {
    total = props.body.total
    start = clampOffset(props.offset, total, props.rows)
    end = Math.min(total, start + props.rows)
  }
  const inner = Math.max(0, props.width - WINDOW_CHROME_COLUMNS)
  const isScrolling = total > props.rows
  const range = `${start + 1}–${end}/${total}`
  // With buttons the arrows are theirs, dimmed at either end: the bottom is where the offset can go no further,
  // since tall items can leave the last rows unfilled there. Without, the gauge draws them.
  const gauge = !isScrolling ? '' : props.scroll === undefined ? `${start > 0 ? '▲' : ' '}${end < total ? '▼' : ' '} ${range}` : range
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
        {isScrolling && props.scroll !== undefined && (
          <Box flexDirection="row" columnGap={1} marginLeft={1}>
            <Button key="scroll-up" label="▲" plain hotkey={SCROLL_UP_KEY} dimColor={start === 0} onPress={props.scroll.up} />
            <Button key="scroll-down" label="▼" plain hotkey={SCROLL_DOWN_KEY} dimColor={start >= total - props.rows} onPress={props.scroll.down} />
          </Box>
        )}
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
