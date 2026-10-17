import type { ElementTable } from 'claude-code'

import type { Loadout, Progress, SkillSlot } from '../types'
import type { Item } from './window'

// Uses to reach each mastery star.
const MASTERY = [1, 3, 10] as const
// A skill cast this long ago still glows.
export const GLOW_MS = 5 * 60 * 1000

export const masteryStars = (uses: number): string => MASTERY.map(at => (uses >= at ? '★' : '☆')).join('')

// Mastery tiers, highest first: a skill climbs as it is cast.
export type Tier = 'master' | 'adept' | 'novice' | 'untried'
const TIERS: readonly { tier: Tier; at: number; color: string; gem: string }[] = [
  { tier: 'master', at: MASTERY[2], color: 'yellow', gem: '◆' },
  { tier: 'adept', at: MASTERY[1], color: 'cyan', gem: '◈' },
  { tier: 'novice', at: MASTERY[0], color: 'green', gem: '◇' },
  { tier: 'untried', at: 0, color: 'gray', gem: '·' },
]

export const tierOf = (uses: number): Tier => TIERS.find(t => uses >= t.at)?.tier ?? 'untried'

// Skills the person or the project wrote: always in the collection, cast or not.
const OWN_SOURCES = ['userSettings', 'projectSettings', 'localSettings']
export const isOwnSkill = (slot: SkillSlot): boolean => slot.plugin === undefined && OWN_SOURCES.includes(slot.source)

const SOURCES: Record<string, string> = {
  userSettings: 'personal',
  projectSettings: 'project',
  localSettings: 'local',
  policySettings: 'managed',
  bundled: 'built-in',
  builtin: 'built-in',
  'built-in': 'built-in',
}

// Where a skill comes from, in its row's last column: its plugin, or whose settings hold it. Two skills of one
// name tell apart by it.
export const sourceOf = (slot: SkillSlot): string => slot.plugin ?? SOURCES[slot.source] ?? slot.source

export const skillsSubtitle = (loadout: Loadout, progress: Progress): string => {
  const learned = loadout.skills.filter(slot => (progress.skillUses[slot.name] ?? 0) > 0).length
  return `${learned}/${loadout.skills.length} learned · a row casts`
}

// One skill on the list.
export type SkillNode = { name: string; source: string; uses: number; isGlowing: boolean }

// One row of the skills page.
export type SkillRow =
  | { kind: 'header' }
  | { kind: 'skill'; node: SkillNode; isSealed: boolean }
  | { kind: 'sealed'; count: number; isOpen: boolean }
  | { kind: 'gap' }
  | { kind: 'gear-title'; count: number }
  | { kind: 'gear'; server: string; tools: number; isLoaded: boolean }
  | { kind: 'note'; text: string }

export type SkillsData = {
  loadout: Loadout
  progress: Progress
  casts: Record<string, number>
  now: number
  // Whether the skills never cast, beyond the person's own, are shown.
  isSealedOpen: boolean
}

// A plugin's skill without its plugin's name, which the source column carries: `superpowers:brainstorming` reads
// `brainstorming`.
export const shortName = (name: string): string => name.slice(name.lastIndexOf(':') + 1)

const byUse = (a: SkillNode, b: SkillNode) => b.uses - a.uses || shortName(a.name).localeCompare(shortName(b.name))

// The list: a header, then a row a skill, the most cast first, each marked by its tier. The skills cast, and the
// person's own, are on it; the rest are sealed below, listed when opened. Then the MCP servers as equipment.
export function skillRows(data: SkillsData): SkillRow[] {
  const { loadout, progress, casts, now, isSealedOpen } = data
  const rows: SkillRow[] = []
  if (loadout.skills.length === 0) rows.push({ kind: 'note', text: 'Reading the skill tomes…' })
  const nodes = loadout.skills.map(slot => {
    const castAt = casts[slot.name]
    const node: SkillNode = {
      name: slot.name,
      source: sourceOf(slot),
      uses: progress.skillUses[slot.name] ?? 0,
      isGlowing: castAt !== undefined && now - castAt < GLOW_MS,
    }
    return { slot, node }
  })
  const owned = nodes.filter(({ slot, node }) => node.uses > 0 || isOwnSkill(slot)).map(({ node }) => node)
  const sealed = nodes.filter(({ slot, node }) => node.uses === 0 && !isOwnSkill(slot)).map(({ node }) => node)
  if (loadout.skills.length > 0 && !owned.some(node => node.uses > 0)) {
    rows.push({ kind: 'note', text: 'Cast a skill to learn it: it climbs to ★★★ at ten casts.' })
  }
  if (owned.length > 0 || (isSealedOpen && sealed.length > 0)) rows.push({ kind: 'header' })
  for (const node of [...owned].sort(byUse)) rows.push({ kind: 'skill', node, isSealed: false })
  if (sealed.length > 0) {
    rows.push({ kind: 'gap' }, { kind: 'sealed', count: sealed.length, isOpen: isSealedOpen })
    if (isSealedOpen) for (const node of [...sealed].sort(byUse)) rows.push({ kind: 'skill', node, isSealed: true })
  }
  rows.push({ kind: 'gap' }, { kind: 'gear-title', count: loadout.gear.length })
  if (loadout.gear.length === 0) rows.push({ kind: 'note', text: 'No gear equipped.' })
  for (const gear of loadout.gear) {
    rows.push({ kind: 'gear', server: gear.server, tools: gear.tools, isLoaded: gear.isLoaded })
  }
  return rows
}

// What a cast puts in the prompt box: the command and a space for its arguments.
export const castText = (name: string): string => `/${name} `

const styleOf = (tier: Tier) => TIERS.find(t => t.tier === tier)!

const fit = (text: string, width: number): string =>
  text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text

// The casts that earn a skill its next star; a master has none to go.
export const nextStar = (uses: number): number | undefined => MASTERY.find(at => uses < at)

// The table's columns, left to right: the tier's gem, the name taking what is left, the stars, a bar toward the
// next star and the count it reads, the source. A narrow window drops the source, then the bar, so the name keeps
// its room.
const GEM = 2
const STARS = 4
const BAR = 7
const COUNT = 6
const SOURCE = 14
// The narrowest the name column goes before a column is dropped for it.
const MIN_NAME = 16

export type SkillColumns = { name: number; hasBar: boolean; hasSource: boolean }

export const skillColumns = (width: number): SkillColumns => {
  const fixed = GEM + STARS + COUNT
  const hasSource = width - fixed - BAR - SOURCE >= MIN_NAME
  const hasBar = width - fixed - BAR - (hasSource ? SOURCE : 0) >= MIN_NAME
  return { name: Math.max(4, width - fixed - (hasBar ? BAR : 0) - (hasSource ? SOURCE : 0)), hasBar, hasSource }
}

// `4/10` toward the next star, `MAX` for a master.
const countText = (uses: number): string => {
  const next = nextStar(uses)
  return next === undefined ? 'MAX' : `${uses}/${next}`
}

// The bar's filled cells toward the next star, of `cells`.
const barFill = (uses: number, cells: number): number => {
  const next = nextStar(uses)
  return next === undefined ? cells : Math.floor((cells * uses) / next)
}

const padEnd = (text: string, width: number) => text + ' '.repeat(Math.max(0, width - [...text].length))
const padStart = (text: string, width: number) => ' '.repeat(Math.max(0, width - [...text].length)) + text

// The skills page: a table of the skills, a row each, every column on the same columns down the list; a row is one
// button, a click anywhere on it fills the prompt (off the terminal, where a button cannot hold the columns' boxes,
// the name is the button). Then the sealed skills behind a toggle, and the MCP servers.
export function skillItems(
  ui: ElementTable,
  rows: readonly SkillRow[],
  width: number,
  isTerminal: boolean,
  cast: (name: string) => void,
  toggleSealed: () => void,
): Item[] {
  const { Box, Button, Text } = ui
  const columns = skillColumns(width)
  const item = (index: number, node: Item['node']): Item => ({ key: `skill-row-${index}`, rows: 1, node })
  return rows.map((row, index) => {
    switch (row.kind) {
      case 'header': {
        const title = (text: string, size: number, isRight = false) => (isRight ? padStart(text, size) : padEnd(text, size))
        return item(
          index,
          <Text dimColor wrap="truncate">
            {title('', GEM)}
            {title('SKILL', columns.name)}
            {title('★', STARS)}
            {columns.hasBar ? title(' NEXT', BAR) : ''}
            {title('', COUNT, true)}
            {columns.hasSource ? title('SOURCE', SOURCE, true) : ''}
          </Text>,
        )
      }
      case 'skill': {
        const { node, isSealed } = row
        const { color, gem } = styleOf(tierOf(node.uses))
        const isLearned = node.uses > 0
        const name = fit(shortName(node.name), columns.name - 1)
        const filled = barFill(node.uses, BAR - 1)
        const count = countText(node.uses)
        const isMax = count === 'MAX'
        const parts = {
          gem: (
            <Text key="gem" color={node.isGlowing ? 'yellow' : color} bold={node.isGlowing} dimColor={isSealed}>
              {padEnd(node.isGlowing ? '✦' : gem, GEM)}
            </Text>
          ),
          stars: (
            <Text key="stars" color="yellow" dimColor={!isLearned}>
              {padEnd(masteryStars(node.uses), STARS)}
            </Text>
          ),
          filled: (
            <Text key="filled" color={color}>
              {' ' + '▰'.repeat(filled)}
            </Text>
          ),
          empty: (
            <Text key="empty" dimColor>
              {'▱'.repeat(BAR - 1 - filled)}
            </Text>
          ),
          count: (
            <Text key="count" dimColor={!isMax} {...(isMax ? { color: 'yellow', bold: true } : {})}>
              {padStart(count, COUNT)}
            </Text>
          ),
          source: (
            <Text key="source" dimColor>
              {padStart(fit(node.source, SOURCE - 2), SOURCE)}
            </Text>
          ),
        }
        if (isTerminal) {
          return item(
            index,
            <Button key={`cast-${node.name}`} label={shortName(node.name)} plain onPress={() => cast(node.name)}>
              {[
                parts.gem,
                <Text key="name" bold={isLearned} dimColor={!isLearned || isSealed}>
                  {padEnd(name, columns.name)}
                </Text>,
                parts.stars,
                ...(columns.hasBar ? [parts.filled, parts.empty] : []),
                parts.count,
                ...(columns.hasSource ? [parts.source] : []),
              ]}
            </Button>,
          )
        }
        return item(
          index,
          <Box flexDirection="row" height={1} width={width}>
            <Box width={GEM}>{parts.gem}</Box>
            <Box width={columns.name}>
              <Button key={`cast-${node.name}`} label={name} plain dimColor={!isLearned || isSealed} onPress={() => cast(node.name)} />
            </Box>
            <Box width={STARS}>{parts.stars}</Box>
            {columns.hasBar && (
              <Box width={BAR}>
                <Text>
                  {parts.filled}
                  {parts.empty}
                </Text>
              </Box>
            )}
            <Box width={COUNT} justifyContent="flex-end">
              {parts.count}
            </Box>
            {columns.hasSource && (
              <Box width={SOURCE} justifyContent="flex-end">
                {parts.source}
              </Box>
            )}
          </Box>,
        )
      }
      case 'sealed':
        return item(
          index,
          <Box flexDirection="row" height={1}>
            <Button
              key="skills-sealed"
              label={`░ ${row.count} sealed ${row.count === 1 ? 'skill' : 'skills'} ${row.isOpen ? '▾' : '▸'}`}
              plain
              dimColor
              onPress={toggleSealed}
            />
          </Box>,
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
