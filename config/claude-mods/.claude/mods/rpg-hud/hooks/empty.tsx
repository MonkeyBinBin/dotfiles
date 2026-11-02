import type { ElementTable } from 'claude-code'

import { SLEEPING_COLUMNS, SLEEPING_ROWS, sleepingCells, sleepingPixels } from './pet-sprites'
import { gridToPixels, spriteSvg } from './svg'
import type { Item } from './window'

// CSS pixels per sprite pixel where the slime is a drawing, as the pets are drawn.
const SLEEPING_PX = 8

// A list with nothing in it yet: a slime asleep beside the dim line that says so. A surface with neither cells
// nor drawings keeps the line alone.
export function emptyItem(ui: ElementTable, text: string, Raster?: ElementTable<'terminal'>['Raster']): Item {
  const { Box, Text } = ui
  const Svg = Raster === undefined && 'Svg' in ui ? (ui.Svg as ElementTable<'desktop'>['Svg']) : undefined
  let slime = null
  if (Raster !== undefined) {
    slime = <Raster key="empty-slime" columns={SLEEPING_COLUMNS} rows={SLEEPING_ROWS} cells={sleepingCells()} />
  } else if (Svg !== undefined) {
    const { art, palette } = sleepingPixels()
    const drawn = spriteSvg([gridToPixels(art, palette)], SLEEPING_PX, 0)
    slime = <Svg key="empty-slime" source={drawn.source} alt="a sleeping slime" width={drawn.width} height={drawn.height} />
  }
  if (slime === null) return { key: 'empty', rows: 1, node: <Text dimColor>{text}</Text> }
  return {
    key: 'empty',
    rows: SLEEPING_ROWS,
    node: (
      <Box flexDirection="row" height={SLEEPING_ROWS}>
        <Box width={SLEEPING_COLUMNS + 1} flexShrink={0}>
          {slime}
        </Box>
        <Box flexDirection="column" height={SLEEPING_ROWS}>
          <Text dimColor>z z</Text>
          <Text dimColor>{text}</Text>
        </Box>
      </Box>
    ),
  }
}
