import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { HERO_FRAMES } from './hero-cells'
import { HURT_MS, pickFrame, pickMood } from './anim'
import { bossFor, countFailures, fightBoss } from './boss'
import { GIT_STATUS, diffArgv, isLinear, parseBag, parseGraphLine, parseStatus, parseWorktrees, shortAge } from './git'
import { campsOn } from './map'
import { parseDiff, rarityOf, splitBar } from './diff'
import { countPatch, patchSource } from './edit-card'
import { trailStops } from './map'
import { gaugeColor, heroStats, manaLeft, normalizeCall, rankFor, statusLayout } from './hero'
import { rosterOrder } from './pets'
import { campFor, skillOfPrompt, touchFile } from './register'
import { groupSkills, masteryStars } from './skills'
import { EMPTY_PROGRESS, newlyEarned } from './trophies'
import { barFill, oneLine } from './util'
import { centre, slotAt, slotLayout } from './menu-client'
import { sparkleTrail } from './skills-client'
import { pageItems } from './window'
import { CLASSES, CLASS_IDS, rankOf, rollClass } from './classes'
import { HERO_CLASS_FRAMES } from './hero-cells'

const PANE_PROPS = {
  title: 'Adventure',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 32 },
  view: {},
} as const

type Surface = 'terminal' | 'desktop'
type On = Parameters<typeof mock.clock>[0]

const mountPane = ($: Engine, surface: Surface, bodyRows = 32, bodyColumns = 60) =>
  $.ui.mount({
    plugin: 'rpg-hud',
    surface,
    component: 'Pane',
    requestId: 'rpg-hud',
    props: { ...PANE_PROPS, bodyColumns, scroll: { offset: 0, bodyRows } },
  })

const texts = async (ui: { findAll: (query: { type: 'Text' }) => Promise<readonly { text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(row => row.text ?? '')

const NO_GIT = { exitCode: 128, stdout: '', stderr: 'not a git repository', isStdoutTruncated: false, isStderrTruncated: false }

const fail = (text: string) => ({ result: text, text, isError: true as const })

type World = {
  // Answers each tool call; every call succeeds when absent.
  tool?: (e: { tool: string; command?: string }) => ReturnType<typeof fail> | undefined
  git?: (argv: readonly string[]) => { stdout: string } | undefined
  usage?: unknown
  // What the store holds at the start: another session's progress.
  stored?: Record<string, unknown>
}

// The world beneath the plugin: a clock, a store, a folder, and each noun the plugin calls answered.
// A test registers each of these once, before it first calls $.
const world = (on: On, options: World = {}) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const store = new Map<string, unknown>(Object.entries(options.stored ?? {}))
  on('store.get', async (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', async (_$, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('session.cwd', async () => ({ value: '/x' }))
  const toasts: string[] = []
  on('ui.toast', async (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined }
  })
  on('turn.complete', async () => ({ text: '' }))
  const fills: string[] = []
  on('prompt.fill', async (_$, e) => {
    fills.push(e.text)
    return { isFilled: true }
  })
  on('session.usage', async () => ({ value: options.usage ?? { startedAt: 0, rateLimits: [], context: { window: 200000 } } }) as never)
  on('process.run', async (_$, e) => {
    // The git config switches (`-c core.quotePath=false`) are the plugin's own; fixtures read the command after them.
    const argv = e.argv.filter((word, index, all) => word !== '-c' && all[index - 1] !== '-c')
    const answer = options.git?.(argv)
    return { value: answer === undefined ? NO_GIT : { ...NO_GIT, exitCode: 0, stderr: '', ...answer } }
  })
  on('tool.call', async (_$, e) => options.tool?.(e as never) ?? { result: { text: 'ok' } })
  return { clock, store, fills, toasts }
}

const failBash = (text: string): World['tool'] => e => (e.tool === 'Bash' ? fail(text) : undefined)

const SLOTS = ['spells', 'pets', 'map', 'skills', 'feats']
// A 60-column pane: five borderless slots of 12 columns.
const SLOT_COLUMNS = 12

// A click in the middle of the slot's icon on the terminal, a button press elsewhere.
const showTab = async ($: Engine, ui: Awaited<ReturnType<typeof mountPane>>, key: string, surface: Surface = 'terminal') => {
  if (surface !== 'terminal') return void (await ui.press({ key: `menu-${key}` }))
  const x = SLOTS.indexOf(key) * SLOT_COLUMNS + 5
  await ui.pointer({ type: 'down', x, y: 2, button: 'left', in: 'menu' })
  await ui.pointer({ type: 'up', x, y: 2, button: 'left', in: 'menu' })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`logs calls and loses a heart per failure on ${surface}`, async ($, on) => {
    world(on, { tool: failBash('boom') })
    await $.tool.call({ tool: 'Read', file_path: '/x/y/a.md' })
    await $.tool.call({ tool: 'Bash', command: 'false' })

    const ui = await mountPane($, surface)
    const shown = (await texts(ui)).join('|')
    expect(shown).toContain('a.md')
    expect(shown).toContain(`HP |${'█'.repeat(14)}|${'░'.repeat(4)}| 4/5`)
  })

  test(`opens on the spell book on ${surface}`, async ($, on) => {
    world(on)
    const ui = await mountPane($, surface)
    const shown = await texts(ui)
    expect(shown).toContain('📖 SPELL BOOK')
    expect(shown).toContain('No spells cast yet. The tome awaits.')
  })

  test(`the status panel stays on top whatever the menu shows on ${surface}`, async ($, on) => {
    world(on)
    const ui = await mountPane($, surface)
    for (const [key, title] of [['pets', '🐾 PARTY'], ['map', '🧭 WORLD MAP'], ['skills', '📜 SKILLS'], ['feats', '🏆 FEATS'], ['spells', '📖 SPELL BOOK']] as const) {
      await showTab($, ui, key, surface)
      const shown = await texts(ui)
      expect(shown).toContain(title)
      expect(shown).toContain('CLAUDE THE WIZARD')
    }
  })
}

test('draws the portrait and the icon menu on the terminal', async ($, on) => {
  world(on)
  const ui = await mountPane($, 'terminal')
  expect(await ui.findAll({ type: 'Raster' })).toHaveLength(1)
  const shown = (await ui.findAll({ type: 'Text', in: 'menu' })).map(row => (row.text ?? '').trim())
  // Five labels, the active one jewelled, and no hotkey digits.
  expect(shown).toContain('◆ SPELL ◆')
  expect(shown).toContain('FEATS')
  expect(shown.some(row => /^\d: /.test(row))).toBe(false)
})

test('a click anywhere in a slot picks it, and arrow keys step through the menu', async ($, on) => {
  world(on)
  const ui = await mountPane($, 'terminal')
  // The slot's right edge, on its label row.
  const x = 2 * SLOT_COLUMNS + SLOT_COLUMNS - 2
  await ui.pointer({ type: 'down', x, y: 4, button: 'left', in: 'menu' })
  await ui.pointer({ type: 'up', x, y: 4, button: 'left', in: 'menu' })
  expect(await texts(ui)).toContain('🧭 WORLD MAP')

  await ui.key({ key: 'right', in: 'menu' })
  expect(await texts(ui)).toContain('📜 SKILLS')
  await ui.key({ key: 'left', in: 'menu' })
  await ui.key({ key: 'left', in: 'menu' })
  expect(await texts(ui)).toContain('🐾 PARTY')
})

test('the active slot is a card: backdrop, gold brackets, jewelled label', async ($, on) => {
  world(on)
  const ui = await mountPane($, 'terminal')
  await showTab($, ui, 'skills')
  const label = await ui.find({ type: 'Text', text: ' ◆ SKILL ◆  ', in: 'menu' })
  expect(label?.props).toMatchObject({ bold: true, color: 'yellow', backgroundColor: '#2a2342' })
  const brackets = (await ui.findAll({ type: 'Text', in: 'menu' })).filter(row => row.text === '╭─' || row.text === '─╯')
  expect(brackets).toHaveLength(2)
  const idle = await ui.find({ type: 'Text', text: '   SPELL    ', in: 'menu' })
  expect(idle?.props).toMatchObject({ color: 'gray' })
  // No separators between the slots.
  const shown = (await ui.findAll({ type: 'Text', in: 'menu' })).map(row => row.text ?? '')
  expect(shown.some(row => /[│┬┴]/.test(row))).toBe(false)
})

test('a narrow, short pane drops the portrait and folds the menu into one line', async ($, on) => {
  world(on)
  const ui = await mountPane($, 'terminal', 24, 40)
  expect(await ui.findAll({ type: 'Raster' })).toHaveLength(0)
  expect((await texts(ui)).join('|')).toContain('📖 SPELL BOOK')
})

test('scrolls the spell book window under the fixed panel and menu', async ($, on) => {
  world(on)
  for (let n = 1; n <= 15; n += 1) {
    await $.tool.call({ tool: 'Read', file_path: `/x/f${n}.md` })
  }
  // 30 rows less the status panel (12), the icon menu (6) and the window's chrome (4) leave 8.
  const ui = await mountPane($, 'terminal', 30)
  const shown = async () => (await texts(ui)).join('|')
  const scroll = (by: number) =>
    $.ui.scroll({ component: 'Pane', requestId: 'rpg-hud', offset: 0, by, bodyRows: 30, contentRows: 30, origin: { kind: 'person' } })

  expect(await shown()).toContain('1–8/15')
  expect(await shown()).toContain('f15.md')

  await scroll(3)
  expect(await shown()).toContain('4–11/15')
  expect(await shown()).not.toContain('f15.md')
  expect(await shown()).toContain('CLAUDE THE WIZARD')

  await scroll(100)
  expect(await shown()).toContain('8–15/15')
  expect(await shown()).toContain('f1.md')
})

test('the menu fills the pane exactly, slots differing by one column at most', () => {
  for (const width of [56, 60, 63, 80]) {
    const { widths, starts } = slotLayout(width, 5)
    expect(widths.reduce((sum, one) => sum + one, 0)).toBe(width)
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1)
    expect(starts[0]).toBe(0)
  }
  const { starts } = slotLayout(60, 5)
  expect(starts).toEqual([0, 12, 24, 36, 48])
  expect(slotAt(0, starts, 60)).toBe(0)
  expect(slotAt(11, starts, 60)).toBe(0)
  expect(slotAt(12, starts, 60)).toBe(1)
  expect(slotAt(59, starts, 60)).toBe(4)
  expect(slotAt(60, starts, 60)).toBeUndefined()
})

test('centres a label with the odd column on the right', () => {
  expect(centre('MAP', 10)).toBe('   MAP    ')
  expect(centre('SPELL', 11)).toBe('   SPELL   ')
})

test('pages whole items and never cuts one', () => {
  const items = [1, 2, 3].map(n => ({ key: `k${n}`, rows: 4, node: null }))
  expect(pageItems(items, 0, 9).shown.map(item => item.key)).toEqual(['k1', 'k2'])
  expect(pageItems(items, 100, 9)).toMatchObject({ start: 3, end: 11, total: 12 })
})

test('fits the portrait only beside a usable stats column', () => {
  expect(statusLayout(60, true)).toEqual({ hasPortrait: true, statsWidth: 34, barWidth: 18 })
  expect(statusLayout(40, true).hasPortrait).toBe(false)
  expect(statusLayout(60, false).hasPortrait).toBe(false)
})

test('gauges turn yellow then red as they drain', () => {
  expect(gaugeColor(5, 5, 'green')).toBe('green')
  expect(gaugeColor(2, 5, 'green')).toBe('yellow')
  expect(gaugeColor(1, 5, 'green')).toBe('red')
})

test('the combo grows with each clean cast and breaks on a fizzle', async ($, on) => {
  world(on, { tool: failBash('boom') })
  for (let n = 0; n < 3; n += 1) await $.tool.call({ tool: 'Read', file_path: `/x/${n}.md` })
  await $.tool.call({ tool: 'Bash', command: 'false' })
  const ui = await mountPane($, 'terminal')
  const shown = (await texts(ui)).join('|')
  expect(shown).toContain('⚡×0')
  expect(shown).toContain(' best 3')
})

test('the boss stands in the status panel', async ($, on) => {
  world(on, { tool: failBash('Found 4 errors in 2 files.') })
  await $.tool.call({ tool: 'Bash', command: 'npx tsc --noEmit' })
  const ui = await mountPane($, 'terminal')
  expect((await texts(ui)).join('|')).toContain('☠ Type Wraith ')
})

test('a summoned subagent joins the party and reports back', async ($, on) => {
  world(on)
  on('agent.spawn', async () => ({ model: 'claude-haiku-4-5', agentId: 'agent-1' }))
  await $.agent.spawn({ prompt: 'Find the config', description: 'Find config', subagentType: 'Explore' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'PLUGIN_DIRS', agentId: 'agent-1' } as never)

  const ui = await mountPane($, 'terminal')
  await showTab($, ui, 'pets')
  let shown = (await texts(ui)).join('|')
  expect(shown).toContain('Scout Hawk')
  expect(shown).toContain('1 questing · 1 summoned')
  expect(shown).toContain('Find config')
  expect(shown).toContain('⚔ 1 · Grep PLUGIN_DIRS')
  // The portrait and the hawk.
  expect(await ui.findAll({ type: 'Raster' })).toHaveLength(2)

  await $.turn.complete({ agentId: 'agent-1', answer: 'Found it in settings.json\nmore', durationMs: 5, isAborted: false, turnId: 't' } as never)
  shown = (await texts(ui)).join('|')
  expect(shown).toContain('✓ returned')
  expect(shown).toContain('↩ Found it in settings.json')
})

// A `git log --graph` line in GIT_LOG's format.
const logLine = (graph: string, hash: string, refs: string, age: string, subject: string) =>
  `${graph}${hash}\x1f${refs}\x1f${age}\x1f${subject}`

const DIFF = ['diff --git a/x.ts b/x.ts', 'index 1..2 100644', '--- a/x.ts', '+++ b/x.ts', '@@ -3,2 +3,3 @@ function hero()', ' keep', '-old line', '+new line', '+another']

const mapWorld = (on: On, log: string[], status = '## main...origin/main [ahead 1]\n M x.ts\n') =>
  world(on, {
    git: argv => {
      if (argv[1] === 'status') return { stdout: status }
      if (argv[1] === 'rev-parse') return { stdout: '/x\n' }
      if (argv[1] === 'remote') return { stdout: 'origin\n' }
      if (argv[1] === 'diff' && argv[2] === '--numstat') return { stdout: '2\t1\tx.ts\n' }
      if (argv[1] === 'diff') return { stdout: `${DIFF.join('\n')}\n` }
      return { stdout: `${log.join('\n')}\n` }
    },
  })

test('a one-line history is drawn as a road: camp, you, the loot you carry, the town', async ($, on) => {
  mapWorld(on, [
    logLine('* ', 'abc1234', 'HEAD -> main', '2 hours ago', 'feat: map'),
    logLine('* ', 'abc0000', '', '5 hours ago', 'feat: loot'),
    logLine('* ', 'bcd2345', 'origin/main, origin/HEAD', '3 days ago', 'fix: road'),
    logLine('* ', 'def5678', '', '7 weeks ago', 'init'),
  ])
  await $.tool.call({ tool: 'Edit', file_path: '/x/y/z.ts', old_string: 'a', new_string: 'b' } as never)
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)

  const ui = await mountPane($, 'terminal', 40)
  await showTab($, ui, 'map')
  const shown = (await texts(ui)).join('|')
  expect(shown).toContain('@ main · one road')
  expect(shown).toContain('↑1 to deliver')
  expect(shown).toContain(' camp ')
  expect(shown).toContain('feat: map')
  expect(shown).toContain(' origin/main ')
  expect(shown).toContain(' town')
  expect(shown).toContain('🎒')
  expect(shown).toContain('2h')
  expect(shown).toContain('7w')
  expect(shown).toContain('⚐ where it all began')
  expect(shown).toContain('y/z.ts')
})

test('a branching history keeps the lane graph', async ($, on) => {
  mapWorld(on, [
    logLine('* ', 'abc1234', 'HEAD -> feat/x', '1 hour ago', 'wip'),
    logLine('| * ', 'bcd2345', 'main', '2 hours ago', 'fix'),
    '|/',
    logLine('* ', 'def5678', '', '1 day ago', 'init'),
  ])
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  const ui = await mountPane($, 'terminal', 40)
  await showTab($, ui, 'map')
  const shown = (await texts(ui)).join('|')
  expect(shown).toContain('branching paths')
  expect(shown).toContain('(main) ')
  expect(shown).not.toContain(' town')
})

test('opens the bag from the camp, inspects a change and walks back', async ($, on) => {
  mapWorld(on, [logLine('* ', 'abc1234', 'HEAD -> main, origin/main', '2 hours ago', 'feat: map')])
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  const ui = await mountPane($, 'terminal', 40)
  await showTab($, ui, 'map')

  await ui.press({ key: 'open-bag' })
  expect((await texts(ui)).join('|')).toContain('🎒 INVENTORY  1 items · +2 −1')
  const bag = (await ui.findAll({ type: 'Text', in: 'bag' })).map(row => row.text ?? '').join('|')
  expect(bag).toContain('◂ back to the map')
  expect(bag).toContain('x.ts')
  expect(bag).toContain('+2 −1')

  // Row 0 is the way back, row 1 the item.
  await ui.pointer({ type: 'up', x: 6, y: 1, button: 'left', in: 'bag' })
  let shown = (await texts(ui)).join('|')
  expect(shown).toContain('🔍 INSPECT  x.ts')
  expect(shown).toContain('── line 3 function hero()')
  expect(shown).toContain('new line')
  expect(shown).toContain('old line')

  await ui.press({ key: 'inspect-back' })
  expect((await texts(ui)).join('|')).toContain('🎒 INVENTORY')
  await ui.pointer({ type: 'up', x: 3, y: 0, button: 'left', in: 'bag' })
  shown = (await texts(ui)).join('|')
  expect(shown).toContain('🧭 WORLD MAP')
})

test('places each stop of the road', () => {
  const rows = [
    parseGraphLine(logLine('* ', 'a000001', 'HEAD -> main', '1 hour ago', 'a')),
    parseGraphLine(logLine('* ', 'a000002', '', '1 hour ago', 'b')),
    parseGraphLine(logLine('* ', 'a000003', 'origin/main', '1 day ago', 'c')),
    parseGraphLine(logLine('* ', 'a000004', '', '1 day ago', 'd')),
  ]
  const kinds = trailStops(rows, 2).map(stop => (stop.kind === 'step' ? stop.place : stop.kind))
  expect(kinds).toEqual(['camp', 'here', 'carried', 'town', 'road', 'road', 'end'])
  const synced = trailStops([parseGraphLine(logLine('* ', 'a000001', 'HEAD -> main, origin/main', '1 hour ago', 'a'))], 0)
  expect(synced[0]).toEqual({ kind: 'town', remotes: ['origin/main'], isHere: true })
})

const ONE_SKILL = {
  startedAt: 0,
  rateLimits: [],
  context: {
    window: 200000,
    percent: 10,
    breakdown: {
      skills: { totalSkills: 1, includedSkills: 1, tokens: 10, skillFrontmatter: [{ name: 'commit', source: 'userSettings', tokens: 10 }] },
      mcpTools: [{ name: 'q', serverName: 'context7', tokens: 5, isLoaded: true }],
    },
  },
}

const skillTexts = async (ui: Awaited<ReturnType<typeof mountPane>>) =>
  (await ui.findAll({ type: 'Text', in: 'skills' })).map(row => row.text ?? '').join('|')

test('casting a skill raises its mastery on the skills page', async ($, on) => {
  world(on, { usage: ONE_SKILL })
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  await $.tool.call({ tool: 'Skill', skill: 'commit' } as never)

  const ui = await mountPane($, 'terminal', 40)
  await showTab($, ui, 'skills')
  expect((await texts(ui)).join('|')).toContain('1/1 learned')
  const shown = await skillTexts(ui)
  expect(shown).toContain('❖ Personal')
  expect(shown).toContain('commit')
  expect(shown).toContain(' ×1')
  expect(shown).toContain('context7')
})

test('clicking a skill puts it in the prompt box with a cast effect', async ($, on) => {
  const { fills } = world(on, { usage: ONE_SKILL })
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  const ui = await mountPane($, 'terminal', 40)
  await showTab($, ui, 'skills')

  // Row 0 is the school, row 1 the skill.
  await ui.pointer({ type: 'move', x: 10, y: 1, in: 'skills' })
  expect(await skillTexts(ui)).toContain('⏎ cast')
  await ui.pointer({ type: 'down', x: 10, y: 1, button: 'left', in: 'skills' })
  await ui.pointer({ type: 'up', x: 10, y: 1, button: 'left', in: 'skills' })
  expect(fills).toEqual(['/commit '])
  expect(await skillTexts(ui)).toContain('CAST!')

  await ui.advance(400)
  expect(await skillTexts(ui)).toContain('→ prompt')
  await ui.advance(2000)
  const settled = await skillTexts(ui)
  expect(settled).not.toContain('CAST!')
  expect(settled).not.toContain('→ prompt')

  // A click on the school's row casts nothing.
  await ui.pointer({ type: 'up', x: 10, y: 0, button: 'left', in: 'skills' })
  expect(fills).toHaveLength(1)
})

test('the sparkle sweeps from left to right', () => {
  expect(sparkleTrail(10, 2)).toBe('✦' + ' '.repeat(9))
  expect(sparkleTrail(10, 5).trim().length).toBeGreaterThan(0)
  expect(sparkleTrail(10, 5).indexOf('✦')).toBeLessThan(sparkleTrail(10, 8).indexOf('✦'))
})

test('the first cast unlocks a feat and saves the progress', async ($, on) => {
  const { store } = world(on)
  await $.tool.call({ tool: 'Read', file_path: '/x/a.md' })
  expect(Object.keys((store.get('progress') as { unlocked: Record<string, number> }).unlocked)).toContain('first-cast')

  const ui = await mountPane($, 'desktop')
  await showTab($, ui, 'feats', 'desktop')
  const shown = (await texts(ui)).join('|')
  expect(shown).toContain('First Spark')
  expect(shown).toContain('1/15 earned')
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

test('squeezes a multi-line command into one cut line', () => {
  expect(oneLine('cat <<EOF\n  hello\nEOF', 40)).toBe('cat <<EOF hello EOF')
  const cut = oneLine('a'.repeat(30) + 'b'.repeat(30), 11)
  expect(cut).toHaveLength(11)
  expect(cut).toBe('aaaaa…bbbbb')
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

test('fills the bars in proportion', () => {
  expect(barFill(5, 5)).toBe(16)
  expect(barFill(0, 5)).toBe(0)
  expect(barFill(4, 5)).toBe(13)
  expect(barFill(3, 10)).toBe(5)
  expect(barFill(1, 0)).toBe(0)
})

test('names the wizard by level', () => {
  expect(rankFor(1)).toBe('Apprentice')
  expect(rankFor(3)).toBe('Adept')
  expect(rankFor(8)).toBe('Archmage')
  expect(rankFor(12)).toBe('Grand Wizard')
})

test('mana is the context window left', () => {
  expect(manaLeft({})).toBeUndefined()
  expect(manaLeft({ contextPercent: 37.4 })).toBe(63)
  expect(manaLeft({ contextPercent: 120 })).toBe(0)
})

test('a failing test run summons a boss that a passing run slays', () => {
  const first = fightBoss(null, 'pnpm test', true, 'Tests: 3 failed, 10 passed')
  expect(first.event).toBe('appear')
  expect(first.boss).toMatchObject({ name: 'Bug Hydra', hp: 3, maxHp: 3 })

  const hit = fightBoss(first.boss, 'pnpm test', true, '1 failed')
  expect(hit.event).toBe('hit')
  expect(hit.boss?.hp).toBe(1)

  const lint = fightBoss(hit.boss, 'pnpm lint', false, '')
  expect(lint.boss?.name).toBe('Bug Hydra')

  expect(fightBoss(hit.boss, 'pnpm test', false, 'all green')).toEqual({ boss: null, event: 'defeat' })
  expect(fightBoss(null, 'ls -la', true, '').boss).toBeNull()
})

test('a failure without a count is one hit point', () => {
  expect(countFailures('error: something broke')).toBe(1)
  expect(countFailures('✖ 12 problems (12 errors, 0 warnings)')).toBe(12)
})

test('pets still out come first', () => {
  const pet = { kind: 'Explore', description: '', startedAt: 0, actions: 0 }
  const order = rosterOrder([
    { ...pet, id: 'a', status: 'ok' },
    { ...pet, id: 'b', status: 'run' },
    { ...pet, id: 'c', status: 'err' },
  ])
  expect(order.map(one => one.id)).toEqual(['b', 'c', 'a'])
})

test('reads the branch, its distance and unsaved files from git status', () => {
  expect(parseStatus('## main...origin/main [ahead 2, behind 1]\n M a.ts\n?? b.ts\n')).toEqual({
    branch: 'main',
    ahead: 2,
    behind: 1,
    dirty: 2,
  })
  expect(parseStatus('## feat/x\n')).toEqual({ branch: 'feat/x', ahead: 0, behind: 0, dirty: 0 })
})

test('splits a graph line into lanes, hash, refs, age and subject', () => {
  expect(parseGraphLine('* bb43d3f\x1fHEAD -> main, origin/main, origin/HEAD\x1f7 hours ago\x1ffeat: add mods')).toEqual({
    graph: '* ',
    hash: 'bb43d3f',
    refs: 'HEAD -> main, origin/main, origin/HEAD',
    age: '7h',
    subject: 'feat: add mods',
    isHead: true,
    remotes: ['origin/main'],
  })
  expect(parseGraphLine('| * 9854943\x1f\x1f2 days ago\x1ffix(zsh): symbols').graph).toBe('| * ')
  expect(parseGraphLine('|/').hash).toBe('')
  expect(isLinear([parseGraphLine('* 9854943\x1f\x1f2 days ago\x1fx')])).toBe(true)
  expect(isLinear([parseGraphLine('| * 9854943\x1f\x1f2 days ago\x1fx')])).toBe(false)
})

test('reads the bag from git status and numstat', () => {
  const bag = parseBag('## main\n M a.ts\nR  old.ts -> new.ts\n?? fresh.md\n D gone.ts\n', '3\t1\ta.ts\n-\t-\tlogo.png\n0\t0\t{old.ts => new.ts}\n')
  expect(bag).toEqual([
    { path: 'a.ts', status: 'M', added: 3, removed: 1, isBinary: false },
    { path: 'new.ts', status: 'R', added: 0, removed: 0, isBinary: false },
    { path: 'fresh.md', status: '?', added: 0, removed: 0, isBinary: false },
    { path: 'gone.ts', status: 'D', added: 0, removed: 0, isBinary: false },
  ])
  expect(diffArgv({ path: 'fresh.md', status: '?' })).toContain('--no-index')
  expect(diffArgv({ path: 'a.ts', status: 'M' })).toContain('HEAD')
})

test('numbers diff lines from their hunk', () => {
  const lines = parseDiff(DIFF)
  expect(lines[0]).toEqual({ kind: 'hunk', text: 'function hero()', newStart: 3 })
  expect(lines.slice(1)).toEqual([
    { kind: 'ctx', text: 'keep', number: 3 },
    { kind: 'del', text: 'old line', number: 4 },
    { kind: 'add', text: 'new line', number: 4 },
    { kind: 'add', text: 'another', number: 5 },
  ])
})

test('rates a change by its size', () => {
  expect(rarityOf(3).name).toBe('common')
  expect(rarityOf(20).name).toBe('uncommon')
  expect(rarityOf(80).name).toBe('rare')
  expect(rarityOf(500).name).toBe('epic')
  expect(splitBar(3, 1, 8)).toEqual({ plus: 6, minus: 2 })
  expect(splitBar(0, 0, 8)).toEqual({ plus: 0, minus: 0 })
})

test('cuts a long patch into hunks that still parse', () => {
  const hunk = { oldStart: 1, oldLines: 4, newStart: 1, newLines: 4, lines: [' a', '-b', '+c', ' d', '-e', '+f'] }
  expect(countPatch([hunk])).toEqual({ added: 2, removed: 2 })
  const { source, hidden } = patchSource([hunk, { ...hunk, oldStart: 20, newStart: 20 }], 4)
  expect(source).toBe('@@ -1,3 +1,3 @@\n a\n-b\n+c\n d')
  expect(hidden).toBe(8)
})

const EDIT_RESULT = {
  filePath: '/x/hooks/hero.tsx',
  oldString: 'old line',
  newString: 'new line',
  originalFile: null,
  structuredPatch: [{ oldStart: 3, oldLines: 2, newStart: 3, newLines: 2, lines: [' keep', '-old line', '+new line'] }],
  userModified: false,
  replaceAll: false,
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`draws an edit result as a spell card on ${surface}`, async ($, on) => {
    world(on)
    const ui = await $.ui.mount({
      plugin: 'rpg-hud',
      surface,
      component: 'ToolResult',
      requestId: 't1',
      props: { tool_use_id: 't1', tool: 'Edit', output: EDIT_RESULT, isErrored: false },
    })
    const shown = (await texts(ui)).join('|')
    expect(shown).toContain('✎ Enchanted')
    expect(shown).toContain(' hooks/hero.tsx')
    expect(shown).toContain('+1')
    expect(shown).toContain(' −1')
    expect(shown).toContain('[common]')
    expect(await ui.find({ type: 'Code' })).toBeDefined()
  })
}

test('a new file is conjured with its first lines', async ($, on) => {
  world(on)
  const ui = await $.ui.mount({
    plugin: 'rpg-hud',
    surface: 'terminal',
    component: 'ToolResult',
    requestId: 't2',
    props: {
      tool_use_id: 't2',
      tool: 'Write',
      output: { type: 'create', filePath: '/x/new.ts', content: 'a\nb\nc', structuredPatch: [], originalFile: null },
      isErrored: false,
    },
  })
  const shown = (await texts(ui)).join('|')
  expect(shown).toContain('✚ Conjured')
  expect(shown).toContain('+3')
})

test('shortens commit ages', () => {
  expect(shortAge('3 hours ago')).toBe('3h')
  expect(shortAge('1 month ago')).toBe('1mo')
  expect(shortAge('2 years, 3 months ago')).toBe('2 years, 3 months')
})

test('counts reads and edits per file', () => {
  const once = touchFile([], 'a.ts', false)
  const twice = touchFile(once, 'a.ts', true)
  expect(twice).toEqual([{ path: 'a.ts', reads: 1, edits: 1 }])
})

test('mastery stars follow the uses', () => {
  expect(masteryStars(0)).toBe('☆☆☆')
  expect(masteryStars(1)).toBe('★☆☆')
  expect(masteryStars(4)).toBe('★★☆')
  expect(masteryStars(10)).toBe('★★★')
})

test('groups skills by their school, personal first', () => {
  const groups = groupSkills([
    { name: 'b', source: 'plugin', plugin: 'codex' },
    { name: 'z', source: 'userSettings' },
    { name: 'a', source: 'userSettings' },
  ])
  expect(groups.map(([school]) => school)).toEqual(['Personal', 'Plugin · codex'])
  expect(groups[0]?.[1].map(slot => slot.name)).toEqual(['a', 'z'])
})

test('a typed slash command counts only for known skills', () => {
  expect(skillOfPrompt('/commit now', ['commit'])).toBe('commit')
  expect(skillOfPrompt('/clear', ['commit'])).toBeUndefined()
  expect(skillOfPrompt('hello /commit', ['commit'])).toBeUndefined()
})

test('earns trophies once their goal is met', () => {
  const earned = newlyEarned({ ...EMPTY_PROGRESS, totalCalls: 120, bestCombo: 25 }).map(t => t.id)
  expect(earned).toEqual(['first-cast', 'centurion', 'combo-20'])
  const kept = newlyEarned({ ...EMPTY_PROGRESS, totalCalls: 1, unlocked: { 'first-cast': 1 } })
  expect(kept).toEqual([])
})

test('puffs smoke on the pane after a failed call, then rests', async ($, on) => {
  const clock = world(on, { tool: failBash('boom') }).clock
  const blitted: string[] = []
  on('ui.blit', async (_$, e) => {
    if ('cells' in e) blitted.push(e.cells)
    return { value: {} }
  })

  await mountPane($, 'terminal')
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await clock.advance(100)
  expect(blitted).toContain(HERO_FRAMES.hurt[0])

  await clock.advance(HURT_MS + 600)
  expect(HERO_FRAMES.idle).toContain(blitted.at(-1))
})

test('draws a multi-line command as one log row', async ($, on) => {
  world(on)
  await $.tool.call({ tool: 'Bash', command: 'echo one\necho two\necho three' })
  const ui = await mountPane($, 'terminal')
  const rows = await texts(ui)
  expect(rows).toContain('echo one echo two echo three')
  expect(rows.some(row => row.includes('\n'))).toBe(false)
})

test('shows a long tool name whole in the log', async ($, on) => {
  world(on)
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
  const ui = await mountPane($, 'terminal')
  expect(await texts(ui)).toContain('AskUserQuestion')
})

// --- Hero classes ---

test('rolls every class, and a reroll never repeats the current one', () => {
  expect(CLASS_IDS).toEqual(['wizard', 'knight', 'ranger', 'rogue', 'cleric', 'artificer'])
  expect(new Set([0, 0.2, 0.4, 0.6, 0.8, 0.99].map(roll => rollClass(roll)))).toEqual(new Set(CLASS_IDS))
  for (const roll of [0, 0.5, 0.99]) expect(rollClass(roll, 'knight')).not.toBe('knight')
})

test('each class has its own ranks and frames', () => {
  expect(rankOf(CLASSES.knight, 1)).toBe('Squire')
  expect(rankOf(CLASSES.knight, 7)).toBe('Paladin')
  expect(rankOf(CLASSES.artificer, 12)).toBe('Grand Artificer')
  for (const id of CLASS_IDS) {
    expect(HERO_CLASS_FRAMES[id].idle).toHaveLength(4)
    expect(HERO_CLASS_FRAMES[id].hurt).toHaveLength(3)
  }
  expect(pickFrame('idle', 0, 'rogue')).toBe(HERO_CLASS_FRAMES.rogue.idle[0])
  expect(pickFrame('idle', 0, 'rogue')).not.toBe(pickFrame('idle', 0, 'wizard'))
})

test('/hud class picks a class and the panel follows it', async ($, on) => {
  const { store } = world(on)
  const answer = await $.command.run({ command: 'hud', args: 'class knight' } as never)
  expect(answer).toMatchObject({ text: 'Claude is now a knight.' })
  const ui = await mountPane($, 'terminal')
  const shown = (await texts(ui)).join('|')
  expect(shown).toContain('CLAUDE THE KNIGHT')
  expect(shown).toContain('Squire')
  expect(shown).toContain('⛨ standing guard')
  expect(shown).toContain('✓ no blows parried')
  expect((store.get('progress') as { classesPlayed: string[] }).classesPlayed).toEqual(['knight'])

  expect(await $.command.run({ command: 'hud', args: 'class bard' } as never)).toMatchObject({
    text: 'No such class. Pick one of: wizard, knight, ranger, rogue, cleric, artificer.',
  })
})

// --- Outposts (worktrees) ---

const WORKTREES = [
  'worktree /x',
  'HEAD abc1234',
  'branch refs/heads/main',
  '',
  'worktree /x-wt/feat-x',
  'HEAD bcd2345',
  'branch refs/heads/feat/x',
  '',
  'worktree /x-wt/locked-one',
  'HEAD cde3456',
  'detached',
  'locked',
  '',
  'worktree /gone/ruin',
  'HEAD def4567',
  'branch refs/heads/old',
  'prunable gitdir file points to non-existent location',
  '',
].join('\n')

// A repository with three outposts besides the main folder; `here` is where the session runs.
const outpostGit = (here: string) => (argv: readonly string[]) => {
  const at = argv[1] === '-C' ? argv[2] : undefined
  const command = at === undefined ? argv.slice(1) : argv.slice(3)
  if (command[0] === 'worktree') return { stdout: WORKTREES }
  if (command[0] === 'remote') return { stdout: 'origin\n' }
  if (command[0] === 'rev-parse') return { stdout: `${here}\n` }
  if (command[0] === 'status') {
    return { stdout: at === '/x-wt/feat-x' ? '## feat/x...origin/feat/x [ahead 2]\n M a.ts\n M b.ts\n' : '## main\n' }
  }
  if (command[0] === 'log' && command[1] === '-1') return { stdout: '3 hours ago\n' }
  if (command[0] === 'diff' && command[1] === '--numstat') return { stdout: at === '/x-wt/feat-x' ? '5\t1\ta.ts\n2\t0\tb.ts\n' : '' }
  if (command[0] === 'diff') return { stdout: `${DIFF.join('\n')}\n` }
  return { stdout: `${logLine('* ', 'abc1234', 'HEAD -> main', '2 hours ago', 'feat: map')}\n${logLine('* ', 'bcd2345', 'feat/x', '1 day ago', 'wip')}\n` }
}

const outpostWorld = (on: On, here = '/x') => world(on, { git: outpostGit(here) })

test('reads the worktrees as outposts', () => {
  expect(parseWorktrees(WORKTREES)).toEqual([
    { path: '/x', name: 'x', branch: 'main', isMain: true, isLocked: false, isPrunable: false },
    { path: '/x-wt/feat-x', name: 'feat-x', branch: 'feat/x', isMain: false, isLocked: false, isPrunable: false },
    { path: '/x-wt/locked-one', name: 'locked-one', branch: '', isMain: false, isLocked: true, isPrunable: false },
    { path: '/gone/ruin', name: 'ruin', branch: 'old', isMain: false, isLocked: false, isPrunable: true },
  ])
  expect(parseWorktrees('worktree /bare\nbare\n')).toEqual([])
})

test('flags the branches another outpost has checked out', () => {
  expect(campsOn('HEAD -> main, feat/x, origin/main', { 'feat/x': 'feat-x', main: 'x' })).toEqual(['x', 'feat-x'])
  expect(campsOn('', { main: 'x' })).toEqual([])
})

test('walks from the map to an outpost, its bag and a diff, and back', async ($, on) => {
  outpostWorld(on)
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  const ui = await mountPane($, 'terminal', 40)
  await showTab($, ui, 'map')
  expect(await ui.find({ type: 'Button', key: 'open-outposts' })).toBeDefined()
  let shown = (await texts(ui)).join('|')
  expect(shown).not.toContain('🏰 feat/x')
  // feat/x is checked out at the feat-x outpost.
  expect(shown).toContain(' ⚑feat-x')

  await ui.press({ key: 'open-outposts' })
  expect((await texts(ui)).join('|')).toContain('🏕 OUTPOSTS  4 camps · 1 with unsaved work')
  const camps = (await ui.findAll({ type: 'Text', in: 'outposts' })).map(row => row.text ?? '').join('|')
  expect(camps).toContain('feat-x')
  expect(camps).toContain('feat/x ↑2')
  expect(camps).toContain('⚠ 2 unsaved')
  expect(camps).toContain('here')
  expect(camps).toContain('prunable')

  // A ruin opens nothing; feat-x (row 2) opens its own bag.
  await ui.pointer({ type: 'up', x: 6, y: 4, button: 'left', in: 'outposts' })
  expect((await texts(ui)).join('|')).toContain('🏕 OUTPOSTS')
  await ui.pointer({ type: 'up', x: 6, y: 2, button: 'left', in: 'outposts' })
  shown = (await texts(ui)).join('|')
  expect(shown).toContain('🎒 INVENTORY  ⚑feat-x · 2 items · +7 −1')
  const bagRows = (await ui.findAll({ type: 'Text', in: 'bag' })).map(row => row.text ?? '').join('|')
  expect(bagRows).toContain('◂ back to the outposts')

  await ui.pointer({ type: 'up', x: 6, y: 1, button: 'left', in: 'bag' })
  expect((await texts(ui)).join('|')).toContain('🔍 INSPECT  a.ts')
  await ui.press({ key: 'inspect-back' })
  expect((await texts(ui)).join('|')).toContain('⚑feat-x')
  await ui.pointer({ type: 'up', x: 3, y: 0, button: 'left', in: 'bag' })
  expect((await texts(ui)).join('|')).toContain('🏕 OUTPOSTS')
  await ui.pointer({ type: 'up', x: 3, y: 0, button: 'left', in: 'outposts' })
  expect((await texts(ui)).join('|')).toContain('🧭 WORLD MAP')
})

test('a session in an outpost camps there, and a pet sent elsewhere shows its camp', async ($, on) => {
  outpostWorld(on, '/x-wt/feat-x')
  on('agent.spawn', async () => ({ model: 'claude-haiku-4-5', agentId: 'agent-2' }))
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  await $.agent.spawn({ prompt: 'Fix it', description: 'Fix it', subagentType: 'general-purpose', cwd: '/x-wt/locked-one' } as never)

  const ui = await mountPane($, 'terminal', 40)
  expect((await texts(ui)).join('|')).toContain('🏕 camping at feat-x')
  await showTab($, ui, 'pets')
  expect((await texts(ui)).join('|')).toContain(' ⚑locked-one')
})

// --- Review fixes ---

test('in a bare repository no worktree is the main one', () => {
  const bare = 'worktree /repo.git\nbare\n\nworktree /repo/main\nHEAD abc\nbranch refs/heads/main\n\nworktree /repo/feat\nHEAD bcd\nbranch refs/heads/feat\n'
  expect(parseWorktrees(bare).map(one => [one.name, one.isMain])).toEqual([
    ['main', false],
    ['feat', false],
  ])
})

test('an edit refreshes only the bag; outposts are surveyed when their list opens', async ($, on) => {
  const runs: string[] = []
  const answer = outpostGit('/x')
  world(on, {
    git: argv => {
      runs.push(argv.slice(1).join(' '))
      return answer(argv)
    },
  })
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  // The refreshes run unawaited; drawing the pane lets them finish.
  const ui = await mountPane($, 'terminal', 40)
  await showTab($, ui, 'map')
  // The turn's refresh lists the outposts but surveys none.
  expect(runs.some(run => run.startsWith('worktree list'))).toBe(true)
  expect(runs.some(run => run.startsWith('-C '))).toBe(false)

  runs.length = 0
  await $.tool.call({ tool: 'Edit', file_path: '/x/a.ts', old_string: 'a', new_string: 'b' } as never)
  await texts(ui)
  expect(runs.some(run => run.startsWith('status'))).toBe(true)
  expect(runs.some(run => /^(log|remote|worktree)/.test(run))).toBe(false)

  await ui.press({ key: 'open-outposts' })
  expect(runs.filter(run => /^-C \S+ status/.test(run))).toHaveLength(3)
  const camps = (await ui.findAll({ type: 'Text', in: 'outposts' })).map(row => row.text ?? '').join('|')
  expect(camps).toContain('⚠ 2 unsaved')
})

test("the session's own outpost opened from the list leads back to the list", async ($, on) => {
  outpostWorld(on)
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  const ui = await mountPane($, 'terminal', 40)
  await showTab($, ui, 'map')
  await ui.press({ key: 'open-outposts' })
  // Row 1 is the session's own folder, /x.
  await ui.pointer({ type: 'up', x: 6, y: 1, button: 'left', in: 'outposts' })
  expect((await ui.findAll({ type: 'Text', in: 'bag' })).map(row => row.text ?? '').join('|')).toContain('◂ back to the outposts')
  await ui.pointer({ type: 'up', x: 3, y: 0, button: 'left', in: 'bag' })
  expect((await texts(ui)).join('|')).toContain('🏕 OUTPOSTS')
})

test('a pet working inside the session folder has no camp', async ($, on) => {
  outpostWorld(on)
  on('agent.spawn', async () => ({ model: 'claude-haiku-4-5', agentId: 'agent-3' }))
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  await $.agent.spawn({ prompt: 'Read', description: 'Read src', subagentType: 'Explore', cwd: '/x/src' } as never)
  const ui = await mountPane($, 'terminal', 40)
  await showTab($, ui, 'pets')
  expect((await texts(ui)).join('|')).not.toContain('⚑')
})

// --- Subagents met only through their tool calls ---

test("a skill's forked subagent joins the party from its first tool call", async ($, on) => {
  world(on)
  on('agent.list', async () => ({
    value: [{ id: 'fork-1', description: '/code-review high', type: 'fork', status: 'running' }],
  }))
  await $.tool.call({ tool: 'Grep', pattern: 'TODO', agentId: 'fork-1' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/x/a.ts', agentId: 'fork-1' } as never)

  const ui = await mountPane($, 'terminal')
  await showTab($, ui, 'pets')
  const shown = (await texts(ui)).join('|')
  expect(shown).toContain('1 questing · 1 summoned')
  expect(shown).toContain('Wisp')
  expect(shown).toContain('/code-review high')
  expect(shown).toContain('⚔ 2 · Read a.ts')

  await $.turn.complete({ agentId: 'fork-1', answer: 'Found 10 issues', durationMs: 5, isAborted: false, turnId: 't' } as never)
  expect((await texts(ui)).join('|')).toContain('↩ Found 10 issues')
})

test('a spawn answered after its first tool call does not add the pet twice', async ($, on) => {
  world(on)
  on('agent.list', async () => ({ value: [] }))
  on('agent.spawn', async () => ({ model: 'claude-haiku-4-5', agentId: 'agent-9' }))
  await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'agent-9' } as never)
  await $.agent.spawn({ prompt: 'Look', description: 'Look around', subagentType: 'Explore' } as never)

  const ui = await mountPane($, 'terminal')
  await showTab($, ui, 'pets')
  const shown = (await texts(ui)).join('|')
  expect(shown).toContain('1 questing · 1 summoned')
  expect(shown).toContain('Scout Hawk')
  expect(shown).toContain('Look around')
  expect(shown).toContain('⚔ 1 · Grep x')
})

// --- Second review fixes ---

test('the level keeps rising past the 200 calls the spell book keeps, and levels up once per ten', async ($, on) => {
  const { toasts } = world(on)
  for (let n = 1; n <= 215; n += 1) await $.tool.call({ tool: 'Read', file_path: `/x/f${n}.md` })
  expect(toasts.filter(text => text.startsWith('✦ Level up!'))).toHaveLength(21)
  const ui = await mountPane($, 'terminal')
  const shown = (await texts(ui)).join('|')
  expect(shown).toContain('Lv.22')
  expect(shown).toContain('215 casts')
})

test('a bag file opens its diff on desktop too', async ($, on) => {
  mapWorld(on, [logLine('* ', 'abc1234', 'HEAD -> main, origin/main', '2 hours ago', 'feat: map')])
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  const ui = await mountPane($, 'desktop', 40)
  await showTab($, ui, 'map', 'desktop')
  await ui.press({ key: 'open-bag' })
  await ui.press({ key: 'bag-x.ts' })
  expect((await texts(ui)).join('|')).toContain('🔍 INSPECT  x.ts')
})

test('git prints paths as written, and a control character in one cannot break the drawing', () => {
  expect(GIT_STATUS).toContain('core.quotePath=false')
  expect(diffArgv({ path: '日記.md', status: 'M' })).toContain('core.quotePath=false')
  expect(parseBag('?? 日記.md\n?? bad\u0007name.md\n', '').map(item => item.path)).toEqual(['日記.md', 'bad?name.md'])
})

test("progress adds to what other sessions saved, never overwrites it", async ($, on) => {
  const { store } = world(on, { stored: { progress: { ...EMPTY_PROGRESS, totalCalls: 50, unlocked: { 'first-cast': 1 } } } })
  await $.tool.call({ tool: 'Read', file_path: '/x/a.md' })
  const saved = store.get('progress') as { totalCalls: number; unlocked: Record<string, number> }
  expect(saved.totalCalls).toBe(51)
  expect(saved.unlocked['first-cast']).toBe(1)
})

test('only a check runner summons a boss, never a word in the arguments', () => {
  const kinds = (command: string) => bossFor(command)?.kind
  expect(kinds('pnpm test')).toBe('test')
  expect(kinds('npm run test:unit')).toBe('test')
  expect(kinds('npx vitest run')).toBe('test')
  expect(kinds('python -m pytest -q')).toBe('test')
  expect(kinds('go test ./...')).toBe('test')
  expect(kinds('cd web && pnpm run lint')).toBe('lint')
  expect(kinds('./node_modules/.bin/tsc --noEmit')).toBe('types')
  expect(kinds('CI=1 npx playwright test')).toBe('e2e')
  expect(kinds('ls tests/')).toBeUndefined()
  expect(kinds('grep -r test .')).toBeUndefined()
  expect(kinds('cat jest.config.js')).toBeUndefined()
  expect(kinds('git commit -m "fix lint"')).toBeUndefined()
})

test('a NotebookEdit counts as exploring and editing its notebook', async ($, on) => {
  mapWorld(on, [logLine('* ', 'abc1234', 'HEAD -> main', '2 hours ago', 'x')])
  await $.tool.call({ tool: 'NotebookEdit', notebook_path: '/x/nb/plot.ipynb', new_source: 'x' } as never)
  const ui = await mountPane($, 'terminal', 40)
  await showTab($, ui, 'map')
  expect((await texts(ui)).join('|')).toContain('nb/plot.ipynb')
})

test('a new file ending in a newline counts its lines once', async ($, on) => {
  world(on)
  const ui = await $.ui.mount({
    plugin: 'rpg-hud',
    surface: 'terminal',
    component: 'ToolResult',
    requestId: 't3',
    props: {
      tool_use_id: 't3',
      tool: 'Write',
      output: { type: 'create', filePath: '/x/new.ts', content: 'a\nb\nc\n', structuredPatch: [], originalFile: null },
      isErrored: false,
    },
  })
  const shown = (await texts(ui)).join('|')
  expect(shown).toContain('+3')
  expect(shown).not.toContain('+4')
})

test('where a pet camps', () => {
  const outpost = { path: '/w/feat', realPath: '/w/feat', name: 'feat', branch: 'feat', isMain: false, isLocked: false, isPrunable: false, ahead: 0, behind: 0, dirty: 0, age: '' }
  const home = { ...outpost, path: '/x', realPath: '/x', name: 'x', isMain: true, isHere: true }
  const list = [home, { ...outpost, isHere: false }]
  // Its own worktree, even under the repository's .claude/worktrees.
  expect(campFor({ cwd: '/x/.claude/worktrees/agent-7', isIsolated: true }, list, '/x')).toBe('agent-7')
  expect(campFor({ isIsolated: true }, list, '/x')).toBe('worktree')
  expect(campFor({ cwd: '/w/feat', isIsolated: false }, list, '/x')).toBe('feat')
  expect(campFor({ cwd: '/x', isIsolated: false }, list, '/x')).toBeUndefined()
  expect(campFor({ cwd: '/x/src', isIsolated: false }, list, '/x')).toBeUndefined()
  expect(campFor({ cwd: '/elsewhere/tool', isIsolated: false }, list, '/x')).toBe('tool')
  expect(campFor({ isIsolated: false }, list, '/x')).toBeUndefined()
})

test('a hovered row the bag no longer has is let go', async ($, on) => {
  let status = '## main\n M x.ts\n'
  world(on, {
    git: argv => {
      if (argv[1] === 'status') return { stdout: status }
      if (argv[1] === 'rev-parse') return { stdout: '/x\n' }
      if (argv[1] === 'diff') return { stdout: '1\t0\tx.ts\n' }
      return { stdout: '' }
    },
  })
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  const ui = await mountPane($, 'terminal', 40)
  await showTab($, ui, 'map')
  await ui.press({ key: 'open-bag' })
  await ui.pointer({ type: 'move', x: 6, y: 1, in: 'bag' })
  expect((await ui.findAll({ type: 'Text', in: 'bag' })).map(row => row.text ?? '').join('|')).toContain('⏎ inspect')

  status = '## main\n'
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't2' } as never)
  await texts(ui)
  const rows = (await ui.findAll({ type: 'Text', in: 'bag' })).map(row => row.text ?? '').join('|')
  expect(rows).toContain('The bag is empty')
  expect(rows).not.toContain('▶')
})
