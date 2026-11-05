import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Live, Sos } from '../types'

// Tells the Herdr app's sub interface what it can't see from outside, as labels on this terminal (mods/sub/state.js reads them):
//   cc.sos=<tool: short target>   why the session is waiting on the person
//   cc.op=<kind>                  the kind of work it's on this turn
//   cc.o2=<percent>               context window used, in steps of five
//   cc.fuel=<percent>             the fullest rate-limit window, in steps of five
//   cc.hull=<count>               main loop tool calls failed in a row
// helm-spinner reads the same from this mod's state. Does nothing outside a Herdr app terminal. All of it runs in a queue no
// tool or prompt waits on, and a failed label is dropped: a display must never get in Claude's way.

const MAX = 48
const STEP = 5
const KEYS = ['cc.sos', 'cc.op', 'cc.o2', 'cc.fuel', 'cc.hull'] as const
const sos = atom({ plugin: 'helm-bridge', key: 'sos' } as const, null as Sos | null)
const IDLE: Live = { op: '', hull: 0, o2: 0, fuel: 0 }
const live = atom({ plugin: 'helm-bridge', key: 'live' } as const, IDLE)
// The programs whose second word names a subcommand. Anyone else's could be a password or a token.
const SUBCOMMANDS = new Set(['git', 'gh', 'npm', 'pnpm', 'yarn', 'bun', 'docker', 'kubectl', 'brew', 'cargo'])

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
// the program, a well-known one's subcommand, a file's name, a URL's host.
export function sosReason(tool: string, input: unknown): string {
  const fields = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const text = (key: string) => (typeof fields[key] === 'string' ? (fields[key] as string) : '')
  const mcp = /^mcp__(.+?)__(.+)$/.exec(tool)
  const name = mcp ? `${mcp[1]}:${mcp[2]}` : tool

  let target = ''
  if (tool === 'Bash') {
    const [program = '', second = ''] = text('command').trim().split(/\s+/)
    if (/^[\w.-]+$/.test(program)) target = SUBCOMMANDS.has(program) && /^[a-z][a-z-]*$/.test(second) ? `${program} ${second}` : program
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
// What's waiting on the person, oldest first. `id` is the call's, unless the prompt came with no call under way to pin it on.
type Wait = { id: string | undefined; tool: string; agent: string | undefined; reason: string; since?: number }
let waits: Wait[] = []
// Every label's value as it should be, and as Herdr last took it: what a failed write leaves apart is sent again with the next.
const UNKNOWN = '\0'
const wanted = new Map<string, string>()
const sent = new Map<string, string>()
const calls = new Map<string, { tool: string; agent: string | undefined; args: Record<string, unknown> }>() // the calls under way, by tool_use_id
let queue: Promise<unknown> = Promise.resolve()

// One at a time, in the order the events came: an update reads what the last one wrote, and labels land in order.
function show(work: () => Promise<unknown>) {
  queue = queue.then(work).catch(() => undefined)
  return queue
}

async function terminalOf($: EngineInterface) {
  if (terminal === undefined) terminal = (await $.env.get('HC_TERMINAL_ID').catch(() => undefined)) || null
  return terminal
}

// Only what changed, in one call.
async function publish($: EngineInterface, labels: Record<string, string>) {
  const at = await terminalOf($)
  if (!at) return
  for (const [key, value] of Object.entries(labels)) wanted.set(key, value)
  const changed = [...wanted].filter(([key, value]) => (sent.get(key) ?? '') !== value)
  if (changed.length === 0) return
  const ran = await $.process
    .run(['hc', 'label', at, ...changed.map(([key, value]) => `${key}=${value}`)], { timeoutMs: 2000 })
    .catch(() => undefined)
  for (const [key, value] of changed) sent.set(key, ran?.exitCode === 0 ? value : UNKNOWN)
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

async function showSos($: EngineInterface) {
  if (!(await terminalOf($))) return
  const first = waits[0]
  if (first) first.since ??= await $.clock.now()
  const value = first ? { reason: first.reason, since: first.since! } : null
  await update($, sos, () => value).catch(() => undefined)
  await publish($, { 'cc.sos': first?.reason ?? '' })
}

const isSameLoop = (one: { tool: string; agent: string | undefined }, other: { tool: string; agent: string | undefined }) =>
  one.tool === other.tool && one.agent === other.agent

// The call a prompt is about, though it doesn't name one: of those of its tool with no prompt yet, the one with these arguments.
function callAsked(tool: string, agent: string | undefined, input: unknown) {
  const free = [...calls].filter(([id, call]) => isSameLoop(call, { tool, agent }) && !waits.some(wait => wait.id === id))
  const fields = Object.entries((typeof input === 'object' && input) || {})
  const same = free.find(([, call]) => fields.every(([key, value]) => JSON.stringify(call.args[key]) === JSON.stringify(value)))
  return (same ?? free[0])?.[0]
}

function settle($: EngineInterface, keep: (wait: Wait) => boolean) {
  const left = waits.filter(keep)
  if (left.length === waits.length) return
  waits = left
  void show(() => showSos($))
}

// A call's prompt, or one that came with no call under way to pin it on and could be this one's.
function answered($: EngineInterface, id: string, tool: string, agent: string | undefined) {
  const wait = waits.find(w => w.id === id) ?? waits.find(w => w.id === undefined && isSameLoop(w, { tool, agent }))
  settle($, w => w !== wait)
}

// A reload or a crash can leave labels behind; `sent` starts empty, so name them all.
async function clearAll($: EngineInterface) {
  if (!(await terminalOf($))) return
  waits = []
  for (const key of KEYS) sent.set(key, UNKNOWN)
  await update($, sos, () => null).catch(() => undefined)
  await update($, live, () => IDLE).catch(() => undefined)
  await publish($, Object.fromEntries(KEYS.map(key => [key, ''])))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    void show(async () => {
      await clearAll($)
      await measure($)
    })
    return result
  })

  // The last thing to run before the process goes, so it's waited for.
  on('session.end', async ($, e, next) => {
    await show(() => clearAll($))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    void show(() => measure($))
    return result
  })

  // Asked with nothing beneath deciding: the prompt is about to wait on the person.
  on('classic.PermissionRequest', async ($, e, next) => {
    const result = await next(e)
    if (result.decision === undefined) {
      const id = callAsked(e.tool_name, e.agent_id, e.tool_input)
      waits.push({ id, tool: e.tool_name, agent: e.agent_id, reason: sosReason(e.tool_name, e.tool_input) })
      void show(() => showSos($))
    }
    return result
  })

  // A prompted tool has been answered once its call is over; a question waits for as long as the call runs.
  on('tool.call', async ($, e, next) => {
    const isMain = e.agentId === undefined
    calls.set(e.tool_use_id, { tool: e.tool, agent: e.agentId, args: e as unknown as Record<string, unknown> })
    if (isMain) void show(() => setLive($, state => ({ ...state, op: kindOf(e.tool) })))
    if (e.tool === 'AskUserQuestion') {
      waits.push({ id: e.tool_use_id, tool: e.tool, agent: e.agentId, reason: 'Question' })
      void show(() => showSos($))
    }
    try {
      const ran = await next(e)
      if (isMain) void show(() => setLive($, state => ({ ...state, hull: ran.isError === true ? state.hull + 1 : 0 })))
      return ran
    } finally {
      calls.delete(e.tool_use_id)
      answered($, e.tool_use_id, e.tool, e.agentId)
    }
  })

  // No event says a prompt was answered, but the run-in-background pill only shows under a tool that's running.
  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    const call = calls.get(e.props.tool_use_id)
    if (call) answered($, e.props.tool_use_id, call.tool, call.agent)
    return next(e)
  })

  // The person typed, or the turn ended on a refusal or an interrupt: nothing of this turn's is still waiting.
  on('prompt.submit', async ($, e, next) => {
    settle($, () => false)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) void show(() => setLive($, state => ({ ...state, op: '', hull: 0 })))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      settle($, wait => wait.agent !== undefined)
      void show(() => setLive($, state => ({ ...state, op: '' })))
    }
    return result
  })
}
