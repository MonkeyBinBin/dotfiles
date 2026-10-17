import type { ElementTable, RenderChildren } from 'claude-code'
import { ruleSvg, RULE_HEIGHT, COLUMN_PX } from './svg'

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

// The row each item starts on: where a scroll stops, so a step moves a whole item however tall.
export const itemStops = (items: readonly Item[]): number[] => {
  const stops: number[] = []
  let top = 0
  for (const item of items) {
    stops.push(top)
    top += item.rows
  }
  return stops
}

// The offset `by` steps from `offset`: a row a step, or with `stops` an item a step, so a wheel notch over tall
// items moves the window rather than shifting an offset the paging rounds back to the same items.
export const scrolledOffset = (offset: number, by: number, total: number, rows: number, stops?: readonly number[]): number => {
  if (stops === undefined) return clampOffset(offset + by, total, rows)
  let at = clampOffset(offset, total, rows)
  for (let step = 0; step < Math.abs(by); step += 1) {
    at = by > 0 ? (stops.find(top => top > at) ?? total) : ([...stops].reverse().find(top => top < at) ?? 0)
    at = clampOffset(at, total, rows)
  }
  return at
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
  // The surface's Svg where it draws SVG (never the terminal): the rule is then one drawn grey line.
  Svg?: ElementTable<'desktop'>['Svg']
  // The selected menu tab above the window, whose frame opens into it: the window's top line is left open under
  // it, from its left column for its width.
  tab?: { left: number; width: number }
}

// A hand-drawn frame's side: a `│` a row, each its own line of text.
export const frameSide = (ui: ElementTable, color: string, rows: number) => {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" width={1} height={rows}>
      {Array.from({ length: rows }, (_, y) => (
        <Text key={`side-${y}`} color={color}>
          │
        </Text>
      ))}
    </Box>
  )
}

// The window's top line with a tab's frame opening into it: the tab's corners turn down into the line, the line
// open between them; a tab at either edge carries the window's side straight up.
export const tabbedTop = (width: number, tab: { left: number; width: number }): string => {
  const right = tab.left + tab.width - 1
  return Array.from({ length: width }, (_, x) => {
    if (x === tab.left) return x === 0 ? '│' : '╯'
    if (x === right) return x === width - 1 ? '│' : '╰'
    if (x > tab.left && x < right) return ' '
    if (x === 0) return '╭'
    if (x === width - 1) return '╮'
    return '─'
  }).join('')
}

// A framed RPG window: the title bar, a rule, and the items that fit, with a scroll gauge when they do not all fit.
export function renderWindow(ui: ElementTable, props: WindowProps) {
  const { Box, Button, Text } = ui
  const { Svg } = props
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
  // The bottom is where the offset can go no further, since tall items can leave the last rows unfilled there.
  const isAtBottom = start >= total - props.rows
  // With buttons the arrows are theirs, dimmed at either end; without, the gauge draws them.
  const gauge = !isScrolling ? '' : props.scroll === undefined ? `${start > 0 ? '▲' : ' '}${isAtBottom ? ' ' : '▼'} ${range}` : range
  const content = (
    <>
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
            <Button key="scroll-down" label="▼" plain hotkey={SCROLL_DOWN_KEY} dimColor={isAtBottom} onPress={props.scroll.down} />
          </Box>
        )}
        {gauge !== '' && <Text color={props.color}> {gauge}</Text>}
      </Box>
      {Svg !== undefined ? (
        <Box key="rule" height={1} alignItems="center">
          <Svg source={ruleSvg(inner)} alt="divider" width={inner * COLUMN_PX} height={RULE_HEIGHT} />
        </Box>
      ) : (
        <Text color={props.color} dimColor>
          {'─'.repeat(inner)}
        </Text>
      )}
      {props.body !== undefined
        ? props.body.node
        : shown.map(item => (
            <Box key={item.key} height={item.rows} flexDirection="column">
              {item.node}
            </Box>
          ))}
    </>
  )
  // Under a tab the frame is drawn by hand, its top open where the tab meets it; else the Box's own border.
  if (props.tab !== undefined) {
    const bodyRows = props.rows + WINDOW_CHROME_ROWS - 2
    const side = frameSide(ui, props.color, bodyRows)
    return (
      <Box flexDirection="column" width={props.width} height={props.rows + WINDOW_CHROME_ROWS}>
        <Text color={props.color}>{tabbedTop(props.width, props.tab)}</Text>
        <Box flexDirection="row" height={bodyRows}>
          {side}
          <Box flexDirection="column" width={Math.max(0, props.width - 2)} height={bodyRows} paddingX={1}>
            {content}
          </Box>
          {side}
        </Box>
        <Text color={props.color}>{`╰${'─'.repeat(Math.max(0, props.width - 2))}╯`}</Text>
      </Box>
    )
  }
  return (
    <Box
      flexDirection="column"
      width={props.width}
      height={props.rows + WINDOW_CHROME_ROWS}
      borderStyle="round"
      borderColor={props.color}
      paddingX={1}
    >
      {content}
    </Box>
  )
}
