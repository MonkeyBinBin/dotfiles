import { expect, test } from 'claude-code/testing'

import { SKILL_COLORS, colorFor, toHex } from './colors'
import { FAVORITES, commandText, slotsFor } from './register'
import { ICON, SLOT_ROWS, hotbarLines, labelOf, slotWidth } from './hotbar-client'

// The slots' names as the hotbar Client was handed them.
const slotNames = async (ui: { find: (query: { type: 'Client' }) => Promise<{ props?: unknown } | undefined> }) =>
  (((await ui.find({ type: 'Client' }))?.props as { props?: { slots?: { name: string }[] } } | undefined)?.props?.slots ?? []).map(
    slot => slot.name,
  )

// What the hotbar Client drew, row by row of Text.
const hotbarText = async (ui: { findAll: (query: { type: 'Text'; in: string }) => Promise<readonly { text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text', in: 'hotbar' })).map(row => row.text ?? '').join('|')

const HINT_PROPS = { isDraft: false, isWorking: false, hint: '? for shortcuts' } as const

test('up to eight slots each get their own colour, then it wraps', () => {
  const eight = Array.from({ length: 8 }, (_, slot) => colorFor(slot))
  expect(new Set(eight).size).toBe(8)
  expect(colorFor(8)).toBe(colorFor(0))
  expect(SKILL_COLORS).toContain(colorFor(3))
  expect(toHex(0x05aa9f)).toBe('#05aa9f')
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
  expect(await slotNames(ui)).toEqual(['gitlab-mr-open', 'issue-start'])
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
  expect(await slotNames(ui)).toEqual(['gitlab-mr-open', 'issue-start'])
  const shown = (await ui.findAll({ type: 'Text' })).map(row => row.text ?? '').join('|')
  expect(shown).toContain('engine hint')
  // The engine's line stays first, the hotbar under it.
  const top = await ui.find({ type: 'Box' })
  const kinds = (top?.children ?? []).map(child => (child as { type?: string }).type)
  expect(kinds).toEqual(['Text', 'Box'])
  // Each slot one row: edged, iconed and labelled, with no number key or count.
  const bar = await hotbarText(ui)
  expect(bar).toContain('▕')
  expect(bar).toContain('gitlab-mr-open')
  expect(bar).toContain(ICON)
  expect(bar).toContain('▏')
  expect(bar).not.toContain('╭')
  expect(bar).not.toMatch(/[1-9]/)
})

test('the most used skills join the project ones, most used first', () => {
  const known = ['commit', 'code-review', 'simplify', 'loop', 'run', 'issue-start', 'never']
  const uses = { commit: 9, 'code-review': 4, simplify: 4, loop: 1, run: 2, 'issue-start': 30, 'gone-now': 50, never: 0 }
  // The project's own come first and are not repeated; a skill the session no longer has gets no slot.
  expect(slotsFor(['issue-start'], uses, known)).toEqual(['issue-start', 'commit', 'code-review', 'simplify', 'run'])
  expect(FAVORITES).toBe(4)
  expect(slotsFor([], {}, known)).toEqual([])
  expect(slotsFor(['issue-start'], {}, [])).toEqual(['issue-start'])
})

test("reads rpg-hud's skill counts for the favourite slots", async ($, on) => {
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', async () => ({ value: '/proj' }))
  on('fs.exists', async () => ({ value: false }))
  on('state.get', async (_$, e, next) => {
    const ref = e as unknown as { plugin: string; key: string }
    if (ref.plugin !== 'rpg-hud') return next(e)
    if (ref.key === 'progress') return { value: { value: { skillUses: { commit: 3, simplify: 5 } }, version: 1 } } as never
    return { value: { value: { skills: [{ name: 'commit' }, { name: 'simplify' }], gear: [] }, version: 1 } } as never
  })
  on('ui.render', { component: 'PromptHint' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>engine hint</Text>
  })

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'skill-bar', surface: 'terminal', component: 'PromptHint', props: HINT_PROPS })
  expect(await slotNames(ui)).toEqual(['simplify', 'commit'])
  // No use counts or stars on the slots.
  const bar = await hotbarText(ui)
  expect(bar).not.toContain('×')
  expect(bar).not.toContain('★')
})

// --- The hotbar ---

const hotbarWorld = (on: Parameters<Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>>[1], fills: string[]) => {
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', async () => ({ value: '/proj' }))
  on('fs.exists', async () => ({ value: true }))
  on('fs.list', async () => ({
    value: ['commit', 'issue-start'].map(name => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })),
  }))
  on('prompt.fill', async (_$, e) => {
    fills.push(e.text)
    return { isFilled: true }
  })
  on('ui.render', { component: 'PromptHint' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>engine hint</Text>
  })
}

test('a click anywhere on a slot casts it', async ($, on) => {
  const fills: string[] = []
  hotbarWorld(on, fills)
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'skill-bar', surface: 'terminal', component: 'PromptHint', props: HINT_PROPS })
  // The second slot starts one gap past the first, on the same single row.
  const second = slotWidth({ label: 'commit' }) + 1
  await ui.pointer({ type: 'down', x: second + 2, y: 0, button: 'left', in: 'hotbar' })
  await ui.pointer({ type: 'up', x: second + 2, y: 0, button: 'left', in: 'hotbar' })
  expect(fills).toEqual(['/issue-start '])
})

test('number keys no longer cast', async ($, on) => {
  const fills: string[] = []
  hotbarWorld(on, fills)
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'skill-bar', surface: 'terminal', component: 'PromptHint', props: HINT_PROPS })
  await ui.key({ key: '1', in: 'hotbar' }).catch(() => undefined)
  expect(fills).toEqual([])
})

test('other surfaces draw a button a slot, iconed like the hotbar', async ($, on) => {
  hotbarWorld(on, [])
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'skill-bar', surface: 'desktop', component: 'PromptHint', props: HINT_PROPS })
  const buttons = (await ui.findAll({ type: 'Button' })).map(b => b.props?.label)
  expect(buttons).toEqual([`${ICON} commit`, `${ICON} issue-start`])
})

test('slots wrap into lines that fit the bar', () => {
  expect(hotbarLines([10, 10, 10], 40).map(line => line.map(one => one.index))).toEqual([[0, 1, 2]])
  expect(hotbarLines([10, 10, 10], 25)).toEqual([
    [
      { index: 0, x: 0 },
      { index: 1, x: 11 },
    ],
    [{ index: 2, x: 0 }],
  ])
  // A slot wider than the bar still gets a line of its own.
  expect(hotbarLines([50], 30)).toEqual([[{ index: 0, x: 0 }]])
  expect(SLOT_ROWS).toBe(1)
})

test('slot labels and widths', () => {
  expect(labelOf('mattpocock-skills:diagnosing-bugs')).toBe('diagnosing-bugs')
  expect(labelOf('a-very-long-skill-name-indeed')).toBe('a-very-long-skill…')
  // Edge, padding, the two-column ⚡, a space, the label, padding, edge.
  expect(slotWidth({ label: 'commit' })).toBe('commit'.length + 7)
})

