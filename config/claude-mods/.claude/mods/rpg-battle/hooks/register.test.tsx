import { expect, test } from 'claude-code/testing'

import { comboLabel, groupIcon, rowIcon, skillIcon } from './register'

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
