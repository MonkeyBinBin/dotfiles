import type { EngineInterface, Register } from 'claude-code'

// Emoji with default emoji presentation only: no VS16, so every terminal gives them two cells.
const ENDINGS: Record<string, string> = { completed: '✅', failed: '❌', killed: '🛑' }
const OTHER_ENDING = '📨'

export type TaskKind = 'shell' | 'agent' | 'remote'
const KIND_MARKS: Record<TaskKind, string> = { shell: '⚙', agent: '◈', remote: '☁' }

type Task = { id?: string; status?: string; type?: string; toolUseId?: string }
type Known = { jobs: { id: string; toolUseId: string }[]; pets: { id: string; agentId?: string }[] }

// rpg-hud's jobs and pets name the task when that mod runs; another plugin's state is read-only.
async function readKnown($: EngineInterface): Promise<Known> {
  const [jobs, pets] = await Promise.all([
    $.state.get({ plugin: 'rpg-hud', key: 'jobs' } as never).catch(() => undefined),
    $.state.get({ plugin: 'rpg-hud', key: 'pets' } as never).catch(() => undefined),
  ])
  return {
    jobs: (jobs?.value as Known['jobs'] | undefined) ?? [],
    pets: (pets?.value as Known['pets'] | undefined) ?? [],
  }
}

export const endingMark = (status: string | undefined): string =>
  (status === undefined ? undefined : ENDINGS[status]) ?? OTHER_ENDING

// A remote agent says so in `type`; a shell or a subagent leaves it out, so rpg-hud's lists tell them apart.
export const kindOf = (task: Task, known: Known): TaskKind | undefined => {
  if (task.type === 'remote_agent') return 'remote'
  const matches = (id: string | undefined, other: string | undefined) => id !== undefined && id === other
  if (known.jobs.some(job => matches(job.id, task.id) || matches(job.toolUseId, task.toolUseId))) return 'shell'
  if (known.pets.some(pet => matches(pet.agentId, task.id) || matches(pet.id, task.toolUseId))) return 'agent'
  return undefined
}

export const questPrefix = (task: Task, kind: TaskKind | undefined): string =>
  kind === undefined ? `${endingMark(task.status)} ` : `${endingMark(task.status)} ${KIND_MARKS[kind]} `

export const register: Register = on => {
  // The engine keeps its row and the duration after it; ctrl+o shows the notification untouched.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const task = e.props.task
    if (e.props.origin.kind !== 'task-notification' || task === undefined || e.props.isExpanded) return next(e)
    const prefix = questPrefix(task, kindOf(task, await readKnown($)))
    return next({ ...e, props: { ...e.props, text: prefix + e.props.text } })
  })
}
