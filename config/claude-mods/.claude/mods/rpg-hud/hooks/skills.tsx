import type { ElementTable } from 'claude-code'

import type { Loadout, Progress, SkillSlot } from '../types'
import type { SkillCardProps } from './skill-card-client'
import { ART_ROWS, cardArt } from './skill-icons'
import type { ArtTier } from './skill-icons'
import type { Item } from './window'

type CardClient = ElementTable<'terminal'>['Client']

// Uses to reach each mastery star.
const MASTERY = [1, 3, 10] as const
// A skill cast this long ago still glows.
export const GLOW_MS = 5 * 60 * 1000

export const masteryStars = (uses: number): string => MASTERY.map(at => (uses >= at ? '★' : '☆')).join('')

// Mastery tiers, highest first: a skill climbs as it is cast.
export type Tier = 'master' | 'adept' | 'novice' | 'untried'
const TIERS: readonly { tier: Tier; at: number; color: string; icon: string }[] = [
  { tier: 'master', at: MASTERY[2], color: 'yellow', icon: '◆' },
  { tier: 'adept', at: MASTERY[1], color: 'cyan', icon: '◈' },
  { tier: 'novice', at: MASTERY[0], color: 'green', icon: '◇' },
  { tier: 'untried', at: 0, color: 'gray', icon: '·' },
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

// Where a skill comes from, under its name on the card: its plugin, or whose settings hold it. Two skills of one
// name tell apart by it.
export const sourceOf = (slot: SkillSlot): string => slot.plugin ?? SOURCES[slot.source] ?? slot.source

export const skillsSubtitle = (loadout: Loadout, progress: Progress): string => {
  const learned = loadout.skills.filter(slot => (progress.skillUses[slot.name] ?? 0) > 0).length
  return `${learned}/${loadout.skills.length} learned · a card casts`
}

// One skill card.
export type SkillNode = { name: string; source: string; uses: number; isGlowing: boolean }

// One row of the skills page.
export type SkillRow =
  | { kind: 'cards'; nodes: SkillNode[]; cardWidth: number; isSealed: boolean }
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
  // The window's inner width, the room a row of cards deals into.
  width: number
  // Whether the skills never cast, beyond the person's own, are shown.
  isSealedOpen: boolean
  // Whether the cards are pictures (a terminal's Client draws them) or text.
  isPicture: boolean
}

// A text card: its frame and a column of padding each side around the name and its tier's mark, as wide as the
// longest name or source shown within these bounds. A picture card: its frame around the art and the name under
// it, as wide as the longest name, its source cut to fit beside its stars. Every card is as wide as the others.
const CARD_CHROME = 4
const MARK = 2
const TEXT_CARD_WIDTH = { min: 14, max: 22 }
const PICTURE_CHROME = 2
const PICTURE_CARD_WIDTH = { min: 12, max: 16 }
// The picture card's rows: its frame, the art, its name, then its stars and source.
const PICTURE_CARD_ROWS = 2 + ART_ROWS + 2
const TEXT_CARD_ROWS = 5
const CARD_GAP = 1

// A plugin's skill without its plugin's name, which the card's source line carries: `superpowers:brainstorming`
// reads `brainstorming`.
export const shortName = (name: string): string => name.slice(name.lastIndexOf(':') + 1)

export const cardWidthFor = (nodes: readonly SkillNode[], width: number, isPicture: boolean): number => {
  const names = nodes.map(node => shortName(node.name).length)
  const longest = Math.max(0, ...(isPicture ? names : [...names, ...nodes.map(node => node.source.length)]))
  const [bounds, chrome] = isPicture ? [PICTURE_CARD_WIDTH, PICTURE_CHROME] : [TEXT_CARD_WIDTH, CARD_CHROME]
  const wanted = Math.min(bounds.max, Math.max(bounds.min, longest + chrome))
  return Math.max(CARD_CHROME + MARK + 1, Math.min(wanted, width))
}

// Cards dealt into rows no wider than `width`, each row holding one at least.
export const packCards = (nodes: readonly SkillNode[], width: number, cardWidth: number): SkillNode[][] => {
  const perRow = Math.max(1, Math.floor((width + CARD_GAP) / (cardWidth + CARD_GAP)))
  const rows: SkillNode[][] = []
  for (let at = 0; at < nodes.length; at += perRow) rows.push(nodes.slice(at, at + perRow))
  return rows
}

// The casts that earn a skill its next star; a master has none to go.
export const nextStar = (uses: number): number | undefined => MASTERY.find(at => uses < at)

const byUse = (a: SkillNode, b: SkillNode) => b.uses - a.uses || shortName(a.name).localeCompare(shortName(b.name))

// The collection: one grid of cards, the most cast first, each coloured by its tier. The skills cast, and the
// person's own, are in it; the rest are sealed below, dealt when opened.
// Then the MCP servers as equipment.
export function skillRows(data: SkillsData): SkillRow[] {
  const { loadout, progress, casts, now, width, isSealedOpen, isPicture } = data
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
  const cardWidth = cardWidthFor(isSealedOpen ? [...owned, ...sealed] : owned, width, isPicture)
  const deal = (list: SkillNode[], isSealed: boolean) => {
    for (const packed of packCards([...list].sort(byUse), width, cardWidth)) {
      rows.push({ kind: 'cards', nodes: packed, cardWidth, isSealed })
    }
  }
  if (loadout.skills.length > 0 && !owned.some(node => node.uses > 0)) {
    rows.push({ kind: 'note', text: 'Cast a skill to learn it: its card turns green, blue, then gold at ★★★.' })
  }
  deal(owned, false)
  if (sealed.length > 0) {
    rows.push({ kind: 'gap' }, { kind: 'sealed', count: sealed.length, isOpen: isSealedOpen })
    if (isSealedOpen) deal(sealed, true)
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

// A bar of `width` toward the next star, and `4/10` after it; a master's is full, and says so.
const progressBar = (uses: number, width: number): { filled: number; empty: number; label: string } => {
  const next = nextStar(uses)
  const label = next === undefined ? 'MAX' : `${uses}/${next}`
  const room = Math.max(1, width - label.length - 1)
  const filled = next === undefined ? room : Math.floor((room * uses) / next)
  return { filled, empty: room - filled, label }
}

// One skill card: a frame in its tier's colour around its mark and name, its source, and its stars with a bar
// toward the next. On the terminal a Client draws it, so the whole card is one target a click casts; elsewhere,
// where a Client is not drawn, the name is a button.
function skillCard(ui: ElementTable, node: SkillNode, cardWidth: number, isSealed: boolean, Client: CardClient | undefined, cast: () => void) {
  const { Box, Button, Text } = ui
  const { color, icon } = styleOf(tierOf(node.uses))
  const isLearned = node.uses > 0
  const inner = cardWidth - CARD_CHROME
  const bar = progressBar(node.uses, inner - 4)
  const label = fit(shortName(node.name), inner - MARK)
  const source = fit(node.source, inner - MARK)
  const mark = node.isGlowing ? '✦' : icon
  if (Client !== undefined) {
    // The art fills the row inside the frame; the lines under it centre in it.
    const artWidth = cardWidth - PICTURE_CHROME
    const tier: ArtTier = isSealed ? 'sealed' : tierOf(node.uses)
    const props: SkillCardProps = {
      name: node.name,
      width: cardWidth,
      height: PICTURE_CARD_ROWS,
      scope: `skill-card-${node.name}`.slice(0, 64),
      color,
      isLearned,
      isGlowing: node.isGlowing,
      art: cardArt(node.name, tier, artWidth, node.isGlowing),
      label: fit(shortName(node.name), artWidth),
      stars: masteryStars(node.uses),
      // Beside the stars and a space; the person's own skills, which no other of theirs can share a name with, show
      // none, so a plugin's skill of the same name is told apart by its source.
      source: node.source === 'personal' ? '' : fit(node.source, artWidth - 4),
    }
    return (
      <Client key={`skill-card:${node.name}`} module="./skill-card-client.tsx" props={props} width={cardWidth} height={PICTURE_CARD_ROWS} />
    )
  }
  const isMax = bar.label === 'MAX'
  return (
    <Box
      key={`card-${node.name}`}
      flexDirection="column"
      width={cardWidth}
      height={TEXT_CARD_ROWS}
      paddingX={1}
      borderStyle="round"
      borderColor={node.isGlowing ? 'yellow' : color}
      borderDimColor={!isLearned}
    >
      <Box flexDirection="row">
        <Text color={node.isGlowing ? 'yellow' : color} bold={node.isGlowing} dimColor={isSealed}>
          {mark}{' '}
        </Text>
        <Button key={`cast-${node.name}`} label={label} plain dimColor={!isLearned} onPress={cast} />
      </Box>
      <Text dimColor wrap="truncate">
        {'  '}
        {source}
      </Text>
      <Text wrap="truncate">
        <Text color="yellow" dimColor={!isLearned}>
          {masteryStars(node.uses)}{' '}
        </Text>
        <Text color={color}>{'▰'.repeat(bar.filled)}</Text>
        <Text dimColor>{'▱'.repeat(bar.empty)}</Text>
        <Text dimColor={!isMax} {...(isMax ? { color: 'yellow', bold: true } : {})}>
          {' '}
          {bar.label}
        </Text>
      </Text>
    </Box>
  )
}

// The skills page: the skills as cards framed in their tier's colour, each with its name (which
// fills the prompt), its source, its stars and a bar toward the next; the sealed skills behind a toggle; then the
// MCP servers.
export function skillItems(
  ui: ElementTable,
  rows: readonly SkillRow[],
  width: number,
  Client: CardClient | undefined,
  cast: (name: string) => void,
  toggleSealed: () => void,
): Item[] {
  const { Box, Button, Text } = ui
  const item = (index: number, node: Item['node'], rows = 1): Item => ({ key: `skill-row-${index}`, rows, node })
  return rows.map((row, index) => {
    switch (row.kind) {
      case 'cards':
        return item(
          index,
          <Box flexDirection="row" gap={CARD_GAP} height={Client === undefined ? TEXT_CARD_ROWS : PICTURE_CARD_ROWS}>
            {row.nodes.map(node => skillCard(ui, node, row.cardWidth, row.isSealed, Client, () => cast(node.name)))}
          </Box>,
          Client === undefined ? TEXT_CARD_ROWS : PICTURE_CARD_ROWS,
        )
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
