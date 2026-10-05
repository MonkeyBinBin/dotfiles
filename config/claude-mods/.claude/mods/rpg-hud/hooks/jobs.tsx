import type { ElementTable } from 'claude-code'

import type { Job, JobStatus } from '../types'
import { formatElapsed, oneLine } from './util'
import type { Item } from './window'

// Finished jobs kept beside the running ones, newest first.
export const KEPT_JOBS = 30
// Two text rows, then a blank row.
const CARD_ROWS = 3

// One background task's end as a notification reports it: `<task-notification>` blocks carrying the task's id,
// the call that started it, its status and a summary naming a shell's exit code: `completed (exit code 0)`,
// `failed with exit code 3`.
export type JobEnd = { id: string; toolUseId?: string; status: Exclude<JobStatus, 'run' | 'done'>; exitCode?: number }

const tag = (block: string, name: string): string | undefined =>
  new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block)?.[1]?.trim()

// Every task end a prompt's text reports. A block with no final status (a monitor's event) ends nothing.
export const parseJobEnds = (text: string): JobEnd[] =>
  [...text.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)].flatMap(([, block = '']) => {
    const id = tag(block, 'task-id')
    const raw = tag(block, 'status')
    if (id === undefined || raw === undefined) return []
    // The last one: the summary quotes the job's description first, which may say `exit code` itself.
    const code = [...(tag(block, 'summary') ?? '').matchAll(/exit code (-?\d+)/g)].at(-1)?.[1]
    const exitCode = code === undefined ? undefined : Number(code)
    const status: JobEnd['status'] | undefined =
      raw === 'completed' ? (exitCode !== undefined && exitCode !== 0 ? 'err' : 'ok') : raw === 'failed' ? 'err' : raw === 'killed' || raw === 'stopped' ? 'kill' : undefined
    if (status === undefined) return []
    const toolUseId = tag(block, 'tool-use-id')
    return [{ id, status, ...(toolUseId === undefined ? {} : { toolUseId }), ...(exitCode === undefined ? {} : { exitCode }) }]
  })

// Adds `job` at the end, keeping every running job and the latest finished ones.
export const addJob = (list: readonly Job[], job: Job): Job[] => trimJobs([...list.filter(one => one.id !== job.id), job])

export const trimJobs = (list: readonly Job[]): Job[] => {
  const finished = list.filter(job => job.status !== 'run')
  const dropped = new Set(finished.slice(0, Math.max(0, finished.length - KEPT_JOBS)))
  return list.filter(job => !dropped.has(job))
}

// Ends the jobs `end` names. A notification may come after the engine's list dropped the job (`done`), and
// then says how it ended; a job already ended for certain stays as it was.
export const endJob = (list: readonly Job[], end: JobEnd, now: number): Job[] =>
  list.map(job => {
    // A job met only in the engine's list has no call id (''), so an empty one names nothing.
    const isNamed = job.id === end.id || (end.toolUseId !== undefined && end.toolUseId !== '' && job.toolUseId === end.toolUseId)
    if (!isNamed || (job.status !== 'run' && job.status !== 'done')) return job
    return { ...job, status: end.status, endedAt: job.endedAt ?? now, ...(end.exitCode === undefined ? {} : { exitCode: end.exitCode }) }
  })

// The engine's list of background work when a turn stops: a running job it no longer names ended unseen (its
// notification may still come and say how), one marked so that it names again runs on (it was missed from an
// earlier list, or started while that list was taken), and a shell or monitor it names that the HUD never saw
// start (begun before a reload) joins.
export const reconcileJobs = (
  list: readonly Job[],
  inFlight: readonly { id: string; type: string; description: string; command?: string }[],
  now: number,
): Job[] => {
  const live = new Set(inFlight.map(task => task.id))
  const known = new Set(list.map(job => job.id))
  const checked = list.map((job): Job => {
    if (job.status === 'run' && !live.has(job.id)) return { ...job, status: 'done', endedAt: now }
    if (job.status === 'done' && live.has(job.id)) {
      const { endedAt: _, ...running } = job
      return { ...running, status: 'run' }
    }
    return job
  })
  const met = inFlight
    .filter(task => !known.has(task.id) && (task.type === 'shell' || task.type === 'monitor'))
    .map((task): Job => ({
      id: task.id,
      toolUseId: '',
      kind: task.type === 'monitor' ? 'monitor' : 'shell',
      command: task.command ?? '',
      description: task.description,
      startedAt: now,
      status: 'run',
    }))
  return trimJobs([...checked, ...met])
}

// Running jobs first, then the finished, each newest first.
export const jobOrder = (list: readonly Job[]): Job[] => {
  const newestFirst = list.slice().reverse()
  return [...newestFirst.filter(job => job.status === 'run'), ...newestFirst.filter(job => job.status !== 'run')]
}

export const jobsSubtitle = (list: readonly Job[]): string => {
  const running = list.filter(job => job.status === 'run').length
  const failed = list.filter(job => job.status === 'err').length
  return `${running} running${failed > 0 ? ` · ${failed} failed` : ''} · ${list.length} in all`
}

export const jobState = (job: Job, now: number): { text: string; color: string } => {
  const elapsed = formatElapsed((job.endedAt ?? now) - job.startedAt)
  switch (job.status) {
    case 'run':
      return { text: `▶ ${elapsed}`, color: 'yellow' }
    case 'ok':
      return { text: `✓ ${elapsed}`, color: 'green' }
    case 'err':
      return { text: `✗ ${job.exitCode === undefined ? 'failed' : `exit ${job.exitCode}`} · ${elapsed}`, color: 'red' }
    case 'kill':
      return { text: `■ stopped · ${elapsed}`, color: 'gray' }
    case 'done':
      return { text: `· ended ${elapsed}`, color: 'gray' }
  }
}

// What a running job's stop button says, before and after its first press; the widest and the gap before it.
const STOP_LABEL = '■ stop'
const ARMED_LABEL = '■ sure?'
const STOP_ROOM = ARMED_LABEL.length + 1

// `onStop`, given, puts a stop button on each running job; `armed` names the one that asks to be pressed again.
export function jobItems(
  ui: ElementTable,
  list: readonly Job[],
  now: number,
  width: number,
  onStop?: (job: Job) => void,
  armed?: string | null,
): Item[] {
  const { Box, Button, Text } = ui
  if (list.length === 0) {
    return [{ key: 'empty', rows: 1, node: <Text dimColor>No background jobs. Shells and monitors sent to the background show here.</Text> }]
  }
  return jobOrder(list).map(job => {
    const state = jobState(job, now)
    const isRunning = job.status === 'run'
    const icon = job.kind === 'monitor' ? '◉' : '⚙'
    const title = job.description || job.command
    const canStop = isRunning && onStop !== undefined
    return {
      key: job.id,
      rows: CARD_ROWS,
      node: (
        <Box flexDirection="column" height={CARD_ROWS}>
          <Box height={1}>
            <Box flexGrow={1}>
              <Text wrap="truncate" dimColor={!isRunning}>
                <Text color={isRunning ? 'cyan' : undefined}>{icon} </Text>
                <Text bold={isRunning}>{oneLine(title, width - state.text.length - 3 - (canStop ? STOP_ROOM : 0))}</Text>
              </Text>
            </Box>
            <Text color={state.color}>{state.text}</Text>
            {canStop && <Text> </Text>}
            {canStop && <Button key={`job-stop-${job.id}`} label={armed === job.id ? ARMED_LABEL : STOP_LABEL} plain onPress={() => onStop(job)} />}
          </Box>
          <Text dimColor wrap="truncate">
            {oneLine(`$ ${job.command}`, width - (job.agentId === undefined ? 0 : 6))}
            {job.agentId !== undefined && ' · pet'}
          </Text>
        </Box>
      ),
    }
  })
}
