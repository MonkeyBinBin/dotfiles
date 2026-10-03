import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { HERO_FRAMES } from './hero-cells'
import { HURT_MS, pickFrame, pickMood } from './anim'
import { bossFor, bossesFor, countFailures, failedGuard, fightBoss, fightText, runsGit } from './boss'
import { GIT_STATUS, diffArgv, isLinear, parseBag, parseGraphLine, parseStatus, parseWorktrees, shortAge } from './git'
import { campsOn } from './map'
import { parseDiff, rarityOf, splitBar } from './diff'
import { countPatch, patchSource } from './edit-card'
import { trailStops } from './map'
import { gaugeColor, heroStats, manaLeft, normalizeCall, rankFor, statusLayout } from './hero'
import { rosterOrder } from './pets'
import { MANA_ALARMS, campFor, isRefusal, manaAlarm, returnToast, skillOfPrompt, touchFile } from './register'
import { formatDuration, recapText, topTools } from './recap'
import { HELP_COMMANDS, helpText } from './help'
import { filterSpells, timeColor } from './spellbook'
import { SKILL_KEYS, groupSkills, masteryStars, skillKeys } from './skills'
import { EMPTY_PROGRESS, newlyEarned } from './trophies'
import { barFill, oneLine } from './util'
import { cardWidth } from './menu-client'
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

type ToolAnswer = ReturnType<typeof fail> | { deny: string } | { result: { text: string } }

type World = {
  // Answers each tool call; every call succeeds when absent.
  tool?: (e: { tool: string; command?: string; tool_use_id?: string; description?: string }) => ToolAnswer | undefined | Promise<ToolAnswer | undefined>
  git?: (argv: readonly string[]) => { stdout: string } | undefined
  usage?: unknown
  // What the store holds at the start: another session's progress.
  stored?: Record<string, unknown>
  // The store cannot be read.
  isStoreDown?: boolean
}

// The world beneath the plugin: a clock, a store, a folder, and each noun the plugin calls answered.
// A test registers each of these once, before it first calls $.
const world = (on: On, options: World = {}) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const store = new Map<string, unknown>(Object.entries(options.stored ?? {}))
  on('store.get', async (_$, e) => (options.isStoreDown ? { deny: 'store unavailable' } : { value: store.get(e.key) }) as never)
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
  on('prompt.submit', async (_$, e) => ({ text: (e as { text: string }).text }) as never)
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
  on('tool.call', async (_$, e) => ((await options.tool?.(e as never)) ?? { result: { text: 'ok' } }) as never)
  return { clock, store, fills, toasts }
}

const failBash = (text: string): World['tool'] => e => (e.tool === 'Bash' ? fail(text) : undefined)

// A click on the card's icon on the terminal, a button press elsewhere.
const showTab = async ($: Engine, ui: Awaited<ReturnType<typeof mountPane>>, key: string, surface: Surface = 'terminal') => {
  if (surface !== 'terminal') return void (await ui.press({ key: `menu-${key}` }))
  await ui.pointer({ type: 'down', x: 4, y: 1, button: 'left', in: `icon-${key}` })
  await ui.pointer({ type: 'up', x: 4, y: 1, button: 'left', in: `icon-${key}` })
}

// A menu card's frame, by its tab.
const cardOf = async (ui: Awaited<ReturnType<typeof mountPane>>, tab: string) =>
  (await ui.findAll({ type: 'Box' })).find(box => (box as { key?: string }).key === `card-${tab}` || box.props?.key === `card-${tab}`)?.props

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
  // Five labels under the icons, buttons carrying their number keys, the active one jewelled.
  const labels = (await ui.findAll({ type: 'Button' })).filter(b => String(b.props?.key ?? '').startsWith('menu-'))
  // Plain, so the terminal draws each as `1: SPELL`; the active one at full strength.
  expect(labels.map(b => b.props?.label)).toEqual(['SPELL', 'PARTY', 'MAP', 'SKILL', 'FEATS'])
  expect(labels.map(b => b.props?.hotkey)).toEqual(['1', '2', '3', '4', '5'])
  expect(labels.every(b => b.props?.plain === true)).toBe(true)
  expect(labels.map(b => b.props?.dimColor)).toEqual([false, true, true, true, true])
  // Every card framed whole in rounded corners; the selected one gold.
  expect((await cardOf(ui, 'spells'))).toMatchObject({ borderStyle: 'round', borderColor: 'yellow' })
  for (const tab of ['pets', 'map', 'skills', 'feats']) expect((await cardOf(ui, tab))).toMatchObject({ borderStyle: 'round', borderColor: 'gray' })
})

test('a label button picks its tab, as its number key does once the pane has the keys', async ($, on) => {
  world(on)
  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'menu-feats' })
  expect((await texts(ui)).join('|')).toContain('🏆')
  // With the help page open, the active tab's button closes it.
  await ui.press({ key: 'help' })
  await ui.press({ key: 'menu-feats' })
  expect((await texts(ui)).join('|')).not.toContain('❓ HELP')
})

test("a click on a card's icon picks it, and arrow keys step through the menu", async ($, on) => {
  world(on)
  const ui = await mountPane($, 'terminal')
  // The icon's last row, near its edge.
  await ui.pointer({ type: 'down', x: 7, y: 2, button: 'left', in: 'icon-map' })
  await ui.pointer({ type: 'up', x: 7, y: 2, button: 'left', in: 'icon-map' })
  expect(await texts(ui)).toContain('🧭 WORLD MAP')

  await ui.key({ key: 'right', in: 'icon-map' })
  expect(await texts(ui)).toContain('📜 SKILLS')
  await ui.key({ key: 'left', in: 'icon-map' })
  await ui.key({ key: 'left', in: 'icon-map' })
  expect(await texts(ui)).toContain('🐾 PARTY')
})

test('the selected card has a bright gold frame and no backdrop; the others a dim grey one', async ($, on) => {
  world(on)
  const ui = await mountPane($, 'terminal')
  await showTab($, ui, 'skills')
  const label = (await ui.findAll({ type: 'Button' })).find(b => b.props?.key === 'menu-skills')
  expect(label?.props).toMatchObject({ label: 'SKILL', plain: true, dimColor: false })
  const selected = await cardOf(ui, 'skills')
  expect(selected).toMatchObject({ borderStyle: 'round', borderColor: 'yellow', borderDimColor: false })
  expect(selected?.backgroundColor).toBeUndefined()
  // An idle card: a dim grey frame, no backdrop. (Its hover colours are the surface's; the test tree omits them.)
  const idle = await cardOf(ui, 'spells')
  expect(idle).toMatchObject({ borderStyle: 'round', borderColor: 'gray', borderDimColor: true })
  expect(idle?.backgroundColor).toBeUndefined()
  const idleLabel = (await ui.findAll({ type: 'Button' })).find(b => b.props?.key === 'menu-spells')
  expect(idleLabel?.props).toMatchObject({ label: 'SPELL', dimColor: true })
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

test('every card is as wide as the others, its icon centred inside the frame', () => {
  for (const width of [50, 56, 57, 58, 59, 60, 63, 80]) {
    const card = cardWidth(width, 5, 8)
    expect(card * 5).toBeLessThanOrEqual(width)
    // An even number of columns around the 8-column icon: one share, or one column less.
    expect((card - 2 - 8) % 2).toBe(0)
    expect(Math.floor(width / 5) - card).toBeLessThanOrEqual(1)
  }
  expect(cardWidth(60, 5, 8)).toBe(12)
  expect(cardWidth(57, 5, 8)).toBe(10)
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

// The skills page's buttons, in order: what each casts and its key.
const skillButtons = async (ui: Awaited<ReturnType<typeof mountPane>>) =>
  (await ui.findAll({ type: 'Button' }))
    .filter(b => String(b.props?.key ?? '').startsWith('cast-'))
    .map(b => ({ label: b.props?.label, hotkey: b.props?.hotkey, dimColor: b.props?.dimColor }))

test('casting a skill raises its mastery on the skills page', async ($, on) => {
  const { clock } = world(on, { usage: ONE_SKILL })
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  await $.tool.call({ tool: 'Skill', skill: 'commit' } as never)
  // The lifetime count saves beside the call.
  await clock.advance(0)

  const ui = await mountPane($, 'terminal', 40)
  await showTab($, ui, 'skills')
  const shown = (await texts(ui)).join('|')
  expect(shown).toContain('1/1 learned · a letter casts')
  expect(shown).toContain('❖ Personal')
  expect(shown).toContain('★☆☆')
  expect(shown).toContain('×1')
  // Cast in the last five minutes: it glows.
  expect(shown).toContain('✦')
  expect(shown).toContain('context7')
  expect(await skillButtons(ui)).toEqual([{ label: 'commit', hotkey: 'a', dimColor: false }])
})

test("a skill's button, or its letter, puts it in the prompt box", async ($, on) => {
  const { fills } = world(on, { usage: ONE_SKILL })
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mountPane($, surface, 40)
    await showTab($, ui, 'skills', surface)
    await ui.press({ key: 'cast-commit' })
  }
  expect(fills).toEqual(['/commit ', '/commit '])
})

test('the letters go to the skills in view, a from the top', () => {
  const skill = (name: string) => ({ kind: 'skill' as const, name, uses: 0, isGlowing: false })
  const rows = [{ kind: 'school' as const, text: 'Personal' }, skill('a1'), skill('a2'), { kind: 'gap' as const }, skill('b1'), skill('b2')]
  expect([...skillKeys(rows, 0, 10)]).toEqual([
    [1, 'a'],
    [2, 'b'],
    [4, 'c'],
    [5, 'd'],
  ])
  // Scrolled two rows down with room for three: a2 and b1 are in view.
  expect([...skillKeys(rows, 2, 3)]).toEqual([
    [2, 'a'],
    [4, 'b'],
  ])
  // j and k scroll the window, so no skill takes them; past the rest of the alphabet, a skill has no key.
  expect(SKILL_KEYS).not.toContain('j')
  expect(SKILL_KEYS).not.toContain('k')
  const many = Array.from({ length: 30 }, (_, at) => skill(`s${at}`))
  expect(skillKeys(many, 0, 30).size).toBe(SKILL_KEYS.length)
})

test('the first cast unlocks a feat and saves the progress', async ($, on) => {
  const { clock, store } = world(on)
  await $.tool.call({ tool: 'Read', file_path: '/x/a.md' })
  // The save runs beside the call, never in its way.
  await clock.advance(0)
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
  const { clock, store } = world(on, { stored: { progress: { ...EMPTY_PROGRESS, totalCalls: 50, unlocked: { 'first-cast': 1 } } } })
  await $.tool.call({ tool: 'Read', file_path: '/x/a.md' })
  await clock.advance(0)
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
  // Wrappers, flags and binaries run straight through a package manager.
  expect(kinds('uv run pytest -q')).toBe('test')
  expect(kinds('poetry run pytest')).toBe('test')
  expect(kinds('pnpm vitest run')).toBe('test')
  expect(kinds('yarn jest --ci')).toBe('test')
  expect(kinds('pnpm --filter web test')).toBe('test')
  expect(kinds('npm --prefix app run lint')).toBe('lint')
  expect(kinds('npx -y vitest')).toBe('test')
  expect(kinds('pnpm exec tsc --noEmit')).toBe('types')
  expect(kinds('make test')).toBe('test')
  expect(kinds('make -j4 lint')).toBe('lint')
  expect(kinds('make build')).toBeUndefined()
  expect(kinds('uv pip install pytest')).toBeUndefined()
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

test('a store that cannot be read is never overwritten', async ($, on) => {
  const { store } = world(on, { isStoreDown: true, stored: { progress: { ...EMPTY_PROGRESS, totalCalls: 50 } } })
  await $.tool.call({ tool: 'Read', file_path: '/x/a.md' })
  expect((store.get('progress') as { totalCalls: number }).totalCalls).toBe(50)
  // This session's copy still counts the call.
  const ui = await mountPane($, 'desktop')
  await showTab($, ui, 'feats', 'desktop')
  expect((await texts(ui)).join('|')).toContain('1/15 earned')
})

test('only a command that starts git refreshes the map', () => {
  expect(runsGit('git status')).toBe(true)
  expect(runsGit('cd app && git commit -m "x"')).toBe(true)
  expect(runsGit('GIT_PAGER=cat /usr/bin/git log')).toBe(true)
  expect(runsGit('if git diff --quiet; then echo clean; fi')).toBe(true)
  expect(runsGit('for f in a b; do git add "$f"; done')).toBe(true)
  expect(runsGit('(cd app && git pull)')).toBe(true)
  expect(runsGit('! git merge-base --is-ancestor a b')).toBe(true)
  expect(runsGit('grep git README.md')).toBe(false)
  expect(runsGit('cat .gitignore')).toBe(false)
  expect(runsGit('echo "use git"')).toBe(false)
})

test("a refusal is the person's choice, not a fizzle", () => {
  expect(isRefusal({ deny: 'blocked by a hook' })).toBe(true)
  const no = "The user doesn't want to proceed with this tool use. The tool use was rejected."
  expect(isRefusal({ isError: true, text: no })).toBe(true)
  expect(isRefusal({ isError: true, text: 'Exit code 1' })).toBe(false)
  expect(isRefusal({ text: no })).toBe(false)
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a refused call costs no heart and keeps the combo on ${surface}`, async ($, on) => {
    world(on, { tool: e => (e.tool === 'Bash' ? { deny: 'not now' } : undefined) })
    await $.tool.call({ tool: 'Read', file_path: '/x/a.md' })
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    await $.tool.call({ tool: 'Read', file_path: '/x/b.md' })

    const ui = await mountPane($, surface)
    const shown = (await texts(ui)).join('|')
    expect(shown).toContain('5/5')
    expect(shown).toContain('⊘')
    // A refused check run summons no boss.
    expect(shown).not.toContain('☠')
  })
}

test('a refused call earns no XP and no lifetime count', async ($, on) => {
  const { clock, store } = world(on, { tool: e => (e.tool === 'Bash' ? { deny: 'not now' } : undefined) })
  await $.tool.call({ tool: 'Read', file_path: '/x/a.md' })
  await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  await $.tool.call({ tool: 'Read', file_path: '/x/b.md' })
  await clock.advance(0)
  const saved = store.get('progress') as { totalCalls: number; bashCalls: number }
  expect(saved.totalCalls).toBe(2)
  expect(saved.bashCalls).toBe(0)

  const ui = await mountPane($, 'desktop')
  expect((await texts(ui)).join('|')).toContain('2 casts')
})

test('a burst of calls all count, however the saves batch them', async ($, on) => {
  const { clock, store } = world(on)
  await Promise.all([1, 2, 3, 4, 5].map(n => $.tool.call({ tool: 'Read', file_path: `/x/${n}.md` })))
  await clock.advance(0)
  expect((store.get('progress') as { totalCalls: number }).totalCalls).toBe(5)
})

test('mana alarms sound once each, and again after a compact', () => {
  expect(MANA_ALARMS).toEqual([80, 90])
  expect(manaAlarm(50, 0)).toEqual({ warned: 0 })
  expect(manaAlarm(82, 0)).toEqual({ alarm: 80, warned: 80 })
  expect(manaAlarm(85, 80)).toEqual({ warned: 80 })
  expect(manaAlarm(95, 80)).toEqual({ alarm: 90, warned: 90 })
  // Straight past both: the higher one alone.
  expect(manaAlarm(93, 0)).toEqual({ alarm: 90, warned: 90 })
  // A compact empties the context; filling it again warns again.
  expect(manaAlarm(30, 90)).toEqual({ warned: 0 })
  expect(manaAlarm(81, 0)).toEqual({ alarm: 80, warned: 80 })
})

test('the mana alarm toasts when the context fills', async ($, on) => {
  const { toasts } = world(on, { usage: { startedAt: 0, rateLimits: [], context: { window: 200000, percent: 84 } } })
  await $.tool.call({ tool: 'Read', file_path: '/x/a.md' })
  await $.tool.call({ tool: 'Read', file_path: '/x/b.md' })
  expect(toasts.filter(text => text.startsWith('🔮'))).toEqual(['🔮 Mana low: context 80% full. /compact to restore it'])
})

test('a background pet announces its return; a foreground one does not', async ($, on) => {
  let spawned = 0
  const { toasts } = world(on, {
    // The Agent tool spawns its pet before it answers, as core's does.
    tool: async e => {
      if (e.tool !== 'Agent') return undefined
      spawned += 1
      await $.agent.spawn({ prompt: 'go', description: e.description, subagentType: 'Explore', tool_use_id: e.tool_use_id } as never)
      return { result: { text: 'ok' } }
    },
  })
  on('agent.spawn', async () => ({ model: 'claude-haiku-4-5', agentId: `agent-${spawned}` }))
  await $.tool.call({ tool: 'Agent', tool_use_id: 'tu-1', description: 'Map the repo', prompt: 'go', run_in_background: true } as never)
  await $.tool.call({ tool: 'Agent', tool_use_id: 'tu-2', description: 'Read docs', prompt: 'go' } as never)
  await $.turn.complete({ agentId: 'agent-1', answer: 'Mapped 12 modules', durationMs: 5, isAborted: false, turnId: 't' } as never)
  await $.turn.complete({ agentId: 'agent-2', answer: 'Docs read', durationMs: 5, isAborted: false, turnId: 't' } as never)
  expect(toasts.filter(text => text.includes('returned'))).toEqual(['🐾 Scout Hawk returned: Mapped 12 modules'])
})

test('a fallen pet says what it was sent to do', () => {
  expect(returnToast({ kind: 'Explore', description: 'Map the repo', loot: '' }, 'err')).toBe('🐾 Scout Hawk fell: Map the repo')
  expect(returnToast({ kind: 'Explore', description: 'Map the repo' }, 'ok')).toBe('🐾 Scout Hawk returned: Map the repo')
})

// --- Bosses in chains ---

test('a chain of checks fails at the one its output shows', () => {
  const chain = 'npm test && npm run lint && npx tsc --noEmit'
  expect(bossesFor(chain).map(one => one.kind)).toEqual(['test', 'lint', 'types'])
  expect(bossesFor('npm test; npm test').map(one => one.kind)).toEqual(['test'])
  const kindAt = (command: string, output: string) => failedGuard(command, output)?.guard.kind

  expect(kindAt(chain, 'Tests  12 passed\n✖ 3 problems (3 errors, 0 warnings)')).toBe('lint')
  expect(kindAt(chain, 'Tests  2 failed | 10 passed')).toBe('test')
  expect(kindAt(chain, 'Tests  12 passed\nsrc/a.ts(3,1): error TS2322: nope')).toBe('types')
  // Nothing telling: the first check, as before.
  expect(kindAt(chain, 'exit 1')).toBe('test')
  expect(kindAt('cd app && npm test', 'exit 1')).toBe('test')
})

test("a check that never ran is not blamed for its neighbour's wording", () => {
  // Playwright failed, so `&&` never ran the tests; both print `N failed`.
  expect(failedGuard('npx playwright test && npm test', '  3 failed\n  10 passed')?.guard.kind).toBe('e2e')
  // A passing run's `0 failed` is no sign of failure; clippy's own output matched nothing.
  expect(failedGuard('cargo test && cargo clippy -- -D warnings', 'test result: ok. 12 passed; 0 failed\nwarning: unused')?.guard.kind).toBe('test')
  // Lint warnings alone are no lint failure.
  expect(failedGuard('npm run lint && npm test', '✖ 30 problems (0 errors, 30 warnings)\nTests  2 failed')?.guard.kind).toBe('test')
  // Other work in the chain may be what failed: no boss on a guess.
  expect(failedGuard('npm test && git push', 'Tests  12 passed\n! [rejected] main -> main')).toBeUndefined()
})

test("the boss's HP counts the failed check's own output", () => {
  const fought = fightBoss(null, 'npm run lint && npm test', true, '✖ 30 problems (0 errors, 30 warnings)\nFAIL src/a.test.ts\nTests  2 failed')
  expect(fought.boss?.name).toBe('Bug Hydra')
  expect(fought.boss?.hp).toBe(2)
})

test('only what the exit code vouches for slays a boss', () => {
  const goblin = fightBoss(null, 'npm run lint', true, '✖ 3 problems (3 errors, 0 warnings)').boss
  // After `;` or a pipe the exit code is the last part's alone.
  expect(fightBoss(goblin, 'npm run lint; npm test', false, '').event).toBeUndefined()
  expect(fightBoss(goblin, 'npm run lint | tee lint.log', false, '').event).toBeUndefined()
  expect(fightBoss(goblin, 'npm test; npm run lint', false, '').event).toBe('defeat')
  expect(fightBoss(goblin, 'cd web && npm run lint && npm test', false, '').event).toBe('defeat')
})

test('a failing lint after passing tests summons the lint goblin, and the passing chain slays it', () => {
  const command = 'npm test && npm run lint'
  const fought = fightBoss(null, command, true, 'Tests  12 passed\n✖ 3 problems (3 errors, 0 warnings)')
  expect(fought.boss?.name).toBe('Lint Goblin')
  expect(fought.boss?.hp).toBe(3)
  expect(fightBoss(fought.boss, command, false, '').event).toBe('defeat')
  // A pass that never ran the boss's check leaves it standing.
  expect(fightBoss(fought.boss, 'npm test', false, '').event).toBeUndefined()
})

test("the boss's fix names what failed and the command that showed it", () => {
  expect(fightText({ kind: 'lint', command: 'pnpm lint' })).toBe('Fix the lint errors from `pnpm lint` and run it again until it passes')
  expect(fightText({ kind: 'weird', command: 'make check' })).toBe('Fix the failures from `make check` and run it again until it passes')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`pressing fix on the boss fills the prompt on ${surface}`, async ($, on) => {
    const { fills } = world(on, { tool: failBash('Found 4 errors in 2 files.') })
    await $.tool.call({ tool: 'Bash', command: 'npx tsc --noEmit' })
    const ui = await mountPane($, surface)
    await ui.press({ key: 'fight' })
    expect(fills).toEqual(['Fix the type errors from `npx tsc --noEmit` and run it again until it passes'])
  })
}

// --- Spell book filters ---

test('the spell book filters fizzles and slow casts', async ($, on) => {
  world(on, { tool: failBash('boom') })
  await $.tool.call({ tool: 'Read', file_path: '/x/a.md' })
  await $.tool.call({ tool: 'Bash', command: 'make broken' })
  await $.tool.call({ tool: 'Read', file_path: '/x/b.md' })

  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'filter-errors' })
  let shown = (await texts(ui)).join('|')
  expect(shown).toContain('1 of 3 casts')
  expect(shown).toContain('make broken')
  expect(shown).not.toContain('a.md')

  await ui.press({ key: 'filter-slow' })
  shown = (await texts(ui)).join('|')
  expect(shown).toContain('0 of 3 casts')
  expect(shown).toContain('Nothing took 5s or more.')

  await ui.press({ key: 'filter-all' })
  expect((await texts(ui)).join('|')).toContain('a.md')
})

test('slow casts are kept by the slow filter and coloured by how slow', () => {
  const call = (id: string, ms: number) => ({ id, tool: 'Bash', summary: '', startedAt: 0, ms, status: 'ok' as const })
  expect(filterSpells([call('a', 200), call('b', 5000), call('c', 40000)], 'slow').map(one => one.id)).toEqual(['b', 'c'])
  expect(timeColor(200)).toBeUndefined()
  expect(timeColor(5000)).toBe('yellow')
  expect(timeColor(40000)).toBe('red')
  expect(timeColor(undefined)).toBeUndefined()
})

// --- Recap ---

test('the recap leaves out what the session never did', () => {
  const text = recapText({
    hero: CLASSES.knight,
    level: 1,
    casts: 0,
    calls: [],
    tally: { failures: 0, refusals: 0, bossesDefeated: 0, petsSummoned: 0 },
    bestCombo: 0,
    boss: null,
    touched: [],
    trophies: [],
  })
  expect(text).toBe('⚔ Claude the knight · Lv.1 Squire\n✦ 0 casts · ✗ 0 blows parried · ⚡ best combo 0')
})

test('the recap durations and most cast tools', () => {
  expect(formatDuration(40_000)).toBe('40s')
  expect(formatDuration(14 * 60_000)).toBe('14m')
  expect(formatDuration(125 * 60_000)).toBe('2h 05m')
  const call = (tool: string) => ({ id: tool, tool, summary: '', startedAt: 0, status: 'ok' as const })
  expect(topTools(['Read', 'Bash', 'Read', 'Edit', 'Bash', 'Read', 'Grep'].map(call))).toBe('Read 3 · Bash 2 · Edit 1')
})

test('/hud recap sums up the session', async ($, on) => {
  const { clock } = world(on, {
    tool: e => (e.tool === 'Bash' && e.command === 'npm test' ? fail('2 failed') : e.tool === 'Write' ? { deny: 'no' } : undefined),
    usage: { startedAt: 0, rateLimits: [], context: { window: 200000, percent: 42 }, cost: { usd: 1.5 } },
  })
  await $.command.run({ command: 'hud', args: 'class knight' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/x/a.md' })
  await $.tool.call({ tool: 'Edit', file_path: '/x/a.md' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.tool.call({ tool: 'Write', file_path: '/x/c.md' })
  await clock.advance(30 * 60_000)
  const answer = (await $.command.run({ command: 'hud', args: 'recap' } as never)) as { text: string }
  expect(answer.text.split('\n')).toEqual([
    '⚔ Claude the knight · Lv.1 Squire · 30m',
    '✦ 3 casts · ✗ 1 blows parried · ⊘ 1 refused · ⚡ best combo 2',
    '📖 most cast: Bash 1 · Edit 1 · Read 1',
    '☠ 0 bosses defeated · Bug Hydra still stands (HP 2)',
    '🗺 1 file explored · ✎ 1 edited',
    '⛁ $1.50 · 🔮 context 42% full',
    '🏆 First Spark',
  ])
})

// --- Waiting on the person ---

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the panel says when the session waits on the person on ${surface}`, async ($, on) => {
    world(on)
    on('classic.PermissionRequest', async () => ({}))
    const ui = await mountPane($, surface)
    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' } } as never)
    expect((await texts(ui)).join('|')).toContain('❗ awaiting your word on Bash')

    // Another tool finishing leaves the prompt up; the asked-about one ends it.
    await $.tool.call({ tool: 'Read', file_path: '/x/a.md' })
    expect((await texts(ui)).join('|')).toContain('❗ awaiting your word on Bash')
    await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
    expect((await texts(ui)).join('|')).not.toContain('❗')
  })
}

test('an open question waits on the person until answered', async ($, on) => {
  let ui: Awaited<ReturnType<typeof mountPane>> | undefined
  let whileOpen = ''
  world(on, {
    // What the panel shows while the question is still open.
    tool: async e => {
      if (e.tool === 'AskUserQuestion' && ui !== undefined) whileOpen = (await texts(ui)).join('|')
      return undefined
    },
  })
  ui = await mountPane($, 'terminal')
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
  expect(whileOpen).toContain('❗ awaiting your answer')
  expect((await texts(ui)).join('|')).not.toContain('❗')
})

test("a subagent's call of the asked-about tool leaves the prompt up", async ($, on) => {
  world(on)
  on('classic.PermissionRequest', async () => ({}))
  const ui = await mountPane($, 'terminal')
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' } } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'agent-1' } as never)
  expect((await texts(ui)).join('|')).toContain('❗ awaiting your word on Bash')
})

test('a permission another hook decides never waits on the person', async ($, on) => {
  world(on)
  on('classic.PermissionRequest', async () => ({ decision: { behavior: 'allow' } }))
  const ui = await mountPane($, 'terminal')
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' } } as never)
  expect((await texts(ui)).join('|')).not.toContain('❗')
})

// --- Help ---

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the ? opens the help page and closes it again on ${surface}`, async ($, on) => {
    world(on)
    const ui = await mountPane($, surface)
    await ui.press({ key: 'help' })
    let shown = (await texts(ui)).join('|')
    expect(shown).toContain('❓ HELP')
    expect(shown).toContain('/hud class [name]')
    expect(shown).not.toContain('budget')

    await ui.press({ key: 'help' })
    shown = (await texts(ui)).join('|')
    expect(shown).not.toContain('❓ HELP')
    expect(shown).toContain('📖 SPELL BOOK')

    // Back on the page, or a pick from the menu, closes it too.
    await ui.press({ key: 'help' })
    await ui.press({ key: 'help-back' })
    expect((await texts(ui)).join('|')).toContain('📖 SPELL BOOK')
    await ui.press({ key: 'help' })
    await showTab($, ui, 'feats', surface)
    shown = (await texts(ui)).join('|')
    expect(shown).not.toContain('❓ HELP')
  })
}

test('/hud help lists every command and tip', async ($, on) => {
  world(on)
  const answer = (await $.command.run({ command: 'hud', args: 'help' } as never)) as { text: string }
  expect(answer.text).toBe(helpText())
  for (const one of HELP_COMMANDS) expect(answer.text).toContain(one.usage)
  expect(answer.text).toContain('/hud class [name]  Reroll the hero')
  expect(answer.text).not.toContain('budget')
})

test('a window stops at the first item that does not fit', () => {
  const item = (key: string, rows: number) => ({ key, rows, node: null })
  const { shown, end } = pageItems([item('a', 1), item('b', 2), item('c', 1)], 0, 2)
  expect(shown.map(one => one.key)).toEqual(['a'])
  expect(end).toBe(1)
})

test("auto mode's denial is a refusal, whatever its wording", async ($, on) => {
  const { clock, store } = world(on, {
    // The classifier denies the Bash call while it is under way; the model reads its own wording.
    tool: async e => {
      if (e.tool !== 'Bash') return undefined
      await $.classic.PermissionDenied({ tool_name: 'Bash', tool_input: {}, tool_use_id: e.tool_use_id, reason: 'risky' } as never)
      return fail('Permission for this action has been denied by auto mode.')
    },
  })
  on('classic.PermissionDenied', async () => ({}))
  await $.tool.call({ tool: 'Read', file_path: '/x/a.md' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'tu-auto', command: 'npm test' } as never)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'tu-auto-2', command: 'npm test' } as never)
  await clock.advance(0)

  const ui = await mountPane($, 'terminal')
  const shown = (await texts(ui)).join('|')
  expect(shown).toContain('5/5')
  expect(shown).toContain('⊘')
  expect(shown).not.toContain('☠')
  expect((store.get('progress') as { totalCalls: number }).totalCalls).toBe(1)
})

test('a failure auto mode never denied is still a failure', async ($, on) => {
  world(on, { tool: failBash('Exit code 1') })
  on('classic.PermissionDenied', async () => ({}))
  // A denial for another call leaves this one's failure standing.
  await $.classic.PermissionDenied({ tool_name: 'Bash', tool_input: {}, tool_use_id: 'someone-else', reason: 'risky' } as never)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'tu-1', command: 'false' } as never)
  const ui = await mountPane($, 'terminal')
  expect((await texts(ui)).join('|')).toContain('4/5')
})

// --- Menu keys ---

test('the number keys pick a tab and ? toggles the help page', async ($, on) => {
  world(on)
  const ui = await mountPane($, 'terminal')
  await ui.key({ key: '5', in: 'icon-spells' })
  expect((await texts(ui)).join('|')).toContain('🏆')
  await ui.key({ key: '3', in: 'icon-spells' })
  expect((await texts(ui)).join('|')).toContain('🧭 WORLD MAP')

  await ui.key({ key: '?', in: 'icon-spells' })
  expect((await texts(ui)).join('|')).toContain('❓ HELP')
  await ui.key({ key: '?', in: 'icon-spells' })
  expect((await texts(ui)).join('|')).not.toContain('❓ HELP')

  // The help page open, the active tab's own key closes it.
  await ui.key({ key: '?', in: 'icon-spells' })
  await ui.key({ key: '3', in: 'icon-spells' })
  expect((await texts(ui)).join('|')).not.toContain('❓ HELP')
})

test('desktop menu buttons carry their number as a hotkey', async ($, on) => {
  world(on)
  const ui = await mountPane($, 'desktop')
  const buttons = (await ui.findAll({ type: 'Button' })).filter(b => String(b.props?.key ?? '').startsWith('menu-'))
  expect(buttons.map(b => b.props?.hotkey)).toEqual(['1', '2', '3', '4', '5'])
})

test("a card's icon sits centred inside its frame", async ($, on) => {
  world(on)
  const ui = await mountPane($, 'terminal')
  // A 60-column pane: 12-column cards, 10 inside the frame, the 8-column icon with one column each side.
  const icon = (await ui.findAll({ type: 'Client' })).find(one => (one as { key?: string }).key === 'icon-map' || one.props?.key === 'icon-map')
  expect((icon?.props as { width?: number } | undefined)?.width).toBe(10)
  const rows = (await ui.findAll({ type: 'Text', in: 'icon-map' })).map(row => row.text ?? '')
  expect(rows.filter(text => text === ' ')).toHaveLength(6)
})

test("a pointer passing over a card's icon leaves nothing lit behind it", async ($, on) => {
  world(on)
  const ui = await mountPane($, 'terminal')
  const colours = async (tab: string) =>
    (await ui.findAll({ type: 'Text', in: `icon-${tab}` })).map(row => `${row.props?.color ?? ''}/${row.props?.backgroundColor ?? ''}`)
  const before = await colours('map')
  // A move with no leave after it, as a terminal may report a fast pointer: the icon draws the same.
  await ui.pointer({ type: 'enter', x: 3, y: 1, in: 'icon-map' })
  await ui.pointer({ type: 'move', x: 3, y: 1, in: 'icon-map' })
  await showTab($, ui, 'pets')
  expect(await colours('map')).toEqual(before)
  // The selected card's icon is the bright one.
  expect(await colours('pets')).not.toEqual(await colours('feats'))
  // (The hover group that lights the pixels is the surface's; the test tree omits hover props.)
})

test("a letter heard by a menu icon casts the skill shown under it", async ($, on) => {
  const { fills } = world(on, { usage: ONE_SKILL })
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  const ui = await mountPane($, 'terminal', 40)
  // The click that opens the skills page leaves its icon holding the keys.
  await showTab($, ui, 'skills')
  await ui.key({ key: 'a', in: 'icon-skills' })
  // A letter with no skill under it, and one heard on another tab, cast nothing.
  await ui.key({ key: 'z', in: 'icon-skills' })
  await ui.key({ key: '1', in: 'icon-skills' })
  await ui.key({ key: 'a', in: 'icon-spells' })
  expect(fills).toEqual(['/commit '])
})

test('j and k scroll the window: its buttons, or keys a menu icon hears', async ($, on) => {
  world(on)
  for (let n = 1; n <= 15; n += 1) {
    await $.tool.call({ tool: 'Read', file_path: `/x/f${n}.md` })
  }
  const ui = await mountPane($, 'terminal', 30)
  const shown = async () => (await texts(ui)).join('|')
  const scrollButtons = async () => (await ui.findAll({ type: 'Button' })).filter(b => String(b.props?.key ?? '').startsWith('scroll-'))
  // Keyed as vim's, the up one dim at the top.
  expect((await scrollButtons()).map(b => [b.props?.label, b.props?.hotkey, b.props?.dimColor])).toEqual([
    ['▲', 'k', true],
    ['▼', 'j', false],
  ])
  expect(await shown()).toContain('1–8/15')

  await ui.press({ key: 'scroll-down' })
  await ui.press({ key: 'scroll-down' })
  expect(await shown()).toContain('3–10/15')
  await ui.press({ key: 'scroll-up' })
  expect(await shown()).toContain('2–9/15')

  // A click on a menu icon leaves it the keys: j, k and the up and down arrows still scroll.
  await ui.key({ key: 'j', in: 'icon-spells' })
  await ui.key({ key: 'down', in: 'icon-spells' })
  expect(await shown()).toContain('4–11/15')
  await ui.key({ key: 'k', in: 'icon-spells' })
  await ui.key({ key: 'up', in: 'icon-spells' })
  expect(await shown()).toContain('2–9/15')
})

test('a window that shows all it has carries no scroll buttons', async ($, on) => {
  world(on)
  await $.tool.call({ tool: 'Read', file_path: '/x/a.md' })
  const ui = await mountPane($, 'terminal')
  expect((await ui.findAll({ type: 'Button' })).filter(b => String(b.props?.key ?? '').startsWith('scroll-'))).toHaveLength(0)
})

test('the down button dims once the window can scroll no further, tall items or not', async ($, on) => {
  world(on)
  let spawned = 0
  on('agent.spawn', async () => ({ model: 'claude-haiku-4-5', agentId: `agent-${(spawned += 1)}` }))
  const ui = await mountPane($, 'terminal')
  await showTab($, ui, 'pets')
  // Enough pets that their four-row cards outgrow the window.
  for (let n = 1; n <= 6; n += 1) {
    await $.agent.spawn({ prompt: 'go', description: `Task ${n}`, subagentType: 'Explore', tool_use_id: `tu-${n}` } as never)
  }
  const down = async () => (await ui.findAll({ type: 'Button' })).find(b => b.props?.key === 'scroll-down')?.props?.dimColor
  expect(await down()).toBe(false)
  for (let n = 0; n < 40; n += 1) await ui.press({ key: 'scroll-down' })
  expect(await down()).toBe(true)
})

// --- Following the action ---

test('the window follows a sent message to the tab of what happens', async ($, on) => {
  world(on, { usage: ONE_SKILL, git: argv => (argv[0] === 'git' ? { stdout: '' } : undefined) })
  on('agent.spawn', async () => ({ model: 'claude-haiku-4-5', agentId: 'agent-1' }))
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  const ui = await mountPane($, 'terminal', 40)
  const shown = async () => (await texts(ui)).join('|')

  await $.tool.call({ tool: 'Skill', skill: 'commit' } as never)
  expect(await shown()).toContain('📜 SKILLS')
  await $.agent.spawn({ prompt: 'go', description: 'Scout', subagentType: 'Explore', tool_use_id: 'tu-1' } as never)
  expect(await shown()).toContain('🐾 PARTY')
  await $.tool.call({ tool: 'Bash', command: 'git status' })
  expect(await shown()).toContain('🧭 WORLD MAP')
  // A read or an edit stays where the window is.
  await $.tool.call({ tool: 'Read', file_path: '/x/a.md' })
  expect(await shown()).toContain('🧭 WORLD MAP')
})

test('a typed /skill turns to the skills', async ($, on) => {
  world(on, { usage: ONE_SKILL })
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  const ui = await mountPane($, 'terminal', 40)
  await $.prompt.submit({ text: '/commit fix the typo' } as never)
  expect((await texts(ui)).join('|')).toContain('📜 SKILLS')
})

test('a tab the person picks holds the window until their next message', async ($, on) => {
  world(on, { usage: ONE_SKILL })
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  const ui = await mountPane($, 'terminal', 40)
  await ui.press({ key: 'menu-feats' })
  await $.tool.call({ tool: 'Skill', skill: 'commit' } as never)
  expect((await texts(ui)).join('|')).toContain('🏆')
  // The next message lets it follow again.
  await $.prompt.submit({ text: 'and now?' } as never)
  await $.tool.call({ tool: 'Skill', skill: 'commit' } as never)
  expect((await texts(ui)).join('|')).toContain('📜 SKILLS')
})

test('/hud follow turns the following off, and on again', async ($, on) => {
  const { store } = world(on, { usage: ONE_SKILL })
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  expect(await $.command.run({ command: 'hud', args: 'follow' } as never)).toMatchObject({ text: 'The HUD stays on the tab you pick.' })
  expect(store.get('follow')).toBe(false)
  const ui = await mountPane($, 'terminal', 40)
  await $.tool.call({ tool: 'Skill', skill: 'commit' } as never)
  expect((await texts(ui)).join('|')).toContain('📖 SPELL BOOK')
  expect(await $.command.run({ command: 'hud', args: 'follow' } as never)).toMatchObject({ text: 'The HUD follows the action to its tab.' })
  await $.tool.call({ tool: 'Skill', skill: 'commit' } as never)
  expect((await texts(ui)).join('|')).toContain('📜 SKILLS')
})

test('a sent message turns the window to the spell book, where its calls show', async ($, on) => {
  world(on, { usage: ONE_SKILL })
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  const ui = await mountPane($, 'terminal', 40)
  await showTab($, ui, 'feats')
  await $.prompt.submit({ text: 'what changed?' } as never)
  expect((await texts(ui)).join('|')).toContain('📖 SPELL BOOK')
  // With the help page open it stays put.
  await showTab($, ui, 'feats')
  await ui.press({ key: 'help' })
  await $.prompt.submit({ text: 'again' } as never)
  expect((await texts(ui)).join('|')).toContain('❓ HELP')
})

test("/hud with a tab's number opens that tab", async ($, on) => {
  world(on)
  on('ui.open', async () => ({ value: undefined }) as never)
  const ui = await mountPane($, 'terminal')
  await $.command.run({ command: 'hud', args: '5' } as never)
  expect((await texts(ui)).join('|')).toContain('🏆')
  await $.command.run({ command: 'hud', args: '3' } as never)
  expect((await texts(ui)).join('|')).toContain('🧭 WORLD MAP')
  // A number past the menu only opens the HUD.
  await $.command.run({ command: 'hud', args: '9' } as never)
  expect((await texts(ui)).join('|')).toContain('🧭 WORLD MAP')
})

test('/hud names a tab as its card shows it, in any case', async ($, on) => {
  world(on)
  on('ui.open', async () => ({ value: undefined }) as never)
  const ui = await mountPane($, 'terminal')
  await $.command.run({ command: 'hud', args: 'party' } as never)
  expect((await texts(ui)).join('|')).toContain('🐾 PARTY')
  await $.command.run({ command: 'hud', args: 'SKILL' } as never)
  expect((await texts(ui)).join('|')).toContain('📜 SKILLS')
  await $.command.run({ command: 'hud', args: 'Spell' } as never)
  expect((await texts(ui)).join('|')).toContain('📖 SPELL BOOK')
  // The ids still work.
  await $.command.run({ command: 'hud', args: 'pets' } as never)
  expect((await texts(ui)).join('|')).toContain('🐾 PARTY')
})

test('reading a diff holds the window: a pick or a press in the pane stops the following', async ($, on) => {
  world(on, { usage: ONE_SKILL })
  // Beneath the plugin, the engine's own scroll of a window that has nothing more to show.
  on('ui.scroll', async () => ({}) as never)
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't' } as never)
  const ui = await mountPane($, 'terminal', 40)
  await $.prompt.submit({ text: 'look' } as never)
  // A press on any button in the pane, here the help page's, holds it.
  await ui.press({ key: 'help' })
  await ui.press({ key: 'help-back' })
  await $.tool.call({ tool: 'Skill', skill: 'commit' } as never)
  expect((await texts(ui)).join('|')).toContain('📖 SPELL BOOK')
  // The wheel too, after the next message.
  await $.prompt.submit({ text: 'again' } as never)
  await $.ui.scroll({ component: 'Pane', requestId: 'rpg-hud', offset: 0, by: 1, bodyRows: 40, contentRows: 40, origin: { kind: 'person' } } as never)
  await $.tool.call({ tool: 'Skill', skill: 'commit' } as never)
  expect((await texts(ui)).join('|')).toContain('📖 SPELL BOOK')
  // Left alone after a message, it follows.
  await $.prompt.submit({ text: 'and again' } as never)
  await $.tool.call({ tool: 'Skill', skill: 'commit' } as never)
  expect((await texts(ui)).join('|')).toContain('📜 SKILLS')
})
