import type { Loadout, Progress, SkillSlot } from '../types'

// Uses to reach each mastery star.
const MASTERY = [1, 3, 10] as const
// A skill cast this long ago still glows.
export const GLOW_MS = 5 * 60 * 1000

export const masteryStars = (uses: number): string => MASTERY.map(at => (uses >= at ? '★' : '☆')).join('')

const SCHOOLS: Record<string, string> = {
  userSettings: 'Personal',
  projectSettings: 'Project',
  policySettings: 'Managed',
  localSettings: 'Local',
  plugin: 'Plugin',
  bundled: 'Built-in',
  builtin: 'Built-in',
  'built-in': 'Built-in',
}

export const schoolOf = (slot: SkillSlot): string =>
  slot.plugin !== undefined ? `Plugin · ${slot.plugin}` : (SCHOOLS[slot.source] ?? slot.source)

// Skills grouped by where they come from; personal ones first, then by name.
export const groupSkills = (skills: readonly SkillSlot[]): [string, SkillSlot[]][] => {
  const groups = new Map<string, SkillSlot[]>()
  for (const slot of skills) {
    const school = schoolOf(slot)
    groups.set(school, [...(groups.get(school) ?? []), slot])
  }
  const rank = (school: string) => {
    const at = ['Personal', 'Project', 'Local'].indexOf(school)
    return at < 0 ? 99 : at
  }
  return [...groups.entries()]
    .map(([school, list]): [string, SkillSlot[]] => [school, list.sort((a, b) => a.name.localeCompare(b.name))])
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
}

export const skillsSubtitle = (loadout: Loadout, progress: Progress): string => {
  const learned = loadout.skills.filter(slot => (progress.skillUses[slot.name] ?? 0) > 0).length
  return `${learned}/${loadout.skills.length} learned · click to cast`
}

// One row of the skills page, plain data for the Client that draws it.
export type SkillRow =
  | { kind: 'school'; text: string }
  | { kind: 'skill'; name: string; uses: number; isGlowing: boolean }
  | { kind: 'gap' }
  | { kind: 'gear-title'; count: number }
  | { kind: 'gear'; server: string; tools: number; isLoaded: boolean }
  | { kind: 'note'; text: string }

export type SkillsData = {
  loadout: Loadout
  progress: Progress
  casts: Record<string, number>
  now: number
}

// Each school's skills with their mastery, then the MCP servers as equipment.
export function skillRows(data: SkillsData): SkillRow[] {
  const { loadout, progress, casts, now } = data
  const rows: SkillRow[] = []
  if (loadout.skills.length === 0) rows.push({ kind: 'note', text: 'Reading the skill tomes…' })
  for (const [school, list] of groupSkills(loadout.skills)) {
    rows.push({ kind: 'school', text: school })
    for (const slot of list) {
      const castAt = casts[slot.name]
      rows.push({
        kind: 'skill',
        name: slot.name,
        uses: progress.skillUses[slot.name] ?? 0,
        isGlowing: castAt !== undefined && now - castAt < GLOW_MS,
      })
    }
    rows.push({ kind: 'gap' })
  }
  rows.push({ kind: 'gear-title', count: loadout.gear.length })
  if (loadout.gear.length === 0) rows.push({ kind: 'note', text: 'No gear equipped.' })
  for (const gear of loadout.gear) {
    rows.push({ kind: 'gear', server: gear.server, tools: gear.tools, isLoaded: gear.isLoaded })
  }
  return rows
}

// What a cast puts in the prompt box: the command and a space for its arguments.
export const castText = (name: string): string => `/${name} `
