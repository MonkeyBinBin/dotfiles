// `deny`: refused before it ran (a permission answered no); shown, but no fizzle.
export type ToolCallStatus = 'run' | 'ok' | 'err' | 'deny'

export type ToolCall = {
  id: string
  tool: string
  summary: string
  startedAt: number
  ms?: number
  status: ToolCallStatus
}

// Which calls the spell book lists: every one, the fizzles, or the slow ones.
export type SpellFilter = 'all' | 'errors' | 'slow'

// This session's own figures since the HUD's watch began (`startedAt`), for /hud recap; the lifetime ones live
// in Progress.
export type Tally = { failures: number; refusals: number; bossesDefeated: number; petsSummoned: number }

// The command menu's entries; the hero's status panel above them never changes.
export type Tab = 'spells' | 'pets' | 'map' | 'skills' | 'jobs'

// A subagent, keyed by the Agent call that summoned it.
export type Pet = {
  id: string
  agentId?: string
  kind: string
  description: string
  startedAt: number
  endedAt?: number
  // A pet is only spawned by a call that ran, so it is never refused.
  status: Exclude<ToolCallStatus, 'deny'>
  actions: number
  lastTool?: string
  lastSummary?: string
  loot?: string
  // The outpost (worktree) the pet works in, when not the session's own folder.
  camp?: string
  // Sent with run_in_background: its return is announced, since nothing waits on it.
  isBackground?: boolean
}

// A background task a Bash or Monitor call left running, keyed by the engine's task id.
// `done`: gone from the engine's list with no notification seen, so how it ended is unknown.
export type JobStatus = 'run' | 'ok' | 'err' | 'kill' | 'done'

export type Job = {
  id: string
  toolUseId: string
  kind: 'shell' | 'monitor'
  command: string
  description: string
  startedAt: number
  endedAt?: number
  status: JobStatus
  exitCode?: number
  // The subagent whose call started it; absent for the main loop.
  agentId?: string
}

// Context window and spend, as the status line reports them.
export type Vitals = { contextPercent?: number; usd?: number }

export type Combo = { current: number; best: number }

// A failing test or lint run; cleared once the same kind of command passes.
export type Boss = { name: string; kind: string; hp: number; maxHp: number; command: string }

export type GitMap = {
  isRepo: boolean
  branch: string
  ahead: number
  behind: number
  dirty: number
  graph: string[]
  // The remotes' names (`git remote`), which tell remote-tracking refs from local branches.
  remotes?: string[]
}

export type TouchedFile = { path: string; reads: number; edits: number }

// One uncommitted change, an item in the bag: git's status letter and the lines it adds and removes.
export type BagItem = {
  path: string
  status: 'M' | 'A' | 'D' | 'R' | '?'
  added: number
  removed: number
  isBinary: boolean
}

// What the map tab shows: the map itself, the outposts (worktrees), a bag of unsaved changes, or one change's diff.
// `root` names the outpost whose bag or diff it is; absent, the session's own.
// `via` marks a bag or diff reached from the outposts list, where back leads even for the session's own folder.
export type MapView = { view: 'map' | 'outposts' | 'bag' | 'diff'; path?: string; root?: string; via?: 'outposts' }

// One git worktree: an outpost of the repository, its branch, and how its work stands.
export type Outpost = {
  path: string
  // `path` with every symbolic link resolved, what the session's folder is compared against.
  realPath: string
  name: string
  // The branch checked out, without refs/heads/; empty when detached.
  branch: string
  isHere: boolean
  isMain: boolean
  isLocked: boolean
  isPrunable: boolean
  ahead: number
  behind: number
  dirty: number
  // The last commit's age, `3h`; empty when unknown.
  age: string
}

// The diff being inspected, as git printed it.
export type Inspect = { path: string; lines: string[]; isCut: boolean }

export type SkillSlot = { name: string; source: string; plugin?: string }

export type Gear = { server: string; tools: number; isLoaded: boolean }

export type Loadout = { skills: SkillSlot[]; gear: Gear[] }

// Lifetime figures, kept in $.store across sessions and mirrored into state for drawing: how often each skill was
// cast, which the skills tab and the skill-bar mod read.
export type Progress = {
  skillUses: Record<string, number>
}

declare module 'claude-code' {
  interface PluginState {
    'rpg-hud': {
      // The latest 200 calls, for the spell book.
      calls: ToolCall[]
      // Every main-loop call this session, uncapped: the hero's level and XP.
      castCount: number
      // Rows scrolled down each menu window.
      offsets: Record<string, number>
      // Until when the status panel glows after a level up.
      flashUntil: number
      tab: Tab
      // The hero class this session rolled.
      heroClass: string
      pets: Pet[]
      // Background shells and monitors, running first; the finished ones kept are capped.
      jobs: Job[]
      // The job whose stop was pressed once and waits for the second press; null when none.
      stopArmed: string | null
      vitals: Vitals
      combo: Combo
      boss: Boss | null
      map: GitMap
      touched: TouchedFile[]
      bag: BagItem[]
      outposts: Outpost[]
      // The bag of the outpost being looked at.
      outpostBag: { root: string; items: BagItem[] } | null
      mapView: MapView
      inspect: Inspect | null
      loadout: Loadout
      // Skill name to the time it was last cast this session.
      skillCasts: Record<string, number>
      spellFilter: SpellFilter
      tally: Tally
      // Whether the window shows the help page in place of the tab's own.
      isHelpOpen: boolean
      // The tool a permission prompt asks about, or AskUserQuestion, while the session waits on the person.
      waitingFor: string | null
      // When the HUD began watching this session: its start, or the first call it saw. 0 until then.
      startedAt: number
      progress: Progress
    }
  }
}
