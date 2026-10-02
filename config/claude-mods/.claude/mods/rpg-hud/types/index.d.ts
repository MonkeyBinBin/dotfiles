export type ToolCallStatus = 'run' | 'ok' | 'err'

export type ToolCall = {
  id: string
  tool: string
  summary: string
  startedAt: number
  ms?: number
  status: ToolCallStatus
}

// The command menu's entries; the hero's status panel above them never changes.
export type Tab = 'spells' | 'pets' | 'map' | 'skills' | 'feats'

// A subagent, keyed by the Agent call that summoned it.
export type Pet = {
  id: string
  agentId?: string
  kind: string
  description: string
  startedAt: number
  endedAt?: number
  status: ToolCallStatus
  actions: number
  lastTool?: string
  lastSummary?: string
  loot?: string
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

// What the map tab shows: the map itself, the bag of unsaved changes, or one change's diff.
export type MapView = { view: 'map' | 'bag' | 'diff'; path?: string }

// The diff being inspected, as git printed it.
export type Inspect = { path: string; lines: string[]; isCut: boolean }

export type SkillSlot = { name: string; source: string; plugin?: string }

export type Gear = { server: string; tools: number; isLoaded: boolean }

export type Loadout = { skills: SkillSlot[]; gear: Gear[] }

// Lifetime figures, kept in $.store across sessions and mirrored into state for drawing.
export type Progress = {
  totalCalls: number
  bashCalls: number
  bestCombo: number
  turnStreak: number
  bestTurnStreak: number
  bossesDefeated: number
  petsSummoned: number
  maxPetsAtOnce: number
  peakContext: number
  isNightOwl: boolean
  // Every hero class a session has rolled.
  classesPlayed: string[]
  skillUses: Record<string, number>
  // Achievement id to the time it was unlocked.
  unlocked: Record<string, number>
}

declare module 'claude-code' {
  interface PluginState {
    'rpg-hud': {
      calls: ToolCall[]
      // Rows scrolled down each menu window.
      offsets: Record<string, number>
      // Until when the status panel glows after a level up.
      flashUntil: number
      tab: Tab
      // The hero class this session rolled.
      heroClass: string
      pets: Pet[]
      vitals: Vitals
      combo: Combo
      boss: Boss | null
      map: GitMap
      touched: TouchedFile[]
      bag: BagItem[]
      mapView: MapView
      inspect: Inspect | null
      loadout: Loadout
      // Skill name to the time it was last cast this session.
      skillCasts: Record<string, number>
      progress: Progress
    }
  }
}
