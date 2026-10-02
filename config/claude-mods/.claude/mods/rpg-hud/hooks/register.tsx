import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type {
  BagItem,
  Boss,
  Combo,
  Gear,
  GitMap,
  Inspect,
  Loadout,
  MapView,
  Outpost,
  Pet,
  Progress,
  Tab,
  ToolCall,
  ToolCallStatus,
  TouchedFile,
  Vitals,
} from '../types'
import { FRAME_MS, HERO_CELLS, HURT_MS, PET_TICKS, anim, pickFrame, pickMood } from './anim'
import { fightBoss } from './boss'
import type { BagRow, BagProps } from './bag-client'
import { GIT_LOG, GIT_NUMSTAT, GIT_REMOTES, GIT_STATUS, GIT_WORKTREES, diffArgv, outpostArgv, parseBag, parseStatus, parseWorktrees, shortAge } from './git'
import type { OutpostRow, OutpostsProps } from './outposts-client'
import { bagSubtitle, inspectItems } from './inspect'
import { renderEditCard } from './edit-card'
import type { EditOutput } from './edit-card'
import { CALLS_PER_LEVEL, STATUS_ROWS, normalizeCall, renderStatus } from './hero'
import { CLASS_IDS, classOf, isClassId, rankOf, rollClass } from './classes'
import { mapItems, mapSubtitle } from './map'
import { ICON_ROWS, MENU, entryOf, iconText, isTab } from './menu'
import { slotLayout } from './menu-client'
import type { MenuProps } from './menu-client'
import { PET_COLUMNS, PET_ROWS, petCells, speciesFor } from './pet-sprites'
import { partySubtitle, petItems } from './pets'
import { castText, skillRows, skillsSubtitle } from './skills'
import type { SkillsProps } from './skills-client'
import { spellItems } from './spellbook'
import { EMPTY_PROGRESS, TROPHIES, newlyEarned } from './trophies'
import { featItems, featsSubtitle } from './trophy-room'
import { summarize } from './util'
import { WINDOW_CHROME_COLUMNS, WINDOW_CHROME_ROWS, clampOffset, pageItems, renderWindow, totalRows } from './window'
import type { Item } from './window'

const calls = atom({ plugin: 'rpg-hud', key: 'calls' } as const, [] as ToolCall[])
// Rows scrolled down each menu window; the status panel and the menu never scroll.
const offsets = atom({ plugin: 'rpg-hud', key: 'offsets' } as const, {} as Record<string, number>)
const flashUntil = atom({ plugin: 'rpg-hud', key: 'flashUntil' } as const, 0)
const tab = atom({ plugin: 'rpg-hud', key: 'tab' } as const, 'spells' as Tab)
// Empty until the session rolls its class; a reload keeps the roll.
const heroClass = atom({ plugin: 'rpg-hud', key: 'heroClass' } as const, '')
const pets = atom({ plugin: 'rpg-hud', key: 'pets' } as const, [] as Pet[])
const vitals = atom({ plugin: 'rpg-hud', key: 'vitals' } as const, {} as Vitals)
const combo = atom({ plugin: 'rpg-hud', key: 'combo' } as const, { current: 0, best: 0 } as Combo)
const boss = atom({ plugin: 'rpg-hud', key: 'boss' } as const, null as Boss | null)
const map = atom({ plugin: 'rpg-hud', key: 'map' } as const, {
  isRepo: false,
  branch: '',
  ahead: 0,
  behind: 0,
  dirty: 0,
  graph: [],
} as GitMap)
const touched = atom({ plugin: 'rpg-hud', key: 'touched' } as const, [] as TouchedFile[])
const bag = atom({ plugin: 'rpg-hud', key: 'bag' } as const, [] as BagItem[])
const mapView = atom({ plugin: 'rpg-hud', key: 'mapView' } as const, { view: 'map' } as MapView)
const inspect = atom({ plugin: 'rpg-hud', key: 'inspect' } as const, null as Inspect | null)
const outposts = atom({ plugin: 'rpg-hud', key: 'outposts' } as const, [] as Outpost[])
const outpostBag = atom({ plugin: 'rpg-hud', key: 'outpostBag' } as const, null as { root: string; items: BagItem[] } | null)
const loadout = atom({ plugin: 'rpg-hud', key: 'loadout' } as const, { skills: [], gear: [] } as Loadout)
const skillCasts = atom({ plugin: 'rpg-hud', key: 'skillCasts' } as const, {} as Record<string, number>)

const progress = atom({ plugin: 'rpg-hud', key: 'progress' } as const, EMPTY_PROGRESS)

const PANE = 'rpg-hud'
const TITLE = 'Adventure'
const COMMAND = 'hud'
const PROGRESS_KEY = 'progress'
// Set to false by `/hud cards` to give Edit and Write results back to the engine's own drawing.
const CARDS_KEY = 'editCards'
const CARD_TOOLS = new Set(['Edit', 'Write'])

// A menu card: the bracket rows above and below, the pixel icon and the label row.
const SLOT_ROWS = 2 + ICON_ROWS + 1
// The narrowest slot that holds the 8-column icon with a column of air each side.
const MIN_SLOT_COLUMNS = 10
// The window keeps at least this many rows before the menu shrinks to one line.
const MIN_WINDOW_ROWS = 4
// The status panel glows this long after a level up.
const FLASH_MS = 2500

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])
// The longest diff the inspect view keeps, and how many new files' lines the bag counts.
const DIFF_LINES = 3000
const COUNTED_NEW_FILES = 30
// Outposts beyond this many are listed without their status, which costs a git run each.
const SURVEYED_OUTPOSTS = 10
// Midnight to 4 a.m., local time.
const NIGHT_HOURS = 4

const firstLine = (text: string): string => text.split('\n').find(line => line.trim().length > 0)?.trim() ?? ''

// A tool's touch on a file, counted under the path relative to the session's folder.
export const touchFile = (list: readonly TouchedFile[], path: string, isEdit: boolean): TouchedFile[] => {
  const found = list.find(file => file.path === path) ?? { path, reads: 0, edits: 0 }
  const next = { ...found, reads: found.reads + (isEdit ? 0 : 1), edits: found.edits + (isEdit ? 1 : 0) }
  return [...list.filter(file => file.path !== path), next].slice(-200)
}

// The skill a typed `/name args` prompt invokes, when `name` is a known skill.
export const skillOfPrompt = (text: string, known: readonly string[]): string | undefined => {
  const name = /^\/([\w:.-]+)/.exec(text.trim())?.[1]
  return name !== undefined && known.includes(name) ? name : undefined
}

// Applies `change` to the lifetime progress, saves it, and celebrates any trophy it earns.
async function advance($: EngineInterface, change: (p: Progress) => Progress) {
  const now = await $.clock.now()
  let earned: string[] = []
  await update($, progress, current => {
    const next = change({ ...EMPTY_PROGRESS, ...current })
    const fresh = newlyEarned(next)
    earned = fresh.map(trophy => trophy.title)
    if (fresh.length === 0) return next
    return { ...next, unlocked: { ...next.unlocked, ...Object.fromEntries(fresh.map(t => [t.id, now])) } }
  })
  await $.store.set(PROGRESS_KEY, await read($, progress))
  for (const title of earned) {
    $.ui.toast(`🏆 Trophy unlocked: ${title}`)
  }
}

async function loadProgress($: EngineInterface) {
  const stored = (await $.store.get(PROGRESS_KEY).catch(() => undefined)) as Partial<Progress> | undefined
  await update($, progress, () => ({ ...EMPTY_PROGRESS, ...stored }))
}

async function refreshVitals($: EngineInterface) {
  const usage = await $.session.usage().catch(() => undefined)
  if (usage === undefined) return
  const contextPercent = usage.context.percent
  await update($, vitals, () => ({ contextPercent, usd: usage.cost?.usd }))
  if (contextPercent !== undefined) {
    await advance($, p => ({ ...p, peakContext: Math.max(p.peakContext, Math.round(contextPercent)) }))
  }
}

// The skills and MCP servers the context lists, from the free local estimate of /context.
async function refreshLoadout($: EngineInterface) {
  const usage = await $.session.usage({ breakdown: 'summary' }).catch(() => undefined)
  const breakdown = usage?.context.breakdown
  if (breakdown === undefined) return
  const skills = (breakdown.skills?.skillFrontmatter ?? []).map(skill => ({
    name: skill.name,
    source: skill.source,
    ...(skill.pluginName === undefined ? {} : { plugin: skill.pluginName }),
  }))
  const servers = new Map<string, Gear>()
  for (const tool of breakdown.mcpTools) {
    const gear = servers.get(tool.serverName) ?? { server: tool.serverName, tools: 0, isLoaded: false }
    servers.set(tool.serverName, { ...gear, tools: gear.tools + 1, isLoaded: gear.isLoaded || tool.isLoaded })
  }
  const gear = [...servers.values()].sort((a, b) => a.server.localeCompare(b.server))
  await update($, loadout, () => ({ skills, gear }))
}

const toplevel = async ($: EngineInterface) =>
  (await $.process.run(['git', 'rev-parse', '--show-toplevel']).catch(() => undefined))?.stdout.trim()

// A path with its symbolic links resolved (macOS's /tmp is /private/tmp), or as given when it cannot be.
const realOf = async ($: EngineInterface, path: string) =>
  (await $.fs.stat(path, { resolve: true }).catch(() => undefined))?.realPath ?? path

const baseName = (path: string) => path.split('/').filter(part => part.length > 0).pop() ?? path

// One folder's bag from its status: numstat run in `root` (an outpost) or the session's folder, untracked files
// read from `base`. A file git does not track yet has no numstat: its lines all count as added.
async function loadBag($: EngineInterface, status: string, root: string | undefined, base: string | undefined) {
  const numstat = await $.process.run(root === undefined ? GIT_NUMSTAT : outpostArgv.numstat(root)).catch(() => undefined)
  const items = parseBag(status, numstat?.exitCode === 0 ? numstat.stdout : '')
  let counted = 0
  return Promise.all(
    items.map(async item => {
      if (item.status !== '?' || base === undefined || counted >= COUNTED_NEW_FILES) return item
      counted += 1
      const text = await $.fs.read(`${base}/${item.path}`).catch(() => undefined)
      return text === undefined ? item : { ...item, added: text.split('\n').length - (text.endsWith('\n') ? 1 : 0) }
    }),
  )
}

// `files`: what an edit can change, the status and the bag. `all`: the graph, the remotes and the outposts too.
async function refreshMap($: EngineInterface, scope: 'files' | 'all' = 'all') {
  const isAll = scope === 'all'
  const [status, log, remoteList] = await Promise.all([
    $.process.run(GIT_STATUS).catch(() => undefined),
    isAll ? $.process.run(GIT_LOG).catch(() => undefined) : undefined,
    isAll ? $.process.run(GIT_REMOTES).catch(() => undefined) : undefined,
  ])
  if (status === undefined || status.exitCode !== 0) {
    await update($, map, current => ({ ...current, isRepo: false }))
    await update($, bag, () => [])
    await update($, outposts, () => [])
    return
  }
  const root = await toplevel($)
  if (isAll) {
    const graph = log?.exitCode === 0 ? log.stdout.split('\n').filter(line => line.length > 0) : []
    const remotes = remoteList?.exitCode === 0 ? remoteList.stdout.split('\n').filter(name => name.length > 0) : []
    await update($, map, () => ({ isRepo: true, graph, remotes, ...parseStatus(status.stdout) }))
  } else {
    await update($, map, current => ({ ...current, isRepo: true, ...parseStatus(status.stdout) }))
  }
  const items = await loadBag($, status.stdout, undefined, root)
  await update($, bag, () => items)
  if (isAll) await listOutposts($, root, false)
}

// The worktrees as outposts. Listing them is one git run; `survey` also reads each one's branch distance, unsaved
// work and last commit (two runs each), which only the outposts view shows, so it alone asks for it.
// Without a survey an outpost keeps the figures its last one found.
async function listOutposts($: EngineInterface, root: string | undefined, survey: boolean) {
  const listed = await $.process.run(GIT_WORKTREES).catch(() => undefined)
  if (listed === undefined || listed.exitCode !== 0) return void (await update($, outposts, () => []))
  const entries = parseWorktrees(listed.stdout)
  // One outpost is the repository alone: nothing to show.
  if (entries.length < 2) return void (await update($, outposts, () => []))
  const here = root === undefined ? undefined : await realOf($, root)
  const previous = await read($, outposts)
  const list = await Promise.all(
    entries.map(async (entry, index): Promise<Outpost> => {
      const old = previous.find(one => one.path === entry.path)
      const realPath = await realOf($, entry.path)
      const known = { ahead: old?.ahead ?? 0, behind: old?.behind ?? 0, dirty: old?.dirty ?? 0, age: old?.age ?? '' }
      const outpost = { ...entry, realPath, isHere: realPath === here, ...known }
      if (!survey || entry.isPrunable || index >= SURVEYED_OUTPOSTS) return outpost
      const [status, age] = await Promise.all([
        $.process.run(outpostArgv.status(entry.path)).catch(() => undefined),
        $.process.run(outpostArgv.age(entry.path)).catch(() => undefined),
      ])
      const { ahead, behind, dirty } = status?.exitCode === 0 ? parseStatus(status.stdout) : known
      return { ...outpost, ahead, behind, dirty, age: age?.exitCode === 0 ? shortAge(age.stdout.trim()) : known.age }
    }),
  )
  await update($, outposts, () => list)
}

const surveyOutposts = async ($: EngineInterface) => listOutposts($, await toplevel($), true)

// Opens an outpost's bag: the session's own folder shows the usual bag, another worktree its own.
// Either way back leads to the outposts list it was opened from.
async function openOutpost($: EngineInterface, path: string) {
  const outpost = (await read($, outposts)).find(one => one.path === path)
  if (outpost === undefined || outpost.isPrunable) return
  await update($, offsets, all => ({ ...all, 'map:bag': 0 }))
  if (outpost.isHere) return void (await update($, mapView, (): MapView => ({ view: 'bag', via: 'outposts' })))
  await update($, outpostBag, () => ({ root: path, items: [] }))
  await update($, mapView, (): MapView => ({ view: 'bag', root: path, via: 'outposts' }))
  const status = await $.process.run(outpostArgv.status(path)).catch(() => undefined)
  const items = status?.exitCode === 0 ? await loadBag($, status.stdout, path, path) : []
  // A later outpost opened while this one loaded keeps its own bag.
  if ((await read($, mapView)).root !== path) return
  await update($, outpostBag, () => ({ root: path, items }))
}

// Opens one bag item's diff in the map tab's window, keeping where its bag came from (`root`, `via`).
async function inspectChange($: EngineInterface, path: string, from: Pick<MapView, 'root' | 'via'>) {
  const { root } = from
  const items = root === undefined ? await read($, bag) : ((await read($, outpostBag))?.items ?? [])
  const item = items.find(one => one.path === path) ?? { path, status: 'M' as const }
  await update($, inspect, () => null)
  await update($, mapView, (): MapView => ({ view: 'diff', path, ...from }))
  await update($, offsets, all => ({ ...all, 'map:diff': 0 }))
  const cwd = root ?? (await toplevel($))
  const ran = await $.process.run(diffArgv(item), cwd === undefined ? {} : { cwd }).catch(() => undefined)
  // `git diff --no-index` exits 1 when the files differ, which is the point.
  const lines = ran === undefined || ran.exitCode > 1 ? [] : ran.stdout.split('\n')
  await update($, inspect, () => ({ path, lines: lines.slice(0, DIFF_LINES), isCut: lines.length > DIFF_LINES }))
}

// Adds a pet to the party and counts the summon; a pet already there under the same agent (one met through its
// tool calls before its spawn answered) is replaced, keeping what it has done, and not counted twice.
async function joinParty($: EngineInterface, pet: Pet) {
  const before = (await read($, pets)).find(one => one.agentId !== undefined && one.agentId === pet.agentId)
  const joined = before === undefined ? pet : { ...pet, actions: before.actions, lastTool: before.lastTool, lastSummary: before.lastSummary, startedAt: before.startedAt }
  await update($, pets, list =>
    [...list.filter(one => one.id !== pet.id && (pet.agentId === undefined || one.agentId !== pet.agentId)), joined].slice(-50),
  )
  if (before !== undefined) return
  const out = (await read($, pets)).filter(one => one.status === 'run').length
  await advance($, p => ({ ...p, petsSummoned: p.petsSummoned + 1, maxPetsAtOnce: Math.max(p.maxPetsAtOnce, out) }))
  $.ui.toast(`🐾 ${speciesFor(pet.kind).name} summoned: ${pet.description}`)
}

// A subagent met through its tool calls with no spawn of its own seen: a skill's fork, a teammate, or one whose
// spawn answered after its first call. The session's agent list names its type and task when it can.
async function discoverPet($: EngineInterface, agentId: string) {
  const info = (await $.agent.list().catch(() => [])).find(agent => agent.id === agentId)
  await joinParty($, {
    id: `agent:${agentId}`,
    agentId,
    kind: info?.type ?? 'fork',
    description: info?.description || info?.name || 'a task in the background',
    startedAt: await $.clock.now(),
    status: 'run',
    actions: 0,
  })
}

// Where back leads from a bag: the outposts list for a bag opened there, the map otherwise.
const isFromOutposts = (view: Pick<MapView, 'root' | 'via'>) => view.root !== undefined || view.via === 'outposts'

// The outpost (worktree) a pet works in: one of the outposts other than the session's own folder, or any folder
// outside the session's repository. Its own folder or a folder inside it is no camp.
async function campOfPet($: EngineInterface, cwd: string | undefined, isIsolated: boolean) {
  if (cwd === undefined) return isIsolated ? 'worktree' : undefined
  const realCwd = await realOf($, cwd)
  const outpost = (await read($, outposts)).find(one => one.realPath === realCwd)
  if (outpost !== undefined) return outpost.isHere ? undefined : outpost.name
  const root = await toplevel($)
  const realRoot = root === undefined ? undefined : await realOf($, root)
  const isInside = realRoot !== undefined && (realCwd === realRoot || realCwd.startsWith(`${realRoot}/`))
  return isInside ? undefined : baseName(realCwd)
}

const refreshAll = ($: EngineInterface) =>
  Promise.all([refreshVitals($), refreshLoadout($), refreshMap($)]).then(() => undefined)

// Sets the session's class, counts it as played, and announces it.
async function chooseClass($: EngineInterface, id: string) {
  const hero = classOf(id)
  await update($, heroClass, () => hero.id)
  await advance($, p => ({
    ...p,
    classesPlayed: p.classesPlayed.includes(hero.id) ? p.classesPlayed : [...p.classesPlayed, hero.id],
  }))
  $.ui.toast(`⚔ Today Claude plays the ${hero.title.toLowerCase()}: ${hero.ranks[0]}`)
}

async function castSkill($: EngineInterface, name: string) {
  const now = await $.clock.now()
  await update($, skillCasts, casts => ({ ...casts, [name]: now }))
  await advance($, p => ({ ...p, skillUses: { ...p.skillUses, [name]: (p.skillUses[name] ?? 0) + 1 } }))
}

async function finishPet($: EngineInterface, match: (pet: Pet) => boolean, status: ToolCallStatus, answer: string) {
  const now = await $.clock.now()
  await update($, pets, list =>
    list.map(pet =>
      match(pet) && pet.status === 'run'
        ? { ...pet, status, endedAt: now, loot: firstLine(answer) || pet.loot }
        : pet,
    ),
  )
}

// The pane's animation: blits each tick, stops once a Raster refuses.
const stop = () => {
  anim.ticker?.cancel()
  anim.ticker = undefined
}

// A refusal and a failed blit both mean nothing of ours is on screen to paint.
const blit = async ($: EngineInterface, key: string, cells: string, columns: number, rows: number) => {
  const done = await $.ui
    .blit({ requestId: PANE, key, cells, columns, rows })
    .catch(() => ({ deny: 'blit failed' }))
  return done.deny === undefined
}

async function paintHero($: EngineInterface) {
  const now = await $.clock.now()
  const nextMood = pickMood(anim.running, anim.hurtUntil - now)
  if (nextMood === anim.mood) {
    anim.moodTick += 1
  } else {
    anim.mood = nextMood
    anim.moodTick = 0
  }
  const cells = pickFrame(anim.mood, anim.moodTick, anim.heroClass)
  if (cells === anim.shownCells) return true
  if (!(await blit($, 'hero', cells, HERO_CELLS.columns, HERO_CELLS.rows))) return false
  anim.shownCells = cells
  return true
}

// A pet that refuses its blit has scrolled away; it leaves the animation.
async function paintPets($: EngineInterface) {
  const frame = Math.floor(anim.tick / PET_TICKS)
  for (const [key, pet] of anim.pets) {
    const cells = petCells(pet.kind, 'run', frame)
    if (cells === pet.shown) continue
    if (await blit($, key, cells, PET_COLUMNS, PET_ROWS)) pet.shown = cells
    else anim.pets.delete(key)
  }
}

async function paint($: EngineInterface) {
  anim.tick += 1
  const hasPets = anim.tab === 'pets' && anim.pets.size > 0
  // The portrait refusing means the pane is closed: nothing of ours is on screen.
  if (anim.hasHero && !(await paintHero($))) return stop()
  if (hasPets) await paintPets($)
  if (!anim.hasHero && !hasPets) stop()
}

// Each draw of an animated tab starts the clock again if a refusal stopped it.
const startAnim = ($: EngineInterface) => {
  anim.ticker ??= $.clock.every(FRAME_MS, () => void paint($))
}

// The session's camp, when it works in a worktree other than the repository's main folder.
const campOf = (list: readonly Outpost[]): { camp?: string } => {
  const here = list.find(one => one.isHere)
  return here === undefined || here.isMain ? {} : { camp: here.name }
}

export const register: Register = on => {
  // The last drawn log window; scrolling clamps against it.
  // `key` names the window being scrolled: a tab, or `map:bag` / `map:diff` inside the map tab.
  let layout = { rows: 1, total: 0, key: 'spells' }
  // Module state: whether the main loop's current turn has fizzled.
  let turnHadError = false
  // Agent calls asked to run in a worktree of their own, by tool_use_id, until their spawn.
  const isolated = new Set<string>()
  // Subagents being looked up in the agent list, so parallel tool calls of one add it once.
  const discovering = new Set<string>()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Open the adventure HUD (args: spells, pets, map, skills, feats; class [name] rerolls; cards toggles edit cards)',
    })
    await loadProgress($)
    // Each session plays a class at random; a reload of the mod keeps the one rolled.
    if ((await read($, heroClass)) === '') await chooseClass($, rollClass(Math.random()))
    void refreshAll($).catch(() => undefined)
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  // A /clear starts a new session without session.start.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear') void refreshAll($).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'class' || arg.startsWith('class ')) {
      const asked = arg.slice('class'.length).trim()
      if (asked !== '' && !isClassId(asked)) return { text: `No such class. Pick one of: ${CLASS_IDS.join(', ')}.` }
      const current = await read($, heroClass)
      const next = asked === '' ? rollClass(Math.random(), current) : asked
      await chooseClass($, next)
      return { text: `Claude is now a ${classOf(next).title.toLowerCase()}.` }
    }
    if (arg === 'cards') {
      const isOn = (await $.store.get(CARDS_KEY)) !== false
      await $.store.set(CARDS_KEY, !isOn)
      return { text: isOn ? 'Edit cards off: edits draw as before.' : 'Edit cards on.' }
    }
    if (isTab(arg)) await update($, tab, () => arg)
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Adventure HUD opened.' }
  })

  on('prompt.submit', async ($, e, next) => {
    const known = (await read($, loadout)).skills.map(slot => slot.name)
    const skill = skillOfPrompt(e.text, known)
    if (skill !== undefined) await castSkill($, skill)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    turnHadError = false
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const agentId = e.agentId
      await finishPet($, pet => pet.agentId === agentId, e.isAborted ? 'err' : 'ok', 'answer' in e ? e.answer : '')
      return next(e)
    }
    if (!e.isAborted) {
      const isClean = !turnHadError
      await advance($, p => {
        const turnStreak = isClean ? p.turnStreak + 1 : 0
        return { ...p, turnStreak, bestTurnStreak: Math.max(p.bestTurnStreak, turnStreak) }
      })
    }
    // The outposts list, while open, is surveyed again after each turn.
    const isSurveying = (await read($, mapView)).view === 'outposts'
    void refreshAll($)
      .then(() => (isSurveying ? surveyOutposts($) : undefined))
      .catch(() => undefined)
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const ran = await next(e)
    const isIsolated = isolated.delete(e.tool_use_id)
    if (ran.agentId === undefined) return ran
    const now = await $.clock.now()
    // A pet sent to its own worktree, or to a folder outside the repository, camps there.
    const camp = await campOfPet($, e.cwd, isIsolated)
    const pet: Pet = {
      id: e.tool_use_id,
      agentId: ran.agentId,
      kind: e.subagentType,
      description: e.description,
      startedAt: now,
      status: 'run',
      actions: 0,
      ...(camp === undefined ? {} : { camp }),
    }
    await joinParty($, pet)
    return ran
  })

  on('tool.call', async ($, e, next) => {
    const isMain = e.agentId === undefined
    const startedAt = await $.clock.now()
    const summary = summarize(e)
    const call: ToolCall = { id: e.tool_use_id, tool: e.tool, summary, startedAt, status: 'run' }

    if (e.tool === 'Agent' && (e as { isolation?: unknown }).isolation === 'worktree') isolated.add(e.tool_use_id)
    if (isMain) {
      await update($, calls, list => [...list, call].slice(-200))
      anim.running += 1
    } else if (e.agentId !== undefined) {
      const agentId = e.agentId
      if (!(await read($, pets)).some(pet => pet.agentId === agentId) && !discovering.has(agentId)) {
        discovering.add(agentId)
        await discoverPet($, agentId).finally(() => discovering.delete(agentId))
      }
      await update($, pets, list =>
        list.map(pet =>
          pet.agentId === agentId ? { ...pet, actions: pet.actions + 1, lastTool: e.tool, lastSummary: summary } : pet,
        ),
      )
    }

    let ran: Awaited<ReturnType<typeof next>>
    try {
      ran = await next(e)
    } finally {
      if (isMain) anim.running -= 1
      // An Agent call that never spawned (refused, interrupted) leaves no isolation mark behind.
      if (e.tool === 'Agent') isolated.delete(e.tool_use_id)
    }
    const isError = ran.deny !== undefined || ran.isError === true
    const status: ToolCallStatus = isError ? 'err' : 'ok'

    // The world reacts to every loop's calls: files explored, bosses fought.
    const filePath = (e as { file_path?: unknown }).file_path
    if (typeof filePath === 'string' && (e.tool === 'Read' || EDIT_TOOLS.has(e.tool))) {
      const cwd = await $.session.cwd()
      const path = filePath.startsWith(`${cwd}/`) ? filePath.slice(cwd.length + 1) : filePath
      await update($, touched, list => touchFile(list, path, EDIT_TOOLS.has(e.tool)))
      if (EDIT_TOOLS.has(e.tool)) void refreshMap($, 'files').catch(() => undefined)
    }
    if (e.tool === 'Bash') {
      const command = e.command
      const output = ran.deny ?? ran.text ?? ''
      const fight = fightBoss(await read($, boss), command, isError, output)
      await update($, boss, () => fight.boss)
      if (fight.event === 'appear' && fight.boss !== null) {
        $.ui.toast(`☠ ${fight.boss.name} appears! HP ${fight.boss.hp}`)
      }
      if (fight.event === 'defeat') {
        $.ui.toast('⚔ Boss defeated!')
        await advance($, p => ({ ...p, bossesDefeated: p.bossesDefeated + 1 }))
      }
      if (/\bgit\b/.test(command)) void refreshMap($).catch(() => undefined)
    }

    if (!isMain) return ran

    const endedAt = await $.clock.now()
    const ms = Math.round(endedAt - startedAt)
    if (isError) {
      anim.hurtUntil = endedAt + HURT_MS
      turnHadError = true
    }
    await update($, calls, list => list.map(one => (one.id === call.id ? { ...normalizeCall(one), ms, status } : one)))
    await update($, combo, current => {
      const streak = isError ? 0 : current.current + 1
      return { current: streak, best: Math.max(current.best, streak) }
    })

    // A foreground Agent call returns with its pet's answer; a background one returns at once.
    const isBackground = (e as { run_in_background?: unknown }).run_in_background === true
    if (e.tool === 'Agent' && !isBackground) {
      await finishPet($, pet => pet.id === call.id, status, ran.deny ?? ran.text ?? '')
    }
    if (e.tool === 'Skill') {
      const skill = (e as { skill?: unknown }).skill
      if (typeof skill === 'string') await castSkill($, skill)
    }

    const total = (await read($, calls)).length
    const best = (await read($, combo)).best
    const isNight = new Date(endedAt).getHours() < NIGHT_HOURS
    await advance($, p => ({
      ...p,
      totalCalls: p.totalCalls + 1,
      bashCalls: p.bashCalls + (e.tool === 'Bash' ? 1 : 0),
      bestCombo: Math.max(p.bestCombo, best),
      isNightOwl: p.isNightOwl || isNight,
    }))
    if (total % CALLS_PER_LEVEL === 0) {
      const level = 1 + total / CALLS_PER_LEVEL
      $.ui.toast(`✦ Level up! Lv.${level} ${rankOf(classOf(await read($, heroClass)), level)}`)
      await update($, flashUntil, () => endedAt + FLASH_MS)
      void $.clock
        .sleep(FLASH_MS)
        .then(() => update($, flashUntil, until => (until <= endedAt + FLASH_MS ? 0 : until)))
        .catch(() => undefined)
    }
    void refreshVitals($).catch(() => undefined)

    return ran
  })

  // The menu Client posts `{ select }` when a slot is clicked; the skills Client `{ cast }` when a skill is.
  on('ui.message', async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const data = (e.data ?? {}) as { select?: unknown; cast?: unknown }
    if (e.element === 'menu' && typeof data.select === 'string' && isTab(data.select)) {
      const picked = data.select
      await update($, tab, () => picked)
      return {}
    }
    if (e.element === 'bag') {
      const asked = data as { back?: unknown; inspect?: unknown }
      const from = await read($, mapView)
      if (asked.back === true) await update($, mapView, (): MapView => ({ view: isFromOutposts(from) ? 'outposts' : 'map' }))
      if (typeof asked.inspect === 'string') {
        await inspectChange($, asked.inspect, { ...(from.root === undefined ? {} : { root: from.root }), ...(from.via === undefined ? {} : { via: from.via }) })
      }
      return {}
    }
    if (e.element === 'outposts') {
      const asked = data as { back?: unknown; outpost?: unknown }
      if (asked.back === true) await update($, mapView, (): MapView => ({ view: 'map' }))
      if (typeof asked.outpost === 'string') await openOutpost($, asked.outpost)
      return {}
    }
    if (e.element === 'skills' && typeof data.cast === 'string') {
      const filled = await $.prompt.fill({ text: castText(data.cast) })
      if (!filled.isFilled) $.ui.toast(`Type /${data.cast} to cast it`)
      return {}
    }
    return next(e)
  })

  // Edit and Write results in the transcript drawn as spell cards; errors and other tools stay the engine's.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!CARD_TOOLS.has(e.props.tool) || e.props.isErrored) return next(e)
    if ((await $.store.get(CARDS_KEY).catch(() => undefined)) === false) return next(e)
    const output = e.props.output as Partial<EditOutput> | undefined
    if (typeof output?.filePath !== 'string') return next(e)
    return renderEditCard($.ui.resolve(e), e.props.tool, output as EditOutput, await $.session.cwd())
  })

  // Every window draws only what fits, so the engine has nothing to scroll:
  // the wheel and scroll keys move the active window's items instead.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (layout.total <= layout.rows) return next(e)
    const { key } = layout
    await update($, offsets, all => ({
      ...all,
      [key]: clampOffset((all[key] ?? 0) + e.by, layout.total, layout.rows),
    }))
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const active = await read($, tab)
    const entry = entryOf(active)
    const width = e.props.bodyColumns
    const now = await $.clock.now()
    const ui = $.ui.resolve(e)
    const { Box, Button } = ui
    const Raster = e.surface === 'terminal' ? $.ui.resolve(e).Raster : undefined
    anim.tab = active

    const callList = (await read($, calls)).map(normalizeCall)
    const petList = await read($, pets)
    const progressNow = await read($, progress)
    const hero = classOf(await read($, heroClass))
    if (anim.heroClass !== hero.id) {
      // A new class: the portrait starts over from its first idle frame.
      anim.heroClass = hero.id
      anim.mood = 'idle'
      anim.moodTick = 0
      anim.shownCells = pickFrame('idle', 0, hero.id)
    }
    const status = renderStatus(
      ui,
      {
        hero,
        list: callList,
        vitals: await read($, vitals),
        combo: await read($, combo),
        boss: await read($, boss),
        trophies: {
          earned: TROPHIES.filter(t => progressNow.unlocked[t.id] !== undefined).length,
          total: TROPHIES.length,
        },
        petsOut: petList.filter(pet => pet.status === 'run').length,
        ...campOf(await read($, outposts)),
        isFlashing: (await read($, flashUntil)) > now,
        width,
      },
      Raster,
    )

    // The icon menu when the slots and the window both have room; one line of labels otherwise.
    // The terminal draws it as a Client, so a click anywhere in a slot picks it; other surfaces get buttons.
    const narrowest = Math.min(...slotLayout(width, MENU.length).widths)
    const isTerminal = e.surface === 'terminal'
    const roomRows = e.props.scroll.bodyRows - STATUS_ROWS - WINDOW_CHROME_ROWS
    const isIconMenu = isTerminal && narrowest >= MIN_SLOT_COLUMNS && roomRows - SLOT_ROWS >= MIN_WINDOW_ROWS
    const menuRows = isIconMenu ? SLOT_ROWS : 1
    const rows = Math.max(MIN_WINDOW_ROWS, roomRows - menuRows)

    let menu
    if (e.surface === 'terminal') {
      const { Client } = $.ui.resolve(e)
      const menuProps: MenuProps = {
        active,
        mode: isIconMenu ? 'icons' : 'line',
        width,
        slots: MENU.map(slot => ({
          id: slot.id,
          label: slot.label,
          color: slot.color,
          icon: iconText(slot, true),
          dimIcon: iconText(slot, false),
        })),
      }
      menu = <Client key="menu" module="./menu-client.tsx" props={menuProps} width={width} height={menuRows} />
    } else {
      menu = (
        <Box flexDirection="row" columnGap={1} height={1} width={width}>
          {MENU.map(slot => (
            <Button
              key={`menu-${slot.id}`}
              label={slot.label}
              variant={slot.id === active ? 'primary' : 'secondary'}
              dimColor={slot.id !== active}
              onPress={() => void update($, tab, () => slot.id)}
            />
          ))}
        </Box>
      )
    }

    const inner = Math.max(0, width - WINDOW_CHROME_COLUMNS)
    let items: Item[]
    let subtitle: string
    // The skills page and the bag are Clients of their own, so a click anywhere on a row acts on it.
    let skills: ReturnType<typeof skillRows> | undefined
    let bagRows: BagRow[] | undefined
    let outpostRows: OutpostRow[] | undefined
    const view = active === 'map' ? await read($, mapView) : { view: 'map' as const }
    const windowKey = active === 'map' && view.view !== 'map' ? `map:${view.view}` : active
    let title = entry.title
    if (active === 'pets') {
      items = petItems(ui, petList, now, inner, Raster)
      subtitle = partySubtitle(petList)
    } else if (active === 'map' && view.view === 'diff') {
      const opened = await read($, inspect)
      const source = view.root === undefined ? await read($, bag) : ((await read($, outpostBag))?.items ?? [])
      items = inspectItems(ui, opened, source.find(item => item.path === view.path), inner, () => {
        void update($, mapView, (): MapView => ({ ...view, view: 'bag', path: undefined }))
      })
      title = '🔍 INSPECT'
      subtitle = view.path ?? ''
    } else if (active === 'map' && view.view === 'outposts') {
      const list = await read($, outposts)
      outpostRows = [{ kind: 'back' }, ...list.map(outpost => ({ kind: 'outpost' as const, outpost }))]
      if (list.length === 0) outpostRows.push({ kind: 'note', text: 'No outposts: this repository has one worktree.' })
      items = []
      title = '🏕 OUTPOSTS'
      subtitle = `${list.length} camps · ${list.filter(one => one.dirty > 0).length} with unsaved work`
    } else if (active === 'map' && view.view === 'bag') {
      const opened = view.root === undefined ? undefined : await read($, outpostBag)
      const items_ = view.root === undefined ? await read($, bag) : (opened?.root === view.root ? opened.items : [])
      bagRows = [
        { kind: 'back', ...(isFromOutposts(view) ? { label: 'the outposts' } : {}) },
        ...(items_.length === 0 ? [{ kind: 'note' as const, text: 'The bag is empty: every change is committed.' }] : []),
        ...items_.map(item => ({ kind: 'item' as const, item })),
      ]
      items = []
      title = '🎒 INVENTORY'
      subtitle = view.root === undefined ? bagSubtitle(items_) : `⚑${baseName(view.root)} · ${bagSubtitle(items_)}`
    } else if (active === 'map') {
      const world = await read($, map)
      const list = await read($, outposts)
      items = mapItems(ui, world, await read($, touched), inner, {
        openBag: () => {
          void update($, mapView, (): MapView => ({ view: 'bag' }))
          void update($, offsets, all => ({ ...all, 'map:bag': 0 }))
        },
        openOutposts: () => {
          void update($, mapView, (): MapView => ({ view: 'outposts' }))
          void surveyOutposts($).catch(() => undefined)
        },
        outposts: list.length,
        camps: Object.fromEntries(list.filter(one => !one.isHere && one.branch !== '').map(one => [one.branch, one.name])),
      })
      subtitle = mapSubtitle(world)
    } else if (active === 'skills') {
      const gear = await read($, loadout)
      skills = skillRows({ loadout: gear, progress: progressNow, casts: await read($, skillCasts), now })
      items = []
      subtitle = skillsSubtitle(gear, progressNow)
    } else if (active === 'feats') {
      items = featItems(ui, progressNow, inner)
      subtitle = featsSubtitle(progressNow)
    } else {
      items = spellItems(ui, callList, inner)
      subtitle = `${callList.length} casts`
    }

    const offset = (await read($, offsets))[windowKey] ?? 0
    layout = { rows, total: skills?.length ?? bagRows?.length ?? outpostRows?.length ?? totalRows(items), key: windowKey }
    let body
    if (outpostRows !== undefined) {
      const start = clampOffset(offset, outpostRows.length, rows)
      const shownRows = outpostRows.slice(start, start + rows)
      if (e.surface === 'terminal') {
        const { Client } = $.ui.resolve(e)
        const outpostsProps: OutpostsProps = { rows: shownRows, width: inner }
        body = {
          node: <Client key="outposts" module="./outposts-client.tsx" props={outpostsProps} width={inner} height={rows} />,
          total: outpostRows.length,
        }
      } else {
        body = {
          node: (
            <Box flexDirection="column">
              {shownRows.map((one, index) =>
                one.kind === 'back' ? (
                  <Button key="outposts-back" label="◂ back to the map" plain onPress={() => void update($, mapView, (): MapView => ({ view: 'map' }))} />
                ) : one.kind === 'outpost' && !one.outpost.isPrunable ? (
                  <Button key={`outpost-${one.outpost.path}`} label={`⚑ ${one.outpost.name}`} plain onPress={() => void openOutpost($, one.outpost.path)} />
                ) : (
                  <Box key={`outpost-${index}`} height={1} />
                ),
              )}
            </Box>
          ),
          total: outpostRows.length,
        }
      }
    }
    if (bagRows !== undefined) {
      const start = clampOffset(offset, bagRows.length, rows)
      const shownRows = bagRows.slice(start, start + rows)
      if (e.surface === 'terminal') {
        const { Client } = $.ui.resolve(e)
        const bagProps: BagProps = { rows: shownRows, width: inner }
        body = { node: <Client key="bag" module="./bag-client.tsx" props={bagProps} width={inner} height={rows} />, total: bagRows.length }
      } else {
        body = {
          node: (
            <Box flexDirection="column">
              {shownRows.map((one, index) =>
                one.kind === 'back' ? (
                  <Button key="bag-back" label="◂ back" plain onPress={() => void update($, mapView, (): MapView => ({ view: isFromOutposts(view) ? 'outposts' : 'map' }))} />
                ) : one.kind === 'item' ? (
                  <Button key={`bag-${one.item.path}`} label={one.item.path} plain onPress={() => void inspectChange($, one.item.path, view)} />
                ) : (
                  <Box key={`bag-${index}`} height={1} />
                ),
              )}
            </Box>
          ),
          total: bagRows.length,
        }
      }
    }
    if (skills !== undefined) {
      const start = clampOffset(offset, skills.length, rows)
      const shownRows = skills.slice(start, start + rows)
      if (e.surface === 'terminal') {
        const { Client } = $.ui.resolve(e)
        const skillsProps: SkillsProps = { rows: shownRows, width: inner }
        body = { node: <Client key="skills" module="./skills-client.tsx" props={skillsProps} width={inner} height={rows} />, total: skills.length }
      } else {
        // Other surfaces: each skill a button that fills the prompt.
        body = {
          node: (
            <Box flexDirection="column">
              {shownRows.map((row, index) =>
                row.kind === 'skill' ? (
                  <Button key={`cast-${row.name}`} label={`/${row.name}`} plain dimColor={row.uses === 0} onPress={() => void $.prompt.fill({ text: castText(row.name) })} />
                ) : (
                  <Box key={`row-${index}`} height={1} />
                ),
              )}
            </Box>
          ),
          total: skills.length,
        }
      }
    }
    if (active === 'pets') {
      // Only the pets the window shows can take a blit.
      const shown = new Set(pageItems(items, offset, rows).shown.map(item => `pet-${item.key}`))
      for (const key of anim.pets.keys()) if (!shown.has(key)) anim.pets.delete(key)
    }
    if (anim.hasHero || (active === 'pets' && anim.pets.size > 0)) startAnim($)

    return (
      <Box flexDirection="column" width={width}>
        {status}
        {menu}
        {renderWindow(ui, { title, subtitle, color: entry.color, items, offset, rows, width, ...(body === undefined ? {} : { body }) })}
      </Box>
    )
  })
}
