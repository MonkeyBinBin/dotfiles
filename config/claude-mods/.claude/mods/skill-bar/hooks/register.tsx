import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SkillNames } from '../types'
import { ICON_ROWS, ICON_WIDTH, SCROLL, colorFor, composeIcon, toHex } from './icons'

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

  // Under the prompt: the engine's hint line first, the item slots below it.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const engine = await next(e)
    const names = await read($, skills)
    if (names.length === 0) return engine

    const { Box, Button } = $.ui.resolve(e)
    // Pixel icons are a terminal element; other surfaces get the buttons alone.
    const Raster = e.surface === 'terminal' ? $.ui.resolve(e).Raster : undefined
    const press = (skill: string) => () => void $.prompt.fill({ text: commandText(skill) })

    return (
      <Box flexDirection="column">
        {engine}
        <Box flexDirection="row" columnGap={2} marginY={1}>
          {names.map((skill, slot) => (
            <Box key={skill} flexDirection="row" columnGap={1}>
              {Raster ? (
                <Raster key={`icon-${skill}`} columns={ICON_WIDTH} rows={ICON_ROWS} cells={composeIcon(SCROLL, colorFor(slot))} />
              ) : null}
              <Button
                key={skill}
                label={skill}
                plain
                dimColor
                hover={{ color: toHex(colorFor(slot)) }}
                onPress={press(skill)}
              />
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
