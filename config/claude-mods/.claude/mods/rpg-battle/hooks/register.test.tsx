import { expect, mock, test } from 'claude-code/testing'

import { CAST_COLUMNS, castCells, comboLabel, FLASH_TICKS, flashCells, groupIcon, landingOf, rowIcon, skillIcon } from './register'

const ROW = { tool: 'Bash', isErrored: false, isInterrupted: false }

test('gives each kind of tool its skill', () => {
  expect(skillIcon('Bash')).toBe('🔥')
  expect(skillIcon('TaskStop')).toBe('🔥')
  expect(skillIcon('Edit')).toBe('🔨')
  expect(skillIcon('mcp__github__search')).toBe('🔮')
  expect(skillIcon('SomethingNew')).toBe('🎯')
})

test('marks a failed or fled call over its skill', () => {
  expect(rowIcon(ROW)).toBe('🔥')
  expect(rowIcon({ ...ROW, isErrored: true })).toBe('💀')
  expect(rowIcon({ ...ROW, isErrored: true, isInterrupted: true })).toBe('🚫')
})

test('marks a folded run by its worst call', () => {
  const ok = { isErrored: false, isInterrupted: false }
  expect(groupIcon([ok, ok])).toBe('🌀')
  expect(groupIcon([ok, { ...ok, isErrored: true }])).toBe('💀')
  expect(groupIcon([{ ...ok, isErrored: true }, { ...ok, isInterrupted: true }])).toBe('🚫')
})

test('calls a run of three or more a combo', () => {
  expect(comboLabel(2)).toBeUndefined()
  expect(comboLabel(4)).toBe(' ×4 COMBO')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`keeps the engine's tool row on ${surface}`, async ($, on) => {
    on('ui.render', { component: 'ToolUse' }, async ($$, e) => {
      const { Text } = $$.ui.resolve(e)
      return <Text>Bash(ls)</Text>
    })
    const ui = await $.ui.mount({
      plugin: 'rpg-battle', surface, component: 'ToolUse',
      props: { tool_use_id: 't1', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false },
    })
    const shown = (await ui.findAll({ type: 'Text' })).map(row => row.text ?? '').join('|')
    expect(shown).toContain('Bash(ls)')
    if (surface === 'terminal') expect(shown).toContain('🔥')
    else expect(shown).not.toContain('🔥')
  })
}

test('adds MISS under a failed result', async ($, on) => {
  on('ui.render', { component: 'ToolResult' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>Error: exit 1</Text>
  })
  const ui = await $.ui.mount({
    plugin: 'rpg-battle', surface: 'terminal', component: 'ToolResult',
    props: { tool_use_id: 't1', tool: 'Bash', output: 'exit 1', isErrored: true },
  })
  const shown = (await ui.findAll({ type: 'Text' })).map(row => row.text ?? '').join('|')
  expect(shown).toContain('Error: exit 1')
  expect(shown).toContain('MISS!')
})

test('charges the cast bar one cell per tick, then pulses full', () => {
  const at = (tick: number) => castCells(0xff0000, tick).map(([glyph]) => String.fromCharCode(glyph)).join('')
  expect(at(0)).toBe(`█${'─'.repeat(CAST_COLUMNS - 1)}`)
  expect(at(3)).toBe(`━━━█${'─'.repeat(CAST_COLUMNS - 4)}`)
  expect(at(CAST_COLUMNS)).toBe('━'.repeat(CAST_COLUMNS))
})

test('lands as a hit, a red miss or a grey flight', () => {
  expect(landingOf(ROW)).toBe('hit')
  expect(landingOf({ ...ROW, isErrored: true })).toBe('miss')
  expect(landingOf({ ...ROW, isErrored: true, isInterrupted: true })).toBe('fled')
  expect(flashCells('hit', 0x00ff00, 0)[0]?.[1]).toBe(0xffffff)
  expect(flashCells('miss', 0x00ff00, 0)[0]?.[1]).toBe(0xff3b3b)
  expect(flashCells('fled', 0x00ff00, 0)[0]?.[1]).toBe(0x808080)
})

test('casts under a running row, flashes as it lands, then clears', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.render', { component: 'ToolUse' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>Bash(sleep 1)</Text>
  })
  const row = { tool_use_id: 'c1', tool: 'Bash', input: { command: 'sleep 1' }, isRunning: true, isErrored: false, isInterrupted: false }
  const ui = await $.ui.mount({ plugin: 'rpg-battle', surface: 'terminal', component: 'ToolUse', props: row })
  const texts = async () => (await ui.findAll({ type: 'Text' })).map(found => found.text).join('|')

  expect(await ui.findAll({ type: 'Raster' })).toHaveLength(1)
  expect(await texts()).toContain('casting')
  await clock.advance(400)
  expect(await ui.findAll({ type: 'Raster' })).toHaveLength(1)

  await ui.redraw({ ...row, isRunning: false })
  expect(await texts()).toContain('HIT!')
  await clock.advance(80 * (FLASH_TICKS + 1))
  expect(await ui.findAll({ type: 'Raster' })).toHaveLength(0)
  expect(await texts()).not.toContain('HIT!')
})

test('draws no cast bar for a row that was never seen running', async ($, on) => {
  on('ui.render', { component: 'ToolUse' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>Read(a.ts)</Text>
  })
  const ui = await $.ui.mount({
    plugin: 'rpg-battle', surface: 'terminal', component: 'ToolUse',
    props: { tool_use_id: 'r1', tool: 'Read', input: { file_path: 'a.ts' }, isRunning: false, isErrored: false, isInterrupted: false },
  })
  expect(await ui.findAll({ type: 'Raster' })).toHaveLength(0)
})
