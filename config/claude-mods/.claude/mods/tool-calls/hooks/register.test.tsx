import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { HERO_FRAMES } from './hero-cells'
import { HURT_MS, barFill, dividerSides, heroStats, rankFor, normalizeCall, oneLine, pickFrame, pickMood } from './register'

const PANE_PROPS = {
  title: 'Spell book',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
} as const

const mountPane = ($: Engine, surface: 'terminal' | 'desktop') =>
  $.ui.mount({ plugin: 'tool-calls', surface, component: 'Pane', requestId: 'tool-calls', props: PANE_PROPS })

for (const surface of ['terminal', 'desktop'] as const) {
  test(`logs calls and loses a heart per failure on ${surface}`, async ($, on) => {
    mock.clock(on)
    on('tool.call', async (_$, e) =>
      e.tool === 'Bash' ? { result: 'boom', text: 'boom', isError: true as const } : { result: { text: 'ok' } },
    )
    await $.tool.call({ tool: 'Read', file_path: '/x/y/a.md' })
    await $.tool.call({ tool: 'Bash', command: 'false' })

    const ui = await mountPane($, surface)
    const shown = (await ui.findAll({ type: 'Text' })).map(row => row.text ?? '').join('|')
    expect(shown).toContain('a.md')
    expect(shown).toContain(surface === 'terminal' ? `HP |${'█'.repeat(13)}|${'░'.repeat(3)}| 4/5` : 'HP 4/5')
  })

  test(`shows the empty log on ${surface}`, async $ => {
    const ui = await mountPane($, surface)
    const shown = (await ui.findAll({ type: 'Text' })).map(row => row.text ?? '')
    expect(shown).toContain('No spells cast yet. The tome awaits.')
  })
}

test('draws the hero portrait on the terminal', async $ => {
  const terminal = await mountPane($, 'terminal')
  expect(await terminal.find({ type: 'Raster' })).toBeDefined()
})

test('levels up every ten calls and caps lost hearts at five', () => {
  const ok = { id: 'x', tool: 'Read', summary: '', startedAt: 0, status: 'ok' } as const
  const err = { ...ok, status: 'err' } as const
  expect(heroStats(Array(23).fill(ok))).toEqual({ level: 3, xp: 3, hp: 5 })
  expect(heroStats(Array(12).fill(err)).hp).toBe(0)
})

test('reads entries the first pane version stored', () => {
  expect(normalizeCall({ id: 'a', tool: 'Read', isDone: true }).status).toBe('ok')
  expect(normalizeCall({ id: 'b', tool: 'Bash', isDone: false }).status).toBe('run')
})

test('scrolls the log under a pinned header', async ($, on) => {
  mock.clock(on)
  on('tool.call', async () => ({ result: { text: 'ok' } }))
  for (let n = 1; n <= 15; n += 1) {
    await $.tool.call({ tool: 'Read', file_path: `/x/f${n}.md` })
  }
  // A 22-row body less the header (1 + 10), the divider (1) and the log title and rule (2) leaves 8 log rows.
  const props = { ...PANE_PROPS, scroll: { offset: 0, bodyRows: 22 } }
  const ui = await $.ui.mount({ plugin: 'tool-calls', surface: 'terminal', component: 'Pane', requestId: 'tool-calls', props })
  const shown = async () => (await ui.findAll({ type: 'Text' })).map(row => row.text ?? '').join('|')
  const scroll = (by: number) =>
    $.ui.scroll({ component: 'Pane', requestId: 'tool-calls', offset: 0, by, bodyRows: 22, contentRows: 22, origin: { kind: 'person' } })

  expect(await shown()).toContain('1–8 of 15')
  expect(await shown()).toContain('f15.md')

  await scroll(3)
  expect(await shown()).toContain('4–11 of 15')
  expect(await shown()).not.toContain('f15.md')
  expect(await shown()).toContain('CLAUDE THE WIZARD')

  await scroll(100)
  expect(await shown()).toContain('8–15 of 15')
  expect(await shown()).toContain('f1.md')
})

test('squeezes a multi-line command into one cut line', () => {
  expect(oneLine('cat <<EOF\n  hello\nEOF', 40)).toBe('cat <<EOF hello EOF')
  const cut = oneLine('a'.repeat(30) + 'b'.repeat(30), 11)
  expect(cut).toHaveLength(11)
  expect(cut).toBe('aaaaa…bbbbb')
})

test('draws a multi-line command as one log row', async ($, on) => {
  mock.clock(on)
  on('tool.call', async () => ({ result: { text: 'ok' } }))
  await $.tool.call({ tool: 'Bash', command: 'echo one\necho two\necho three' })

  const ui = await mountPane($, 'terminal')
  const rows = (await ui.findAll({ type: 'Text' })).map(row => row.text ?? '')
  expect(rows).toContain('echo one echo two echo three')
  expect(rows.some(row => row.includes('\n'))).toBe(false)
})

test('picks the wizard mood from running calls and recent failures', () => {
  expect(pickMood(0, 0)).toBe('idle')
  expect(pickMood(2, 0)).toBe('cast')
  expect(pickMood(2, 50)).toBe('hurt')
})

test('steps each mood through its frames and loops', () => {
  expect(pickFrame('idle', 0)).toBe(HERO_FRAMES.idle[0])
  expect(pickFrame('idle', 5)).toBe(HERO_FRAMES.idle[1])
  expect(pickFrame('cast', 2)).toBe(HERO_FRAMES.cast[1])
  expect(pickFrame('cast', 4)).toBe(HERO_FRAMES.cast[0])
})

test('puffs smoke on the pane after a failed call, then rests', async ($, on) => {
  const clock = mock.clock(on)
  const blitted: string[] = []
  on('ui.blit', async (_$, e) => {
    if ('cells' in e) blitted.push(e.cells)
    return { value: {} }
  })
  on('tool.call', async () => ({ result: 'boom', text: 'boom', isError: true as const }))

  await mountPane($, 'terminal')
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await clock.advance(100)
  expect(blitted).toContain(HERO_FRAMES.hurt[0])

  await clock.advance(HURT_MS + 600)
  expect(HERO_FRAMES.idle).toContain(blitted.at(-1))
})

test('fills the HP and XP bars in proportion', () => {
  expect(barFill(5, 5)).toBe(16)
  expect(barFill(0, 5)).toBe(0)
  expect(barFill(4, 5)).toBe(13)
  expect(barFill(3, 10)).toBe(5)
})

test('names the wizard by level', () => {
  expect(rankFor(1)).toBe('Apprentice')
  expect(rankFor(3)).toBe('Adept')
  expect(rankFor(8)).toBe('Archmage')
  expect(rankFor(12)).toBe('Grand Wizard')
})

test('the stats column is as tall as the hero, failures or not', async $ => {
  const ui = await mountPane($, 'terminal')
  const accent = await ui.findAll({ type: 'Text', text: '┃' })
  expect(accent).toHaveLength(10)
  const shown = (await ui.findAll({ type: 'Text' })).map(row => row.text ?? '')
  expect(shown).toContain('✓ no spells fizzled')
})

test('shows a long tool name whole in the log', async ($, on) => {
  mock.clock(on)
  on('tool.call', async () => ({ result: { text: 'ok' } }))
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
  const ui = await mountPane($, 'terminal')
  const rows = (await ui.findAll({ type: 'Text' })).map(row => row.text ?? '')
  expect(rows).toContain('AskUserQuestion')
})

test('the divider fills the pane with its stars in the middle', () => {
  for (const width of [40, 61]) {
    const { left, right } = dividerSides(width)
    expect(left.length + ' ✧ ⋆ ✦ ⋆ ✧ '.length + right.length).toBe(width)
    expect(Math.abs(left.length - right.length)).toBeLessThanOrEqual(1)
  }
})
