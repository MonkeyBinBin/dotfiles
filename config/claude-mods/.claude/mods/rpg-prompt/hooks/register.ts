import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TurnTally } from '../types'

const turn = atom({ plugin: 'rpg-prompt', key: 'turn' } as const, null as TurnTally | null)

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

// What still needs the person, from rpg-hud's state when that mod runs.
export type Pending = { unpushed: number; jobs: number; agents: number; boss?: string }

// Another plugin's state is read-only, typed by its own contract. Read while drawing, so its writes redraw the footer.
async function readPending($: EngineInterface): Promise<Pending> {
  const [map, jobs, pets, boss] = await Promise.all([
    $.state.get({ plugin: 'rpg-hud', key: 'map' } as never).catch(() => undefined),
    $.state.get({ plugin: 'rpg-hud', key: 'jobs' } as never).catch(() => undefined),
    $.state.get({ plugin: 'rpg-hud', key: 'pets' } as never).catch(() => undefined),
    $.state.get({ plugin: 'rpg-hud', key: 'boss' } as never).catch(() => undefined),
  ])
  return {
    unpushed: (map?.value as { ahead?: number } | undefined)?.ahead ?? 0,
    jobs: ((jobs?.value as { status: string }[] | undefined) ?? []).filter(job => job.status === 'run').length,
    agents: ((pets?.value as { status: string }[] | undefined) ?? []).filter(pet => pet.status === 'run').length,
    boss: (boss?.value as { name?: string } | null | undefined)?.name,
  }
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

// Nothing pending, nothing shown: the footer stays as the engine has it.
export const pendingModes = (pending: Pending): string[] => {
  const modes: string[] = []
  if (pending.unpushed > 0) modes.push(`↑${pending.unpushed} unpushed`)
  if (pending.jobs > 0) modes.push(`⚙ ${plural(pending.jobs, 'job')}`)
  if (pending.agents > 0) modes.push(`◈ ${plural(pending.agents, 'agent')}`)
  if (pending.boss !== undefined) modes.push(`✗ ${pending.boss}`)
  return modes
}

export const tallyLine = (tally: TurnTally): string => {
  const parts = [plural(tally.calls, 'call')]
  if (tally.editedFiles.length > 0) parts.push(`${plural(tally.editedFiles.length, 'file')} edited`)
  if (tally.failed > 0) parts.push(`${tally.failed} failed`)
  return `${tally.isLive ? 'this turn' : 'last turn'}: ${parts.join(' · ')}`
}

// Typing leaves the line alone; a turn with no calls has nothing to sum up.
export const hintTail = (isDraft: boolean, tally: TurnTally | null): string | undefined =>
  isDraft || tally === null || tally.calls === 0 ? undefined : tallyLine(tally)

export const countCall = (tally: TurnTally, call: { path?: string; isFailed: boolean }): TurnTally => ({
  ...tally,
  calls: tally.calls + 1,
  editedFiles:
    call.path === undefined || tally.editedFiles.includes(call.path) ? tally.editedFiles : [...tally.editedFiles, call.path],
  failed: tally.failed + (call.isFailed ? 1 : 0),
})

const editedPath = (e: { tool: string }): string | undefined => {
  if (!EDIT_TOOLS.has(e.tool)) return undefined
  const input = e as { file_path?: unknown; notebook_path?: unknown }
  const path = input.file_path ?? input.notebook_path
  return typeof path === 'string' ? path : undefined
}

export const register: Register = on => {
  on('turn.start', async ($, e, next) => {
    await update($, turn, () => ({ calls: 0, editedFiles: [], failed: 0, isLive: true }))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await update($, turn, tally => (tally === null ? null : { ...tally, isLive: false }))
    return next(e)
  })

  // The main loop's calls only, as rpg-hud counts them.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined) return ran
    const isFailed = ran.deny !== undefined || ran.isError === true
    // The tally is a nicety: a failed write must never cost the call its answer.
    await update($, turn, tally => (tally === null ? tally : countCall(tally, { path: editedPath(e), isFailed }))).catch(
      () => undefined,
    )
    return ran
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const modes = pendingModes(await readPending($))
    if (modes.length === 0) return next(e)
    return next({ ...e, props: { ...e.props, modes: [...modes, ...e.props.modes] } })
  })

  // `tail` keeps the engine's line and its live pills; skill-bar's hotbar wraps that line, so both show.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const tail = hintTail(e.props.isDraft, await read($, turn))
    if (tail === undefined) return next(e)
    return next({ ...e, props: { ...e.props, tail } })
  })
}
