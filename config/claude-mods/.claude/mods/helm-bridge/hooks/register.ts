import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Live, Sos } from '../types'

// Tells the Herdr app's sub interface what it can't see from outside, as labels on this terminal (mods/sub/state.js reads them):
//   cc.sos=<tool: short target>   why the session is waiting on the person
//   cc.op=<kind>                  the kind of work it's on this turn
//   cc.o2=<percent>               context window used, in steps of five
//   cc.fuel=<percent>             the fullest rate-limit window, in steps of five
//   cc.hull=<count>               main loop tool calls failed in a row
// helm-spinner reads the same from this mod's state. Does nothing outside a Herdr app terminal. A failed label is dropped: a
// display must never get in Claude's way.

const MAX = 48
const STEP = 5
const KEYS = ['cc.sos', 'cc.op', 'cc.o2', 'cc.fuel', 'cc.hull'] as const
const sos = atom({ plugin: 'helm-bridge', key: 'sos' } as const, null as Sos | null)
const IDLE: Live = { op: '', hull: 0, o2: 0, fuel: 0 }
const live = atom({ plugin: 'helm-bridge', key: 'live' } as const, IDLE)

// The kind of work a tool call is.
export function kindOf(tool: string): string {
  if (['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(tool)) return 'edit'
  if (tool === 'Bash') return 'bash'
  if (['Read', 'Grep', 'Glob'].includes(tool)) return 'read'
  if (['WebFetch', 'WebSearch'].includes(tool)) return 'web'
  if (['Agent', 'Task'].includes(tool)) return 'agent'
  return 'gear'
}

export const stepOf = (percent: number) => Math.floor(percent / STEP) * STEP

// A label is visible to everything that lists terminals, so it carries the shape of the request, never a whole command:
// the program and its subcommand, a file's name, a URL's host.
export function sosReason(tool: string, input: unknown): string {
  const fields = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const text = (key: string) => (typeof fields[key] === 'string' ? (fields[key] as string) : '')
  const mcp = /^mcp__(.+?)__(.+)$/.exec(tool)
  const name = mcp ? `${mcp[1]}:${mcp[2]}` : tool

  let target = ''
  if (tool === 'Bash') {
    const words = text('command').trim().split(/\s+/)
    target = words.slice(0, 2).filter(w => /^[\w.-]+$/.test(w)).join(' ')
    if (words.length > 0 && !/^[\w.-]+$/.test(words[0]!)) target = ''
  } else if (text('file_path') || text('notebook_path')) {
    target = (text('file_path') || text('notebook_path')).split('/').pop() ?? ''
  } else if (tool === 'WebFetch') {
    target = /^\w+:\/\/([^/?#]+)/.exec(text('url'))?.[1]?.replace(/^.*@/, '') ?? ''
  }

  const reason = target ? `${name}: ${target}` : name
  // eslint-disable-next-line no-control-regex
  return reason.replace(/[\u0000-\u001f\u007f-\u009f=]/g, ' ').slice(0, MAX)
}

// undefined until read; null outside Herdr.
let terminal: string | null | undefined
let waiting: { tool: string; agent: string | undefined } | undefined
const sent = new Map<string, string>()

async function terminalOf($: EngineInterface) {
  if (terminal === undefined) terminal = (await $.env.get('HC_TERMINAL_ID').catch(() => undefined)) || null
  return terminal
}

// Only what changed, in one call.
async function publish($: EngineInterface, labels: Record<string, string>) {
  const at = await terminalOf($)
  if (!at) return
  const changed = Object.entries(labels).filter(([key, value]) => (sent.get(key) ?? '') !== value)
  if (changed.length === 0) return
  for (const [key, value] of changed) sent.set(key, value)
  await $.process
    .run(['hc', 'label', at, ...changed.map(([key, value]) => `${key}=${value}`)], { timeoutMs: 2000 })
    .catch(() => undefined)
}

const numeric = (value: number) => (value > 0 ? String(value) : '')

async function setLive($: EngineInterface, change: (state: Live) => Live) {
  if (!(await terminalOf($))) return
  const state = change(await read($, live))
  await update($, live, () => state).catch(() => undefined)
  await publish($, {
    'cc.op': state.op,
    'cc.o2': numeric(stepOf(state.o2)),
    'cc.fuel': numeric(stepOf(state.fuel)),
    'cc.hull': numeric(state.hull),
  })
}

async function measure($: EngineInterface) {
  const usage = await $.session.usage().catch(() => undefined)
  if (!usage) return
  const fuel = Math.max(0, ...usage.rateLimits.map(window => window.percentUsed))
  await setLive($, state => ({ ...state, o2: usage.context.percent ?? 0, fuel }))
}

async function raise($: EngineInterface, tool: string, agent: string | undefined, reason: string) {
  if (!(await terminalOf($))) return
  waiting = { tool, agent }
  const since = await $.clock.now()
  await update($, sos, () => ({ reason, since })).catch(() => undefined)
  await publish($, { 'cc.sos': reason })
}

async function clear($: EngineInterface) {
  if (!waiting) return
  waiting = undefined
  await update($, sos, () => null).catch(() => undefined)
  await publish($, { 'cc.sos': '' })
}

// A reload or a crash can leave labels behind; `sent` starts empty, so name them all.
async function clearAll($: EngineInterface) {
  const at = await terminalOf($)
  if (!at) return
  sent.clear()
  await update($, sos, () => null).catch(() => undefined)
  await update($, live, () => IDLE).catch(() => undefined)
  await $.process.run(['hc', 'label', at, ...KEYS.map(key => `${key}=`)], { timeoutMs: 2000 }).catch(() => undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await clearAll($)
    await measure($)
    return result
  })

  on('session.end', async ($, e, next) => {
    await clearAll($)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    await measure($)
    return result
  })

  // Asked with nothing beneath deciding: the prompt is about to wait on the person.
  on('classic.PermissionRequest', async ($, e, next) => {
    const result = await next(e)
    if (result.decision === undefined) await raise($, e.tool_name, e.agent_id, sosReason(e.tool_name, e.tool_input))
    return result
  })

  // A prompted tool has been answered once its call is over; a question waits for as long as the call runs.
  on('tool.call', async ($, e, next) => {
    const isMain = e.agentId === undefined
    if (isMain) await setLive($, state => ({ ...state, op: kindOf(e.tool) }))
    if (e.tool === 'AskUserQuestion') await raise($, e.tool, e.agentId, 'Question')
    try {
      const ran = await next(e)
      if (isMain) await setLive($, state => ({ ...state, hull: ran.isError === true ? state.hull + 1 : 0 }))
      return ran
    } finally {
      if (waiting?.tool === e.tool && waiting.agent === e.agentId) await clear($)
    }
  })

  // The person typed, or the turn ended on a refusal or an interrupt: nothing of this turn's is still waiting.
  on('prompt.submit', async ($, e, next) => {
    await clear($)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await setLive($, state => ({ ...state, op: '', hull: 0 }))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (waiting && waiting.agent === undefined) await clear($)
    await setLive($, state => ({ ...state, op: '' }))
    return result
  })
}
