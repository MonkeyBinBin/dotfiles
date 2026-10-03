import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, Register, RenderChildren } from 'claude-code'

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
  SpellFilter,
  Tab,
  Tally,
  ToolCall,
  ToolCallStatus,
  TouchedFile,
  Vitals,
} from '../types'
import { FRAME_MS, HERO_CELLS, HURT_MS, PET_TICKS, anim, pickFrame, pickMood } from './anim'
import { fightBoss, fightText, runsGit } from './boss'
import type { BagProps, BagRow } from './bag-client'
import { GIT_LOG, GIT_NUMSTAT, GIT_REMOTES, GIT_STATUS, GIT_WORKTREES, diffArgv, outpostArgv, parseBag, parseStatus, parseWorktrees, shortAge } from './git'
import type { OutpostRow, OutpostsProps } from './outposts-client'
import { bagSubtitle, inspectItems } from './inspect'
import { renderEditCard } from './edit-card'
import type { EditOutput } from './edit-card'
import { CALLS_PER_LEVEL, STATUS_ROWS, heroStats, normalizeCall, renderStatus } from './hero'
import { CLASS_IDS, classOf, isClassId, rankOf, rollClass } from './classes'
import { mapItems, mapSubtitle } from './map'
import { ICON_COLUMNS, ICON_ROWS, MENU, entryOf, iconText, isTab } from './menu'
import { cardWidth, slotKey } from './menu-client'
import type { MenuIconProps } from './menu-client'
import { PET_COLUMNS, PET_ROWS, petCells, speciesFor } from './pet-sprites'
import { partySubtitle, petItems } from './pets'
import { recapText } from './recap'
import { castText, skillItems, skillKeys, skillRows, skillsSubtitle } from './skills'
import { filterSpells, spellFilters, spellItems } from './spellbook'
import { HELP_COMMANDS, helpItems, helpText } from './help'
import { EMPTY_PROGRESS, TROPHIES, newlyEarned } from './trophies'
import { featItems, featsSubtitle } from './trophy-room'
import { summarize } from './util'
import { WINDOW_CHROME_COLUMNS, WINDOW_CHROME_ROWS, clampOffset, pageItems, renderWindow, totalRows } from './window'
import type { Item } from './window'

const calls = atom({ plugin: 'rpg-hud', key: 'calls' } as const, [] as ToolCall[])
const castCount = atom({ plugin: 'rpg-hud', key: 'castCount' } as const, 0)
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
const spellFilter = atom({ plugin: 'rpg-hud', key: 'spellFilter' } as const, 'all' as SpellFilter)
const EMPTY_TALLY: Tally = { failures: 0, refusals: 0, bossesDefeated: 0, petsSummoned: 0 }
const tally = atom({ plugin: 'rpg-hud', key: 'tally' } as const, EMPTY_TALLY)
const startedAt = atom({ plugin: 'rpg-hud', key: 'startedAt' } as const, 0)
const isHelpOpen = atom({ plugin: 'rpg-hud', key: 'isHelpOpen' } as const, false)
const waitingFor = atom({ plugin: 'rpg-hud', key: 'waitingFor' } as const, null as string | null)

// Starts the HUD's watch of the session, once; a reload keeps it.
const markStart = async ($: EngineInterface) => {
  if ((await read($, startedAt)) === 0) {
    const now = await $.clock.now()
    await update($, startedAt, at => (at === 0 ? now : at))
  }
}

const progress = atom({ plugin: 'rpg-hud', key: 'progress' } as const, EMPTY_PROGRESS)

const PANE = 'rpg-hud'
const TITLE = 'Adventure'
const COMMAND = 'hud'
const PROGRESS_KEY = 'progress'
// Set to false by `/hud cards` to give Edit and Write results back to the engine's own drawing.
const CARDS_KEY = 'editCards'
const CARD_TOOLS = new Set(['Edit', 'Write'])

// A menu card: its frame's top and bottom, the pixel icon and the label button between.
const SLOT_ROWS = 1 + ICON_ROWS + 1 + 1
// The narrowest card that holds the 8-column icon, and the longest label, inside its frame.
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

// Claude Code's answer when the person says no at a permission prompt. No event names that call, so its text is
// the only sign; auto mode's denials come as `classic.PermissionDenied` with the call's id instead.
const REFUSAL = /^The user doesn't want to (?:proceed|take this action)/

// A call refused before it ran: a hook's deny, or the person's no at a permission prompt. A choice, not a fizzle.
export const isRefusal = (ran: { deny?: string; isError?: boolean; text?: string }): boolean =>
  ran.deny !== undefined || (ran.isError === true && REFUSAL.test(ran.text ?? ''))

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

// Changes waiting to be saved, and the saves, one after another: each reads what the last one wrote.
let pendingChanges: ((p: Progress) => Progress)[] = []
let progressQueue: Promise<void> = Promise.resolve()

// Applies every waiting change to the lifetime progress in one store read and write, and celebrates any trophy
// they earn. The store is shared by every session, so the changes apply to what the store holds now, other
// sessions' work included, never to this session's copy; this session's copy then follows the store.
async function saveProgress($: EngineInterface) {
  if (pendingChanges.length === 0) return
  const changes = pendingChanges
  pendingChanges = []
  const now = await $.clock.now()
  // A store that cannot be read is never written: building on nothing would erase every session's progress.
  // This session's copy takes the changes alone until the store answers again.
  const read_ = await $.store.get(PROGRESS_KEY).then(
    value => ({ isRead: true, value: value as Partial<Progress> | undefined }),
    () => ({ isRead: false, value: undefined }),
  )
  const base = read_.isRead ? read_.value : await read($, progress)
  let next = changes.reduce((p, change) => change(p), { ...EMPTY_PROGRESS, ...base })
  const fresh = newlyEarned(next)
  if (fresh.length > 0) next = { ...next, unlocked: { ...next.unlocked, ...Object.fromEntries(fresh.map(t => [t.id, now])) } }
  if (read_.isRead) {
    // A failed write keeps the changes for the next save rather than dropping the whole batch.
    const isSaved = await $.store.set(PROGRESS_KEY, next).then(() => true, () => false)
    if (!isSaved) {
      pendingChanges = [...changes, ...pendingChanges]
      return
    }
  }
  await update($, progress, () => next)
  for (const trophy of fresh) $.ui.toast(`🏆 Trophy unlocked: ${trophy.title}`)
}

// Queues `change` to the lifetime progress. Changes made while a save runs wait for the next one, which takes
// them all at once, so a burst of tool calls costs one store round trip, not one each. Never rejects: a caller
// on the tool path need not wait.
function advance($: EngineInterface, change: (p: Progress) => Progress): Promise<void> {
  pendingChanges.push(change)
  progressQueue = progressQueue.then(() => saveProgress($)).catch(() => undefined)
  return progressQueue
}

async function loadProgress($: EngineInterface) {
  const stored = (await $.store.get(PROGRESS_KEY).catch(() => undefined)) as Partial<Progress> | undefined
  await update($, progress, () => ({ ...EMPTY_PROGRESS, ...stored }))
}

// How full the context gets before mana runs low, warned once each until a compact or /clear empties it again.
export const MANA_ALARMS = [80, 90] as const

// The alarm `percent` sounds after `warned` (the last alarm sounded), and the alarm to remember next. Falling
// below an alarm forgets it, so a context filled again after a compact warns again.
export const manaAlarm = (percent: number, warned: number): { alarm?: number; warned: number } => {
  const reached = MANA_ALARMS.filter(level => percent >= level).at(-1) ?? 0
  return reached > warned ? { alarm: reached, warned: reached } : { warned: Math.min(warned, reached) }
}

// The last alarm this session sounded.
let manaWarned = 0

async function refreshVitals($: EngineInterface) {
  const usage = await $.session.usage().catch(() => undefined)
  if (usage === undefined) return
  const contextPercent = usage.context.percent
  await update($, vitals, () => ({ contextPercent, usd: usage.cost?.usd }))
  if (contextPercent === undefined) return
  const { alarm, warned } = manaAlarm(contextPercent, manaWarned)
  manaWarned = warned
  if (alarm !== undefined) $.ui.toast(`🔮 Mana low: context ${alarm}% full. /compact to restore it`)
  void advance($, p => ({ ...p, peakContext: Math.max(p.peakContext, Math.round(contextPercent)) }))
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
  const keep = { ...(from.root === undefined ? {} : { root: from.root }), ...(from.via === undefined ? {} : { via: from.via }) }
  await update($, mapView, (): MapView => ({ view: 'diff', path, ...keep }))
  await update($, offsets, all => ({ ...all, 'map:diff': 0 }))
  const cwd = root ?? (await toplevel($))
  const ran = await $.process.run(diffArgv(item), cwd === undefined ? {} : { cwd }).catch(() => undefined)
  // `git diff --no-index` exits 1 when the files differ, which is the point.
  const lines = ran === undefined || ran.exitCode > 1 ? [] : ran.stdout.split('\n')
  // Another diff opened while this one ran keeps the window.
  const shown = await read($, mapView)
  if (shown.view !== 'diff' || shown.path !== path || shown.root !== root) return
  await update($, inspect, () => ({ path, lines: lines.slice(0, DIFF_LINES), isCut: lines.length > DIFF_LINES }))
}

// Adds a pet to the party and counts the summon; a pet already there under the same agent (one met through its
// tool calls before its spawn answered) is replaced, keeping what it has done, and not counted twice.
// Following: a sent message turns the window to the spell book, where its tool calls show, and then to the tab
// of what the session does: a skill cast to the skills, a summoned pet to the party, a git command to the map. A tab the person picks holds the
// window until their next message; `/hud follow` turns it off, kept across sessions.
const FOLLOW_KEY = 'follow'
const follow = { isOn: true, isHeld: false }

async function followTo($: EngineInterface, to: Tab) {
  if (!follow.isOn || follow.isHeld || (await read($, isHelpOpen))) return
  await update($, tab, current => (current === to ? current : to))
}

async function joinParty($: EngineInterface, pet: Pet) {
  const before = (await read($, pets)).find(one => one.agentId !== undefined && one.agentId === pet.agentId)
  const joined = before === undefined ? pet : { ...pet, actions: before.actions, lastTool: before.lastTool, lastSummary: before.lastSummary, startedAt: before.startedAt }
  await update($, pets, list =>
    [...list.filter(one => one.id !== pet.id && (pet.agentId === undefined || one.agentId !== pet.agentId)), joined].slice(-50),
  )
  if (before !== undefined) return
  const out = (await read($, pets)).filter(one => one.status === 'run').length
  await update($, tally, t => ({ ...t, petsSummoned: t.petsSummoned + 1 }))
  void advance($, p => ({ ...p, petsSummoned: p.petsSummoned + 1, maxPetsAtOnce: Math.max(p.maxPetsAtOnce, out) }))
  $.ui.toast(`🐾 ${speciesFor(pet.kind).name} summoned: ${pet.description}`)
  await followTo($, 'pets')
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

// The outpost (worktree) a pet works in: a worktree of its own wherever it sits (`<repo>/.claude/worktrees/…`
// included), one of the outposts other than the session's own folder, or any folder outside the session's
// repository. Its own folder or a folder inside it is no camp. Paths come with their links resolved.
export const campFor = (pet: { cwd?: string; isIsolated: boolean }, outpostsNow: readonly Outpost[], root?: string) => {
  if (pet.isIsolated) return pet.cwd === undefined ? 'worktree' : baseName(pet.cwd)
  if (pet.cwd === undefined) return undefined
  const { cwd } = pet
  const outpost = outpostsNow.find(one => one.realPath === cwd)
  if (outpost !== undefined) return outpost.isHere ? undefined : outpost.name
  const isInside = root !== undefined && (cwd === root || cwd.startsWith(`${root}/`))
  return isInside ? undefined : baseName(cwd)
}

async function campOfPet($: EngineInterface, cwd: string | undefined, isIsolated: boolean) {
  const realCwd = cwd === undefined ? undefined : await realOf($, cwd)
  const root = await toplevel($)
  return campFor(
    { ...(realCwd === undefined ? {} : { cwd: realCwd }), isIsolated },
    await read($, outposts),
    root === undefined ? undefined : await realOf($, root),
  )
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
  void advance($, p => ({ ...p, skillUses: { ...p.skillUses, [name]: (p.skillUses[name] ?? 0) + 1 } }))
}

// The toast a background pet's return raises: what it brought back, or that it fell.
export const returnToast = (pet: Pick<Pet, 'kind' | 'description' | 'loot'>, status: Pet['status']): string => {
  const name = speciesFor(pet.kind).name
  if (status !== 'ok') return `🐾 ${name} fell: ${pet.description}`
  return `🐾 ${name} returned: ${pet.loot || pet.description}`
}

async function finishPet($: EngineInterface, match: (pet: Pet) => boolean, status: Pet['status'], answer: string) {
  const now = await $.clock.now()
  const finished: Pet[] = []
  await update($, pets, list => {
    // An update may run its change more than once; only the last run's pets count.
    finished.length = 0
    return list.map(pet => {
      if (!match(pet) || pet.status !== 'run') return pet
      const done = { ...pet, status, endedAt: now, loot: firstLine(answer) || pet.loot }
      finished.push(done)
      return done
    })
  })
  // A foreground pet's answer arrives as the call's result; only a background one needs announcing.
  for (const pet of finished) if (pet.isBackground === true) $.ui.toast(returnToast(pet, status))
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

// --- The menu windows ---

// Every window the menu can show: a tab, or a view inside the map tab.
type PageKey = Tab | 'map:bag' | 'map:diff' | 'map:outposts' | 'help'

// `$` goes beside it as an argument of its own: the engine never lets it ride in an object.
type PageContext = {
  ui: ElementTable
  view: MapView
  // The window's inner width.
  inner: number
  now: number
  Raster: ElementTable<'terminal'>['Raster'] | undefined
  callList: ToolCall[]
  petList: Pet[]
  progress: Progress
  // Where the window stands: the first row it shows and how many it has room for.
  offset: number
  rows: number
}

type TerminalClient = ElementTable<'terminal'>['Client']

// Rows the window draws as a list to pick from: a Client on the terminal, so a click anywhere on a row acts on
// it; a column of buttons elsewhere. The Clients all take `{ rows, width }`.
type PickList<Row> = {
  key: string
  rows: readonly Row[]
  // The terminal's Client for the shown rows; its module must be spelled out where it is drawn.
  client: (Client: TerminalClient, props: { rows: Row[]; width: number }, height: number) => RenderChildren
  // A row's button on surfaces with no Client; undefined leaves it a blank line.
  button: (row: Row) => { key: string; label: string; dimColor?: boolean; onPress: () => void } | undefined
}

// What a window shows: its own title when not the tab's, the subtitle, and either items it pages itself or a
// list to pick from; `actions` sit on its title row.
type Page = {
  title?: string
  subtitle: string
  items?: Item[]
  list?: PickList<never>
  actions?: RenderChildren
}

const pickList = <Row,>(list: PickList<Row>): PickList<never> => list as unknown as PickList<never>

// The scrolled slice of a pick list, drawn for the surface.
function pickBody($: EngineInterface, e: { surface: string }, list: PickList<never>, offset: number, rows: number, inner: number) {
  const start = clampOffset(offset, list.rows.length, rows)
  const shown = list.rows.slice(start, start + rows)
  const total = list.rows.length
  const ui = $.ui.resolve(e as never) as ElementTable
  if (e.surface === 'terminal') {
    const { Client } = ui as ElementTable<'terminal'>
    return { node: list.client(Client, { rows: shown, width: inner }, rows), total }
  }
  const { Box, Button } = ui
  return {
    node: (
      <Box flexDirection="column">
        {shown.map((row, index) => {
          const button = list.button(row)
          return button === undefined ? (
            <Box key={`${list.key}-${index}`} height={1} />
          ) : (
            <Button key={button.key} label={button.label} plain {...(button.dimColor === undefined ? {} : { dimColor: button.dimColor })} onPress={button.onPress} />
          )
        })}
      </Box>
    ),
    total,
  }
}

const backToMap = ($: EngineInterface) => void update($, mapView, (): MapView => ({ view: 'map' }))

const spellsPage = async ($: EngineInterface, { ui, inner, callList }: PageContext): Promise<Page> => {
  const filter = await read($, spellFilter)
  const casts = await read($, castCount)
  return {
    items: spellItems(ui, callList, inner, filter),
    subtitle: filter === 'all' ? `${casts} casts` : `${filterSpells(callList, filter).length} of ${casts} casts`,
    ...(callList.length === 0
      ? {}
      : {
          actions: spellFilters(ui, callList, filter, picked => {
            void update($, spellFilter, () => picked)
            void update($, offsets, all => ({ ...all, spells: 0 }))
          }),
        }),
  }
}

const petsPage = async (_$: EngineInterface, { ui, inner, now, Raster, petList }: PageContext): Promise<Page> => ({
  items: petItems(ui, petList, now, inner, Raster),
  subtitle: partySubtitle(petList),
})

const mapPage = async ($: EngineInterface, { ui, inner }: PageContext): Promise<Page> => {
  const world = await read($, map)
  const list = await read($, outposts)
  return {
    items: mapItems(ui, world, await read($, touched), inner, {
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
    }),
    subtitle: mapSubtitle(world),
  }
}

const diffPage = async ($: EngineInterface, { ui, view, inner }: PageContext): Promise<Page> => {
  const opened = await read($, inspect)
  const source = view.root === undefined ? await read($, bag) : ((await read($, outpostBag))?.items ?? [])
  return {
    title: '🔍 INSPECT',
    items: inspectItems(ui, opened, source.find(item => item.path === view.path), inner, () => {
      void update($, mapView, (): MapView => ({ ...view, view: 'bag', path: undefined }))
    }),
    subtitle: view.path ?? '',
  }
}

const outpostsPage = async ($: EngineInterface): Promise<Page> => {
  const list = await read($, outposts)
  const rows: OutpostRow[] = [{ kind: 'back' }, ...list.map(outpost => ({ kind: 'outpost' as const, outpost }))]
  if (list.length === 0) rows.push({ kind: 'note', text: 'No outposts: this repository has one worktree.' })
  return {
    title: '🏕 OUTPOSTS',
    subtitle: `${list.length} camps · ${list.filter(one => one.dirty > 0).length} with unsaved work`,
    list: pickList<OutpostRow>({
      key: 'outposts',
      rows,
      client: (Client, props, height) => <Client key="outposts" module="./outposts-client.tsx" props={props satisfies OutpostsProps} width={props.width} height={height} />,
      button: row => {
        if (row.kind === 'back') return { key: 'outposts-back', label: '◂ back to the map', onPress: () => backToMap($) }
        if (row.kind !== 'outpost' || row.outpost.isPrunable) return undefined
        const { path, name } = row.outpost
        return { key: `outpost-${path}`, label: `⚑ ${name}`, onPress: () => void openOutpost($, path) }
      },
    }),
  }
}

const bagPage = async ($: EngineInterface, { view }: PageContext): Promise<Page> => {
  const opened = view.root === undefined ? undefined : await read($, outpostBag)
  const items = view.root === undefined ? await read($, bag) : opened?.root === view.root ? opened.items : []
  const rows: BagRow[] = [
    { kind: 'back', ...(isFromOutposts(view) ? { label: 'the outposts' } : {}) },
    ...(items.length === 0 ? [{ kind: 'note' as const, text: 'The bag is empty: every change is committed.' }] : []),
    ...items.map(item => ({ kind: 'item' as const, item })),
  ]
  return {
    title: '🎒 INVENTORY',
    subtitle: view.root === undefined ? bagSubtitle(items) : `⚑${baseName(view.root)} · ${bagSubtitle(items)}`,
    list: pickList<BagRow>({
      key: 'bag',
      rows,
      client: (Client, props, height) => <Client key="bag" module="./bag-client.tsx" props={props satisfies BagProps} width={props.width} height={height} />,
      button: row => {
        if (row.kind === 'back') {
          return { key: 'bag-back', label: '◂ back', onPress: () => void update($, mapView, (): MapView => ({ view: isFromOutposts(view) ? 'outposts' : 'map' })) }
        }
        if (row.kind !== 'item') return undefined
        const { path } = row.item
        return { key: `bag-${path}`, label: path, onPress: () => void inspectChange($, path, view) }
      },
    }),
  }
}

// Fills the prompt with `text`, or toasts `fallback` when the prompt cannot take it.
const fillPrompt = ($: EngineInterface, text: string, fallback: string) =>
  void $.prompt
    .fill({ text })
    .then(filled => (filled.isFilled ? undefined : $.ui.toast(fallback)))
    .catch(() => undefined)

// Fills the prompt with a skill's command, or says how to cast it when the prompt cannot take it.
const castFromPage = ($: EngineInterface, name: string) => fillPrompt($, castText(name), `Type /${name} to cast it`)

// The skills page's letters as last drawn, letter to skill. A click on a menu icon gives that Client the keys,
// and the skills' buttons then hear no letters; the icon hands them on and they are looked up here.
let shownSkillKeys = new Map<string, string>()

const skillsPage = async ($: EngineInterface, { ui, inner, now, progress: progressNow, offset, rows: room }: PageContext): Promise<Page> => {
  const gear = await read($, loadout)
  const rows = skillRows({ loadout: gear, progress: progressNow, casts: await read($, skillCasts), now })
  const keys = skillKeys(rows, clampOffset(offset, rows.length, room), room)
  shownSkillKeys = new Map(
    [...keys].flatMap(([index, key]) => {
      const row = rows[index]
      return row?.kind === 'skill' ? [[key, row.name] as const] : []
    }),
  )
  return {
    subtitle: skillsSubtitle(gear, progressNow),
    items: skillItems(ui, rows, inner, keys, name => castFromPage($, name)),
  }
}

const featsPage = async (_$: EngineInterface, { ui, inner, progress: progressNow }: PageContext): Promise<Page> => ({
  items: featItems(ui, progressNow, inner),
  subtitle: featsSubtitle(progressNow),
})

const helpPage = async ($: EngineInterface, { ui }: PageContext): Promise<Page> => ({
  title: '❓ HELP',
  subtitle: `${HELP_COMMANDS.length} commands`,
  items: helpItems(ui, () => void update($, isHelpOpen, () => false)),
})

// The window a menu entry, a view inside the map tab, or the help page shows.
function pageFor($: EngineInterface, key: PageKey, ctx: PageContext): Promise<Page> {
  switch (key) {
    case 'spells':
      return spellsPage($, ctx)
    case 'pets':
      return petsPage($, ctx)
    case 'map':
      return mapPage($, ctx)
    case 'map:diff':
      return diffPage($, ctx)
    case 'map:outposts':
      return outpostsPage($)
    case 'map:bag':
      return bagPage($, ctx)
    case 'skills':
      return skillsPage($, ctx)
    case 'feats':
      return featsPage($, ctx)
    case 'help':
      return helpPage($, ctx)
  }
}

// The session's adventure log for /hud recap.
// Every figure counts from the HUD's watch start, so the duration, the tally and the trophies agree.
async function recap($: EngineInterface) {
  await refreshVitals($).catch(() => undefined)
  const now = await $.clock.now()
  const casts = await read($, castCount)
  const callList = (await read($, calls)).map(normalizeCall)
  const unlocked = (await read($, progress)).unlocked
  const since = await read($, startedAt)
  const vitalsNow = await read($, vitals)
  return recapText({
    hero: classOf(await read($, heroClass)),
    level: heroStats(callList, casts).level,
    casts,
    calls: callList,
    ...(since === 0 ? {} : { elapsedMs: now - since }),
    tally: await read($, tally),
    bestCombo: (await read($, combo)).best,
    boss: await read($, boss),
    touched: await read($, touched),
    ...(vitalsNow.usd === undefined ? {} : { usd: vitalsNow.usd }),
    ...(vitalsNow.contextPercent === undefined ? {} : { contextPercent: vitalsNow.contextPercent }),
    trophies: since === 0 ? [] : TROPHIES.filter(t => (unlocked[t.id] ?? 0) >= since).map(t => t.title),
  })
}

// Moves a window `by` rows within its items: `view` is the window as last drawn, its key, rows in all and room.
// A window that shows all it has is left alone, so a scroll key there writes nothing.
const scrollWindow = async ($: EngineInterface, view: { key: string; total: number; rows: number }, by: number) => {
  if (view.total <= view.rows) return
  await update($, offsets, all => ({ ...all, [view.key]: clampOffset((all[view.key] ?? 0) + by, view.total, view.rows) }))
}

export const register: Register = on => {
  // The last drawn log window; scrolling clamps against it.
  // `key` names the window being scrolled: a tab, or `map:bag` / `map:diff` inside the map tab.
  let layout = { rows: 1, total: 0, key: 'spells' }
  // Module state: whether the main loop's current turn has fizzled.
  let turnHadError = false
  // Agent calls asked to run in a worktree of their own, by tool_use_id, until their spawn.
  const isolated = new Set<string>()
  // Agent calls sent to run in the background, by tool_use_id, until their spawn.
  const background = new Set<string>()
  // Subagents being looked up in the agent list, so parallel tool calls of one add it once.
  const discovering = new Set<string>()
  // Calls auto mode denied, by tool_use_id, until their tool.call answers.
  const autoDenied = new Set<string>()
  // The loop whose tool `waitingFor` names: a subagent's id, undefined for the main loop.
  let waitingAgent: string | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description:
        'Open the adventure HUD (args: spell, party, map, skill, feats or 1-5; class [name] rerolls; cards toggles edit cards; follow toggles turning to the tab of what happens; recap sums up the session; help lists them all)',
    })
    await markStart($)
    await loadProgress($)
    follow.isOn = (await $.store.get(FOLLOW_KEY).catch(() => undefined)) !== false
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
    // A tab is named as its card shows it (`/hud party`, any case) or by its number there (`/hud 2`); its id
    // (`pets`) still works.
    const typed = e.args.trim()
    const arg = MENU.find((entry, index) => slotKey(index) === typed || entry.label.toLowerCase() === typed.toLowerCase())?.id ?? typed
    if (arg === 'class' || arg.startsWith('class ')) {
      const asked = arg.slice('class'.length).trim()
      if (asked !== '' && !isClassId(asked)) return { text: `No such class. Pick one of: ${CLASS_IDS.join(', ')}.` }
      const current = await read($, heroClass)
      const next = asked === '' ? rollClass(Math.random(), current) : asked
      await chooseClass($, next)
      return { text: `Claude is now a ${classOf(next).title.toLowerCase()}.` }
    }
    if (arg === 'recap') return { text: await recap($) }
    if (arg === 'cards') {
      const isOn = (await $.store.get(CARDS_KEY)) !== false
      await $.store.set(CARDS_KEY, !isOn)
      return { text: isOn ? 'Edit cards off: edits draw as before.' : 'Edit cards on.' }
    }
    if (arg === 'help') return { text: helpText() }
    if (arg === 'follow') {
      follow.isOn = !follow.isOn
      await $.store.set(FOLLOW_KEY, follow.isOn)
      return { text: follow.isOn ? 'The HUD follows the action to its tab.' : 'The HUD stays on the tab you pick.' }
    }
    if (isTab(arg)) {
      follow.isHeld = true
      await update($, tab, () => arg)
      await update($, isHelpOpen, () => false)
    }
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Adventure HUD opened.' }
  })

  // Auto mode's classifier denied a call: a refusal, known by the call's id rather than by its wording.
  on('classic.PermissionDenied', async ($, e, next) => {
    autoDenied.add(e.tool_use_id)
    return next(e)
  })

  // A permission prompt is about to ask the person; the panel says so until that tool is done. A hook beneath
  // that decides leaves no prompt to wait on.
  on('classic.PermissionRequest', async ($, e, next) => {
    const result = await next(e)
    if (result.decision === undefined) {
      waitingAgent = e.agent_id
      const tool = e.tool_name
      await update($, waitingFor, () => tool)
    }
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, waitingFor, () => null)
    // A new message lets the window follow again, whatever tab was picked during the last.
    follow.isHeld = false
    const known = (await read($, loadout)).skills.map(slot => slot.name)
    const skill = skillOfPrompt(e.text, known)
    if (skill !== undefined) await castSkill($, skill)
    await followTo($, skill === undefined ? 'spells' : 'skills')
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
    // An interrupted prompt leaves nothing waiting on the person.
    await update($, waitingFor, () => null)
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
    const isBackground = background.delete(e.tool_use_id)
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
      ...(isBackground ? { isBackground } : {}),
    }
    await joinParty($, pet)
    return ran
  })

  on('tool.call', async ($, e, next) => {
    const isMain = e.agentId === undefined
    // A mod loaded mid-session starts its watch at the first call it sees.
    await markStart($)
    const startedAt = await $.clock.now()
    const summary = summarize(e)
    const call: ToolCall = { id: e.tool_use_id, tool: e.tool, summary, startedAt, status: 'run' }

    // A foreground Agent call returns with its pet's answer; a background one returns at once.
    const isBackground = (e as { run_in_background?: unknown }).run_in_background === true
    if (e.tool === 'Agent' && (e as { isolation?: unknown }).isolation === 'worktree') isolated.add(e.tool_use_id)
    if (e.tool === 'Agent' && isBackground) background.add(e.tool_use_id)
    // A question to the person waits on them while it is open.
    if (e.tool === 'AskUserQuestion') {
      waitingAgent = e.agentId
      await update($, waitingFor, () => e.tool)
    }
    if (isMain) {
      await update($, calls, list => [...list, call].slice(-200))
      await update($, castCount, count => count + 1)
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
    let isAutoDenied = false
    try {
      ran = await next(e)
    } finally {
      if (isMain) anim.running -= 1
      // Auto mode denies while the call is under way; answered or not, its mark goes with it.
      isAutoDenied = autoDenied.delete(e.tool_use_id)
      // An Agent call that never spawned (refused, interrupted) leaves no mark behind.
      if (e.tool === 'Agent') {
        isolated.delete(e.tool_use_id)
        background.delete(e.tool_use_id)
      }
      // Run or refused, the tool a prompt asked about no longer waits on the person; the same tool in another
      // loop is not the one asked about.
      if (waitingAgent === e.agentId && (await read($, waitingFor)) === e.tool) await update($, waitingFor, () => null)
    }
    // A refused call never ran: the hero takes no hurt, the combo and the turn's streak stand.
    const isRefused = isAutoDenied || isRefusal(ran)
    const isError = !isRefused && ran.isError === true
    const status: ToolCallStatus = isRefused ? 'deny' : isError ? 'err' : 'ok'

    // The world reacts to every loop's calls: files explored, bosses fought.
    // NotebookEdit names its file `notebook_path`.
    const fields = e as { file_path?: unknown; notebook_path?: unknown }
    const filePath = fields.file_path ?? fields.notebook_path
    if (typeof filePath === 'string' && !isRefused && (e.tool === 'Read' || EDIT_TOOLS.has(e.tool))) {
      const cwd = await $.session.cwd()
      const path = filePath.startsWith(`${cwd}/`) ? filePath.slice(cwd.length + 1) : filePath
      await update($, touched, list => touchFile(list, path, EDIT_TOOLS.has(e.tool)))
      if (EDIT_TOOLS.has(e.tool)) void refreshMap($, 'files').catch(() => undefined)
    }
    if (e.tool === 'Bash' && !isRefused) {
      const command = e.command
      const fight = fightBoss(await read($, boss), command, isError, ran.text ?? '')
      await update($, boss, () => fight.boss)
      if (fight.event === 'appear' && fight.boss !== null) {
        $.ui.toast(`☠ ${fight.boss.name} appears! HP ${fight.boss.hp}`)
      }
      if (fight.event === 'defeat') {
        $.ui.toast('⚔ Boss defeated!')
        await update($, tally, t => ({ ...t, bossesDefeated: t.bossesDefeated + 1 }))
        void advance($, p => ({ ...p, bossesDefeated: p.bossesDefeated + 1 }))
      }
      if (runsGit(command)) {
        void refreshMap($).catch(() => undefined)
        if (isMain) await followTo($, 'map')
      }
    }

    if (!isMain) return ran

    const endedAt = await $.clock.now()
    const ms = Math.round(endedAt - startedAt)
    if (isError) {
      anim.hurtUntil = endedAt + HURT_MS
      turnHadError = true
    }
    if (isError || isRefused) {
      await update($, tally, t => (isError ? { ...t, failures: t.failures + 1 } : { ...t, refusals: t.refusals + 1 }))
    }
    await update($, calls, list => list.map(one => (one.id === call.id ? { ...normalizeCall(one), ms, status } : one)))
    if (!isRefused) await update($, combo, current => {
      const streak = isError ? 0 : current.current + 1
      return { current: streak, best: Math.max(current.best, streak) }
    })

    if (e.tool === 'Agent' && !isBackground && !isRefused) {
      await finishPet($, pet => pet.id === call.id, isError ? 'err' : 'ok', ran.text ?? '')
    }
    if (e.tool === 'Skill' && !isRefused) {
      const skill = (e as { skill?: unknown }).skill
      if (typeof skill === 'string') {
        await castSkill($, skill)
        await followTo($, 'skills')
      }
    }

    // A refused call never ran: it gives back the cast counted at its start and earns no lifetime count or level.
    if (isRefused) {
      await update($, castCount, count => count - 1)
      return ran
    }

    const total = await read($, castCount)
    const best = (await read($, combo)).best
    const isNight = new Date(endedAt).getHours() < NIGHT_HOURS
    void advance($, p => ({
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

  // A card's icon Client posts `{ select }` when clicked, `{ help }` on ?; the bag and outposts Clients their rows.
  on('ui.message', async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const data = (e.data ?? {}) as { select?: unknown; help?: unknown; letter?: unknown; scroll?: unknown }
    // Each card's icon Client is keyed `icon-<tab>`.
    const isMenu = e.element?.startsWith('icon-') === true
    if (isMenu && typeof data.scroll === 'number') {
      await scrollWindow($, layout, data.scroll)
      return {}
    }
    // A letter a menu icon heard while it had the keys: on the skills page, the skill shown under that letter.
    if (isMenu && typeof data.letter === 'string') {
      const name = shownSkillKeys.get(data.letter)
      if (name === undefined) return {}
      const [tabNow, helpOpen] = await Promise.all([read($, tab), read($, isHelpOpen)])
      if (tabNow === 'skills' && !helpOpen) castFromPage($, name)
      return {}
    }
    if (isMenu && data.help === true) {
      await update($, isHelpOpen, open => !open)
      await update($, offsets, all => ({ ...all, help: 0 }))
      return {}
    }
    if (isMenu && typeof data.select === 'string' && isTab(data.select)) {
      follow.isHeld = true
      const picked = data.select
      await update($, tab, () => picked)
      await update($, isHelpOpen, () => false)
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
    await scrollWindow($, layout, e.by)
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
    const bossNow = await read($, boss)
    const waiting = await read($, waitingFor)
    const helpOpen = await read($, isHelpOpen)
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
        casts: await read($, castCount),
        vitals: await read($, vitals),
        combo: await read($, combo),
        boss: bossNow,
        trophies: {
          earned: TROPHIES.filter(t => progressNow.unlocked[t.id] !== undefined).length,
          total: TROPHIES.length,
        },
        petsOut: petList.filter(pet => pet.status === 'run').length,
        ...campOf(await read($, outposts)),
        isFlashing: (await read($, flashUntil)) > now,
        width,
        ...(waiting === null ? {} : { waitingFor: waiting }),
        onHelp: () => {
          void update($, isHelpOpen, open => !open)
          void update($, offsets, all => ({ ...all, help: 0 }))
        },
        ...(bossNow === null
          ? {}
          : {
              onFight: () => fillPrompt($, fightText(bossNow), `Ask Claude: ${fightText(bossNow)}`),
            }),
      },
      Raster,
    )

    // The icon menu when the slots and the window both have room; one line of labels otherwise.
    const card = cardWidth(width, MENU.length, ICON_COLUMNS)
    const isTerminal = e.surface === 'terminal'
    const roomRows = e.props.scroll.bodyRows - STATUS_ROWS - WINDOW_CHROME_ROWS
    const isIconMenu = isTerminal && card >= MIN_SLOT_COLUMNS && roomRows - SLOT_ROWS >= MIN_WINDOW_ROWS
    const menuRows = isIconMenu ? SLOT_ROWS : 1
    const rows = Math.max(MIN_WINDOW_ROWS, roomRows - menuRows)

    // Each slot's label is a button carrying its number as a hotkey, so once the pane has the keys (a click,
    // ctrl+x tab) the number picks the tab; Tab and Enter reach it as well.
    const pickTab = (id: Tab) => {
      follow.isHeld = true
      void update($, tab, () => id)
      void update($, isHelpOpen, () => false)
    }
    // On the terminal plain buttons, which draw their hotkey before the label: `1: SPELL`; elsewhere the
    // surface's own buttons, the active one primary.
    const labelButton = (slot: (typeof MENU)[number], index: number) => {
      const isActive = slot.id === active
      return (
        <Button
          key={`menu-${slot.id}`}
          label={isTerminal ? slot.label.toUpperCase() : slot.label}
          hotkey={slotKey(index)}
          {...(isTerminal ? { plain: true as const } : { variant: isActive ? ('primary' as const) : ('secondary' as const) })}
          dimColor={!isActive}
          {...(isActive ? {} : { hover: { scope: `card-${slot.id}`, color: slot.color } })}
          onPress={() => pickTab(slot.id)}
        />
      )
    }

    // A card a slot: a rounded frame, the icon (a Client, so a click on it picks the tab) and the label button,
    // centred in a row as wide as the card.
    // The frame, the icon's pixels and the label share the card's hover group, the surface's own hover, so the
    // whole card lights in the slot's colour at once and goes dark when the pointer leaves; the selected card's
    // frame is bright gold. (Heavy lines have no rounded corners.) Too narrow or short for icons,
    // and elsewhere, one row of the buttons alone.
    let menu
    if (isIconMenu) {
      const { Client } = $.ui.resolve(e)
      const ids = MENU.map(slot => slot.id)
      // Inside the frame's two columns.
      const inside = Math.max(0, card - 2)
      menu = (
        <Box flexDirection="row" width={width} height={menuRows} justifyContent="space-between">
          {MENU.map((slot, index) => {
            const isActive = slot.id === active
            const iconProps = {
              id: slot.id,
              ids,
              active,
              isHelpOpen: helpOpen,
              icon: iconText(slot, true),
              dimIcon: iconText(slot, false),
              width: inside,
              scope: `card-${slot.id}`,
            } satisfies MenuIconProps
            return (
              <Box
                key={`card-${slot.id}`}
                flexDirection="column"
                alignItems="center"
                width={card}
                height={menuRows}
                borderStyle="round"
                borderColor={isActive ? 'yellow' : 'gray'}
                borderDimColor={!isActive}
                {...(isActive ? {} : { hover: { scope: `card-${slot.id}`, borderColor: slot.color, borderDimColor: false } })}
              >
                <Client key={`icon-${slot.id}`} module="./menu-client.tsx" props={iconProps} width={inside} height={ICON_ROWS} />
                <Box flexDirection="row" width={inside} height={1} justifyContent="center">
                  {labelButton(slot, index)}
                </Box>
              </Box>
            )
          })}
        </Box>
      )
    } else {
      // The terminal's `1: SPELL` labels close up as the pane narrows, so the last ones stay on screen.
      const labelColumns = MENU.reduce((sum, slot) => sum + slot.label.length + 3, 0)
      const labelGap = isTerminal ? Math.max(0, Math.min(2, Math.floor((width - labelColumns) / (MENU.length - 1)))) : 2
      menu = (
        <Box key="menu-labels" flexDirection="row" columnGap={labelGap} height={1} width={width}>
          {MENU.map((slot, index) => labelButton(slot, index))}
        </Box>
      )
    }

    const inner = Math.max(0, width - WINDOW_CHROME_COLUMNS)
    const view = active === 'map' ? await read($, mapView) : { view: 'map' as const }
    const tabKey = (active === 'map' && view.view !== 'map' ? `map:${view.view}` : active) as PageKey
    const windowKey: PageKey = helpOpen ? 'help' : tabKey
    const offset = (await read($, offsets))[windowKey] ?? 0
    const page = await pageFor($, windowKey, { ui, view, inner, now, Raster, callList, petList, progress: progressNow, offset, rows })
    const items = page.items ?? []
    layout = { rows, total: page.list?.rows.length ?? totalRows(items), key: windowKey }
    const body = page.list === undefined ? undefined : pickBody($, e, page.list, offset, rows, inner)

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
        {renderWindow(ui, {
          title: page.title ?? entry.title,
          subtitle: page.subtitle,
          color: entry.color,
          items,
          offset,
          rows,
          width,
          ...(body === undefined ? {} : { body }),
          ...(page.actions === undefined ? {} : { actions: page.actions }),
          scroll: {
            up: () => void scrollWindow($, layout, -1),
            down: () => void scrollWindow($, layout, 1),
          },
        })}
      </Box>
    )
  })
}
