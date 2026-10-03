import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SkillNames } from '../types'
import { hotkeyOf, labelOf } from './hotbar-client'
import type { HotbarProps, HotbarSlot } from './hotbar-client'
import { colorFor, toHex } from './colors'

const skills = atom({ plugin: 'skill-bar', key: 'skills' } as const, [] as SkillNames)

// Project skills only: the folders under .claude/skills that hold a SKILL.md.
export async function listProjectSkills($: EngineInterface): Promise<string[]> {
  const root = `${await $.session.cwd()}/.claude/skills`
  if (!(await $.fs.exists(root))) return []
  const entries = await $.fs.list(root)
  const found: string[] = []
  for (const entry of entries) {
    if (entry.kind !== 'dir') continue
    if (await $.fs.exists(`${root}/${entry.name}/SKILL.md`)) found.push(entry.name)
  }
  return found.sort((a, b) => a.localeCompare(b))
}

// The most used skills that get a slot beside the project's own.
export const FAVORITES = 4

// The slots: the project's skills, then the skills cast most (rpg-hud's lifetime count) that the session still
// has and the project does not already hold, most used first.
export const slotsFor = (project: readonly string[], uses: Readonly<Record<string, number>>, known: readonly string[]): string[] => {
  const favorites = Object.entries(uses)
    .filter(([name, count]) => count > 0 && known.includes(name) && !project.includes(name))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, FAVORITES)
    .map(([name]) => name)
  return [...project, ...favorites]
}

// rpg-hud's skill counts and the session's skills, when that mod runs; nothing otherwise. Read while drawing, so
// a cast there redraws the slots here. Another plugin's state is read-only, and typed by its own contract.
async function readFavorites($: EngineInterface) {
  const [progress, loadout] = await Promise.all([
    $.state.get({ plugin: 'rpg-hud', key: 'progress' } as never).catch(() => undefined),
    $.state.get({ plugin: 'rpg-hud', key: 'loadout' } as never).catch(() => undefined),
  ])
  const uses = (progress?.value as { skillUses?: Record<string, number> } | undefined)?.skillUses ?? {}
  const known = ((loadout?.value as { skills?: { name: string }[] } | undefined)?.skills ?? []).map(skill => skill.name)
  return { uses, known }
}

// One hotbar slot in its own colour; a favourite is a skill picked up elsewhere and used often.
export const hotbarSlot = (name: string, slot: number, uses: number, isFavorite: boolean): HotbarSlot => ({
  name,
  label: labelOf(name),
  color: toHex(colorFor(slot)),
  uses,
  isFavorite,
})

// Pressing a slot puts the command in the prompt box, so arguments (an issue number) can follow.
export const commandText = (skill: string): string => `/${skill} `

async function refresh($: EngineInterface) {
  const found = await listProjectSkills($).catch(() => [] as string[])
  await update($, skills, () => found)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  // A /clear starts a new session without session.start; refill the slots for it.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear') await refresh($)
    return next(e)
  })

  // A new or removed skill folder shows up after the next turn.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await refresh($)
    return next(e)
  })

  // The hotbar Client posts `{ cast }` when a slot is clicked or its number key pressed.
  on('ui.message', async ($, e, next) => {
    const data = (e.data ?? {}) as { cast?: unknown }
    if (e.element !== 'hotbar' || typeof data.cast !== 'string') return next(e)
    await $.prompt.fill({ text: commandText(data.cast) })
    return {}
  })

  // Under the prompt: the engine's hint line first, the item slots below it.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const engine = await next(e)
    const favorites = await readFavorites($)
    const project = await read($, skills)
    const names = slotsFor(project, favorites.uses, favorites.known)
    if (names.length === 0) return engine

    const slots = names.map((name, slot) => hotbarSlot(name, slot, favorites.uses[name] ?? 0, !project.includes(name)))
    const { Box, Button } = $.ui.resolve(e)

    // The terminal draws a game's hotbar: framed slots, a click anywhere on one casts it, the number keys too.
    if (e.surface === 'terminal') {
      const { Client } = $.ui.resolve(e)
      const hotbar = { slots } satisfies HotbarProps
      return (
        <Box flexDirection="column">
          {engine}
          <Box marginTop={1}>
            <Client key="hotbar" module="./hotbar-client.tsx" props={hotbar} width="100%" />
          </Box>
        </Box>
      )
    }

    // Other surfaces: a button a slot, numbered as the hotbar's keys are.
    return (
      <Box flexDirection="column">
        {engine}
        <Box flexDirection="row" flexWrap="wrap" columnGap={2} marginY={1}>
          {slots.map((one, slot) => (
            <Button
              key={one.name}
              label={`${hotkeyOf(slot) ?? '·'} ${one.isFavorite ? '★' : ''}${one.label}`}
              plain
              dimColor
              onPress={() => void $.prompt.fill({ text: commandText(one.name) })}
            />
          ))}
        </Box>
      </Box>
    )
  })
}
