import { expect, test } from 'claude-code/testing'

import { PANEL, SKILL_COLORS, WHITE, colorFor, colorsFor, mix, toHex } from './colors'
import { FAVORITES, commandText, hotbarSlot, hotbarSlots, slotsFor } from './register'
import {
  BURST,
  COOLDOWN_TICKS,
  COOLING,
  INK,
  READY_TICKS,
  SLOT_ROWS,
  cooldownParts,
  hotbarLines,
  labelOf,
  runeOf,
  runesOf,
  slotWidth,
} from './hotbar-client'

// The slots' names as the hotbar Client was handed them.
const slotNames = async (ui: { find: (query: { type: 'Client' }) => Promise<{ props?: unknown } | undefined> }) =>
  (((await ui.find({ type: 'Client' }))?.props as { props?: { slots?: { name: string }[] } } | undefined)?.props?.slots ?? []).map(
    slot => slot.name,
  )

// The hotbar Client's Text rows with their colours.
const hotbarRows = async (ui: { findAll: (query: { type: 'Text'; in: string }) => Promise<readonly { text?: string; props: { backgroundColor?: unknown } }[]> }) =>
  await ui.findAll({ type: 'Text', in: 'hotbar' })

// What the hotbar Client drew, row by row of Text.
const hotbarText = async (ui: { findAll: (query: { type: 'Text'; in: string }) => Promise<readonly { text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text', in: 'hotbar' })).map(row => row.text ?? '').join('|')

const HINT_PROPS = { isDraft: false, isWorking: false, hint: '? for shortcuts' } as const

test('a skill keeps its colour wherever it sits, and neighbours never match', () => {
  expect(colorFor('commit')).toBe(colorFor('commit'))
  expect(SKILL_COLORS).toContain(colorFor('issue-start'))
  // The same name keeps its colour in another bar, unless its left neighbour already wears it.
  expect(colorsFor(['commit'])[0]).toBe(colorFor('commit'))
  expect(colorsFor(['zzz', 'commit'])[1]).toBe(colorFor('commit') === colorFor('zzz') ? colorsFor(['zzz', 'commit'])[1] : colorFor('commit'))
  const names = Array.from({ length: 40 }, (_, at) => `skill-${at}`)
  const colors = colorsFor(names)
  colors.slice(1).forEach((color, at) => expect(color).not.toBe(colors[at]))
  // The shared rpg red.
  expect(SKILL_COLORS).toContain(0xff5f5f)
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
  // Each slot one row: a rune keycap, then the label, with no number key or count.
  const bar = await hotbarText(ui)
  expect(bar).toContain('▐')
  expect(bar).toContain('G')
  expect(bar).toContain('▌')
  expect(bar).toContain('gitlab-mr-open')
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
  // Each favourite shows its use count dimmed; with no project slots there is nothing to divide.
  const bar = await hotbarText(ui)
  expect(bar).toContain('×5')
  expect(bar).toContain('×3')
  expect(bar).not.toContain('│')
  expect(bar).not.toContain('★')
})

test('a divider sets the favourites apart from the project skills', () => {
  const slots = hotbarSlots(['issue-start', 'commit', 'simplify'], 1, { commit: 12, simplify: 2 })
  expect(slots.map(slot => [slot.isFavorite ?? false, slot.isFirstFavorite ?? false, slot.uses])).toEqual([
    [false, false, undefined],
    [true, true, 12],
    [true, false, 2],
  ])
  // The divider and the count widen the slot.
  expect(slotWidth(slots[1]!)).toBe(slotWidth({ label: 'commit' }) + 2 + ' ×12'.length)
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
  const second = slotWidth({ label: 'commit' }) + 2
  await ui.pointer({ type: 'down', x: second + 2, y: 0, button: 'left', in: 'hotbar' })
  await ui.pointer({ type: 'up', x: second + 2, y: 0, button: 'left', in: 'hotbar' })
  expect(fills).toEqual(['/issue-start '])
})

test('number keys no longer cast', async ($, on) => {
  const fills: string[] = []
  hotbarWorld(on, fills)
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'skill-bar', surface: 'terminal', component: 'PromptHint', props: HINT_PROPS })
  await ui.key({ key: '1', in: 'hotbar' })
  expect(fills).toEqual([])
})

test('other surfaces draw a button a slot, beside a gem in its colour', async ($, on) => {
  hotbarWorld(on, [])
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'skill-bar', surface: 'desktop', component: 'PromptHint', props: HINT_PROPS })
  const buttons = await ui.findAll({ type: 'Button' })
  expect(buttons.map(b => b.props.label)).toEqual(['commit', 'issue-start'])
  // Each slot's gem wears its own colour.
  const gems = (await ui.findAll({ type: 'Text' })).filter(t => t.text === '◆').map(t => t.props.color)
  expect(gems).toHaveLength(2)
  expect(new Set(gems).size).toBe(2)
})

test('slots wrap into lines that fit the bar', () => {
  expect(hotbarLines([10, 10, 10], 40).map(line => line.map(one => one.index))).toEqual([[0, 1, 2]])
  expect(hotbarLines([10, 10, 10], 25)).toEqual([
    [
      { index: 0, x: 0 },
      { index: 1, x: 12 },
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
  // Spark, keycap, space, the label, space, spark.
  expect(slotWidth({ label: 'commit' })).toBe('commit'.length + 7)
  expect(runeOf('commit')).toBe('C')
  expect(runeOf('-x2')).toBe('X')
  expect(runeOf('…')).toBe('?')
})

test('no two slots share a rune', () => {
  expect(runesOf(['commit', 'code-review', 'cc', 'simplify'])).toEqual(['C', 'O', '1', 'S'])
  expect(runesOf(['…'])).toEqual(['1'])
})

test("each cell is a dark tint of its slot's colour, deeper under the pointer", () => {
  expect(mix(0xffffff, 0x000000, 0.5)).toBe(0x808080)
  const color = colorFor('commit')
  const slot = hotbarSlot('commit', color, 'C')
  expect(slot.rune).toBe('C')
  expect(slot.color).toBe(toHex(color))
  expect(slot.tint).toBe(toHex(mix(color, PANEL, 0.18)))
  expect(slot.glow).not.toBe(slot.tint)
  expect(slot.flash).toBe(toHex(mix(WHITE, color, 0.6)))
})

test('a cast slot sweeps back left to right, its text kept readable', () => {
  const text = ' commit '
  expect(cooldownParts(text, 0)).toEqual({ lit: '', edge: ' ', cool: 'commit ' })
  const half = cooldownParts(text, Math.floor(COOLDOWN_TICKS / 2))
  expect(half.lit + half.edge + half.cool).toBe(text)
  expect(half.lit.startsWith(' co')).toBe(true)
  expect(cooldownParts(text, COOLDOWN_TICKS)).toEqual({ lit: text, edge: '', cool: '' })
})

test('a click starts the cooldown and it ends on the clock', async ($, on) => {
  const fills: string[] = []
  hotbarWorld(on, fills)
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'skill-bar', surface: 'terminal', component: 'PromptHint', props: HINT_PROPS })
  await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: 'hotbar' })
  await ui.pointer({ type: 'up', x: 3, y: 0, button: 'left', in: 'hotbar' })
  expect(fills).toEqual(['/commit '])
  const cooling = async () => (await hotbarRows(ui)).some(row => row.props.backgroundColor === COOLING)
  expect(await cooling()).toBe(true)
  // The label stays whole while it cools, and a burst of sparks flies off the cast.
  expect((await hotbarText(ui)).replace(/\|/g, '')).toContain('commit')
  expect(await hotbarText(ui)).toContain(BURST[0])
  await ui.advance(80)
  expect(await hotbarText(ui)).toContain(BURST[1])
  await ui.advance(80 * COOLDOWN_TICKS)
  expect(await cooling()).toBe(false)
  // Cooled: the keycap flashes and the sparks pop for a moment, then all rests.
  const flash = toHex(mix(WHITE, colorsFor(['commit'])[0]!, 0.6))
  expect((await hotbarRows(ui)).some(row => row.props.backgroundColor === flash)).toBe(true)
  expect(await hotbarText(ui)).toContain('✦')
  await ui.advance(80 * (READY_TICKS + 1))
  expect((await hotbarRows(ui)).some(row => row.props.backgroundColor === flash)).toBe(false)
  await ui.pointer({ type: 'leave', x: 3, y: 0, in: 'hotbar' })
  expect(await hotbarText(ui)).not.toMatch(/[✦✧·]/)
})

test('a pressed keycap sinks until the release', async ($, on) => {
  const fills: string[] = []
  hotbarWorld(on, fills)
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'skill-bar', surface: 'terminal', component: 'PromptHint', props: HINT_PROPS })
  await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: 'hotbar' })
  const rune = (await hotbarRows(ui)).find(row => row.text === 'C')
  expect(rune?.props.backgroundColor).toBe(INK)
  expect(fills).toEqual([])
  // Released off the bar: it comes back up uncast.
  await ui.pointer({ type: 'up', x: 500, y: 0, button: 'left', in: 'hotbar' })
  expect(fills).toEqual([])
  expect((await hotbarRows(ui)).find(row => row.text === 'C')?.props.backgroundColor).not.toBe(INK)
})


test("a hovered slot's sparks twinkle once every few frames", async ($, on) => {
  hotbarWorld(on, [])
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'skill-bar', surface: 'terminal', component: 'PromptHint', props: HINT_PROPS })
  await ui.pointer({ type: 'move', x: 3, y: 0, in: 'hotbar' })
  expect(await hotbarText(ui)).toContain('✦')
  await ui.advance(80 * 2)
  expect(await hotbarText(ui)).toContain('✦')
  await ui.advance(80 * 2)
  expect(await hotbarText(ui)).toContain('✧')
  await ui.pointer({ type: 'leave', x: 3, y: 0, in: 'hotbar' })
  expect(await hotbarText(ui)).not.toMatch(/[✦✧]/)
})

test('on desktop pressing a slot puts its command in the prompt', async ($, on) => {
  const fills: string[] = []
  hotbarWorld(on, fills)
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'skill-bar', surface: 'desktop', component: 'PromptHint', props: HINT_PROPS })
  await ui.press({ key: 'cast-commit' })
  expect(fills).toEqual(['/commit '])
})
