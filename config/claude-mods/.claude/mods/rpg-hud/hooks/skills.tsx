import type { ElementTable } from 'claude-code'

import type { Loadout, Progress, SkillSlot } from '../types'
import type { Item } from './window'

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
  return `${learned}/${loadout.skills.length} learned · a letter casts`
}

// One row of the skills page.
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

// The keys the skills on screen answer to, top to bottom: the alphabet less j and k, which scroll the window.
// The menu's tabs keep the digits.
export const SKILL_KEYS = 'abcdefghilmnopqrstuvwxyz'

// Each on-screen skill's key: the window shows `count` rows from `start`, and only what it shows is drawn, so
// the letters go to the skills in view, a from the top, and move with the scroll.
export const skillKeys = (rows: readonly SkillRow[], start: number, count: number): Map<number, string> => {
  const keys = new Map<number, string>()
  rows.forEach((row, index) => {
    if (row.kind !== 'skill' || index < start || index >= start + count) return
    const key = SKILL_KEYS[keys.size]
    if (key !== undefined) keys.set(index, key)
  })
  return keys
}

// Columns: the glow, the three stars and a space; `a: ` the button draws before the name; the use count.
const GLOW = 2
const STARS = 4
const KEY = 3
const USES = 6

const fit = (text: string, width: number): string =>
  text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text

// The skills page: each school's skills as buttons that fill the prompt, each keyed by a letter while in view,
// with its mastery and how often it was cast; then the MCP servers as equipment.
export function skillItems(
  ui: ElementTable,
  rows: readonly SkillRow[],
  width: number,
  keys: ReadonlyMap<number, string>,
  cast: (name: string) => void,
): Item[] {
  const { Box, Button, Text } = ui
  const nameWidth = Math.max(4, width - GLOW - STARS - KEY - USES)
  const item = (index: number, node: Item['node']): Item => ({ key: `skill-row-${index}`, rows: 1, node })
  return rows.map((row, index) => {
    switch (row.kind) {
      case 'skill': {
        const key = keys.get(index)
        return item(
          index,
          <Box flexDirection="row" height={1}>
            <Box width={GLOW}>
              <Text color="yellow">{row.isGlowing ? '✦' : ' '}</Text>
            </Box>
            <Box width={STARS}>
              <Text color="yellow" dimColor={row.uses === 0}>
                {masteryStars(row.uses)}
              </Text>
            </Box>
            <Box flexGrow={1}>
              <Button
                key={`cast-${row.name}`}
                label={fit(row.name, nameWidth)}
                plain
                {...(key === undefined ? {} : { hotkey: key })}
                dimColor={row.uses === 0}
                onPress={() => cast(row.name)}
              />
            </Box>
            <Box width={USES} justifyContent="flex-end">
              <Text dimColor>{row.uses > 0 ? `×${row.uses}` : ''}</Text>
            </Box>
          </Box>,
        )
      }
      case 'school':
        return item(
          index,
          <Text bold color="blue">
            ❖ {row.text}
          </Text>,
        )
      case 'gear-title':
        return item(
          index,
          <Text bold color="magenta">
            🛡 Equipment <Text dimColor>{row.count} MCP servers</Text>
          </Text>,
        )
      case 'gear':
        return item(
          index,
          <Text wrap="truncate">
            <Text color={row.isLoaded ? 'magenta' : 'gray'}>{row.isLoaded ? '  ⚔ ' : '  · '}</Text>
            <Text dimColor={!row.isLoaded}>{row.server}</Text>
            <Text dimColor> {row.tools} tools</Text>
          </Text>,
        )
      case 'note':
        return item(index, <Text dimColor>{row.text}</Text>)
      default:
        return item(index, <Text> </Text>)
    }
  })
}
