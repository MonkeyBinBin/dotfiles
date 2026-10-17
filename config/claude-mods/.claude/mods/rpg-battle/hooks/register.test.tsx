import { expect, mock, test } from 'claude-code/testing'

import { CAST_COLUMNS, castCells, CHANNEL_COLUMNS, channelText, comboColor, comboLabel, CRIT_DAMAGE, damageOf, FLASH_TICKS, flashCells, formatDamage, groupIcon, landingOf, landingText, rowIcon, skillIcon } from './register'

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
    expect(shown).toContain('🔥')
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`adds MISS under a failed result on ${surface}`, async ($, on) => {
    on('ui.render', { component: 'ToolResult' }, async ($$, e) => {
      const { Text } = $$.ui.resolve(e)
      return <Text>Error: exit 1</Text>
    })
    const ui = await $.ui.mount({
      plugin: 'rpg-battle', surface, component: 'ToolResult',
      props: { tool_use_id: 't1', tool: 'Bash', output: 'exit 1', isErrored: true },
    })
    const shown = (await ui.findAll({ type: 'Text' })).map(row => row.text ?? '').join('|')
    expect(shown).toContain('Error: exit 1')
    expect(shown).toContain('MISS!')
  })
}

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

test('on desktop the cast bar charges as a drawing, flashes as it lands, then clears', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.render', { component: 'ToolUse' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>Bash(sleep 1)</Text>
  })
  const row = { tool_use_id: 'd1', tool: 'Bash', input: { command: 'sleep 1' }, isRunning: true, isErrored: false, isInterrupted: false }
  const ui = await $.ui.mount({ plugin: 'rpg-battle', surface: 'desktop', component: 'ToolUse', props: row })
  const bars = async () => (await ui.findAll({ type: 'Svg' })).map(svg => ({ alt: String(svg.props.alt), source: String(svg.props.source) }))

  const charging = await bars()
  expect(charging).toHaveLength(1)
  expect(charging[0]?.alt).toBe('casting')
  expect(charging[0]?.source).toContain('repeatCount="indefinite"')
  expect((await ui.findAll({ type: 'Svg' }))[0]?.props.height).toBe(6)

  await ui.redraw({ ...row, isRunning: false, isErrored: true })
  expect((await bars())[0]?.alt).toBe('MISS')
  await clock.advance(80 * (FLASH_TICKS + 1))
  expect(await bars()).toHaveLength(0)
})

test('a hit deals the damage it brought back; a big haul lands as a critical', () => {
  expect(damageOf(undefined)).toBe(0)
  expect(damageOf('abc')).toBe(3)
  expect(damageOf({ stdout: 'ok' })).toBe(JSON.stringify({ stdout: 'ok' }).length)
  expect(formatDamage(950)).toBe('950')
  expect(formatDamage(1234)).toBe('1.2k')
  expect(formatDamage(24_400)).toBe('24k')
  expect(landingText('hit', 0)).toEqual({ text: ' HIT!', color: 'success' })
  expect(landingText('hit', 1234)).toEqual({ text: ' HIT! -1.2k', color: 'success' })
  expect(landingText('hit', CRIT_DAMAGE)).toEqual({ text: ' CRITICAL! -10k', color: 'warning' })
  expect(landingText('miss', 99).text).toBe(' MISS')
  expect(landingText('fled').dimColor).toBe(true)
})

test('long runs climb the combo tiers', () => {
  expect(comboLabel(9)).toBe(' ×9 COMBO')
  expect(comboLabel(10)).toBe(' ×10 SUPER COMBO')
  expect(comboLabel(20)).toBe(' ×20 ULTRA COMBO')
  expect([comboColor(3), comboColor(10), comboColor(25)]).toEqual(['warning', 'permission', 'error'])
})

test('a long call channels: its seconds tick beside the engine\'s background hint', async ($, on) => {
  expect(channelText(0)).toBe('     0s')
  expect(channelText(12_400)).toBe('    12s')
  expect(channelText(65_000)).toBe(' 1m 05s')
  expect(channelText(65_000)).toHaveLength(CHANNEL_COLUMNS)

  const clock = mock.clock(on)
  on('ui.render', { component: 'ToolUse' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>Bash(sleep 30)</Text>
  })
  on('ui.render', { component: 'ToolProgress' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  const row = { tool_use_id: 'c1', tool: 'Bash', input: { command: 'sleep 30' }, isRunning: true, isErrored: false, isInterrupted: false }
  await $.ui.mount({ plugin: 'rpg-battle', surface: 'terminal', component: 'ToolUse', props: row })
  await clock.advance(3000)
  const pill = await $.ui.mount({
    plugin: 'rpg-battle',
    surface: 'terminal',
    component: 'ToolProgress',
    requestId: 'c1',
    props: { tool_use_id: 'c1', kind: 'background_hint', hint: '(ctrl+b to run in background)' },
  })
  const shown = (await pill.findAll({ type: 'Text' })).map(found => found.text).join('|')
  expect(shown).toContain('⌛ Channeling')
  expect(shown).toContain(' · ctrl+b to run in background')
  expect(shown).not.toContain('(ctrl+b')
  expect((await pill.findAll({ type: 'Raster' })).some(raster => raster.key === 'channel')).toBe(true)
})
