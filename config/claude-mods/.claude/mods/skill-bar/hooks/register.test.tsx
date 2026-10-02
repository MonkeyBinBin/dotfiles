import { expect, test } from 'claude-code/testing'

import { ICON_ROWS, ICON_WIDTH, SCROLL, SKILL_COLORS, colorFor, composeIcon, toHex } from './icons'
import { commandText } from './register'

const HINT_PROPS = { isDraft: false, isWorking: false, hint: '? for shortcuts' } as const

// Decode one Raster cell: [codePoint, foreground, background].
const cellAt = (cells: string, row: number, col: number) => {
  const bytes = Uint8Array.from(atob(cells), ch => ch.charCodeAt(0))
  const words = new Uint32Array(bytes.buffer)
  const at = (row * ICON_WIDTH + col) * 3
  return [words[at], words[at + 1], words[at + 2]]
}

test('paints the scroll in half blocks, its ends in the skill colour', () => {
  const cells = composeIcon(SCROLL, 0x123456)
  expect(atob(cells).length).toBe(ICON_WIDTH * ICON_ROWS * 12)
  // Col 0: a rolled end top and bottom, in the tint.
  expect(cellAt(cells, 0, 0)).toEqual([0x2580, 0x123456, 0x123456])
  // Col 1: parchment over ink, untouched by the tint.
  expect(cellAt(cells, 0, 1)).toEqual([0x2580, 0xf0dcaa, 0x6d4220])
})

test('up to eight slots each get their own colour, then it wraps', () => {
  const eight = Array.from({ length: 8 }, (_, slot) => colorFor(slot))
  expect(new Set(eight).size).toBe(8)
  expect(colorFor(8)).toBe(colorFor(0))
  expect(SKILL_COLORS).toContain(colorFor(3))
  expect(toHex(0x05aa9f)).toBe('#05aa9f')
})

test('leaves empty pixels see-through', () => {
  const cells = composeIcon(['Y...', '..k.'])
  // Top only: upper half over the default background.
  expect(cellAt(cells, 0, 0)).toEqual([0x2580, 0xb5793c, 0x01000000])
  // Neither: a plain space.
  expect(cellAt(cells, 0, 1)).toEqual([0x20, 0x01000000, 0x01000000])
  // Bottom only: the lower half, so the top stays see-through.
  expect(cellAt(cells, 0, 2)).toEqual([0x2584, 0x6d4220, 0x01000000])
})

test('a press fills the slash command with room for arguments', () => {
  expect(commandText('issue-start')).toBe('/issue-start ')
})

test('refills the slots after a /clear', async ($, on) => {
  let present = ['issue-start']
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('classic.SessionStart', async () => ({}))
  on('session.cwd', async () => ({ value: '/proj' }))
  on('fs.exists', async () => ({ value: true }))
  on('fs.list', async () => ({
    value: present.map(name => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })),
  }))
  on('ui.render', { component: 'PromptHint' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>engine hint</Text>
  })

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  // Only the clear hook can pick up the new list: no turn completes in between.
  present = ['gitlab-mr-open', 'issue-start']
  await $.classic.SessionStart({ source: 'clear' })
  const ui = await $.ui.mount({ plugin: 'skill-bar', surface: 'terminal', component: 'PromptHint', props: HINT_PROPS })
  const buttons = (await ui.findAll({ type: 'Button' })).map(b => b.props?.label)
  expect(buttons).toEqual(['gitlab-mr-open', 'issue-start'])
})

test('draws one slot per project skill under the engine hint line', async ($, on) => {
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', async () => ({ value: '/proj' }))
  on('fs.exists', async (_$, e) => ({ value: e.path.startsWith('/proj/.claude/skills') && !e.path.includes('notes') }))
  on('fs.list', async () => ({
    value: [
      { name: 'issue-start', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
      { name: 'gitlab-mr-open', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
      { name: '.DS_Store', kind: 'file', size: 10, mtimeMs: 0, isLink: false },
    ],
  }))
  on('ui.render', { component: 'PromptHint' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>engine hint</Text>
  })

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'skill-bar', surface: 'terminal', component: 'PromptHint', props: HINT_PROPS })
  const buttons = (await ui.findAll({ type: 'Button' })).map(b => b.props?.label)
  expect(buttons).toEqual(['gitlab-mr-open', 'issue-start'])
  expect((await ui.findAll({ type: 'Raster' })).length).toBe(2)
  const shown = (await ui.findAll({ type: 'Text' })).map(row => row.text ?? '').join('|')
  expect(shown).toContain('engine hint')
  // The engine's line stays first, the slots under it.
  const top = await ui.find({ type: 'Box' })
  const kinds = (top?.children ?? []).map(child => (child as { type?: string }).type)
  expect(kinds).toEqual(['Text', 'Box'])
})
