import { expect, mock, test } from 'claude-code/testing'

import { closingPills, countEdit, endingOf, figuresOf } from './register'
import type { Tally } from './register'
import { ICON_ART } from './icons'
import { ALARM, clockOf, columnsOf, glowOf, MOTION, pillsOf, rowCells, ROWS, waveAt } from './wave'

const fresh = (): Tally => ({ files: new Set(), added: 0, removed: 0, costAtStart: 1 })
const CALM = { op: '', hull: 0, o2: 0, fuel: 0 }

const words = (pills: [string, string][][]) => pills.map(pill => pill.map(([text]) => text).join(''))

test('the closing line sums up files, lines and what the turn cost', () => {
  const tally = fresh()
  countEdit(tally, { file_path: '/a', old_string: 'x\ny', new_string: 'z' })
  countEdit(tally, { file_path: '/b', content: 'one\ntwo\nthree' })
  countEdit(tally, { file_path: '/a', edits: [{ old_string: 'q', new_string: 'r\ns' }] })
  expect(figuresOf(tally, 1.42)).toEqual({ files: 2, added: 6, removed: 3, spent: 1.42 - 1, ended: 'answer' })
  const pills = words(closingPills(252_000, figuresOf(tally, 1.42)))
  expect(pills[0]).toEndWith('4m 12s')
  expect(pills[1]).toEndWith('2')
  expect(pills[2]).toBe('+6 −3')
  expect(pills[3]).toBe('$0.42')
})

test('the line says how the turn ended', () => {
  const icons = ['answer', 'aborted', 'refusal', 'error', undefined].map(ended => endingOf(ended)[0])
  expect(new Set(icons).size).toBe(4)
  expect(icons[4]).toBe(icons[0])
})

test('a turn that did nothing shows only how long it took', () => {
  expect(closingPills(5000, figuresOf(fresh(), 1))).toHaveLength(1)
  expect(closingPills(5000, undefined)).toHaveLength(1)
})

test('the row is whole cells of what a Raster takes, and grows with its icons', () => {
  const busy = { op: 'bash', hull: 3, o2: 84, fuel: 40 }
  expect(atob(rowCells(MOTION.thinking, 3, 20_000, busy)).length).toBe(columnsOf(busy) * ROWS * 12)
  expect(columnsOf(busy)).toBeGreaterThan(columnsOf(CALM))
  const words = new Uint32Array(Uint8Array.from(atob(rowCells(ALARM, 3, 20_000, busy)), c => c.charCodeAt(0)).buffer)
  for (let i = 0; i < words.length; i += 3) expect(words[i]!).toBeLessThanOrEqual(0xffff)
})

test('the wave swings wide, and never repeats its shape from one moment to the next', () => {
  const shape = (tick: number) => Array.from({ length: 64 }, (_, x) => waveAt(MOTION['tool-use'], x, tick))
  expect(Math.max(...shape(40)) - Math.min(...shape(40))).toBeGreaterThanOrEqual(5)
  expect(new Set(Array.from({ length: 40 }, (_, tick) => shape(tick).join())).size).toBe(40)
})

test('pills for the work, warnings past the status line amber, critical at 90', () => {
  expect(pillsOf(CALM)).toEqual([])
  expect(pillsOf({ op: 'bash', hull: 3, o2: 84, fuel: 95 }).map(([icon, , isCritical]) => [icon, isCritical])).toEqual([['bash', false], ['o2', false], ['fuel', true], ['hull', true]])
})

test('a pill breathes, and flashes hard at critical', () => {
  const calm = Array.from({ length: 50 }, (_, tick) => glowOf(tick, false))
  expect(Math.min(...calm)).toBeGreaterThan(0.55)
  expect(new Set(Array.from({ length: 8 }, (_, tick) => glowOf(tick, true)))).toEqual(new Set([1, 0.45]))
})

test('the sub moves', () => {
  expect(ICON_ART.sub!.length).toBeGreaterThan(1)
  for (const frame of ICON_ART.sub!) expect(frame).toHaveLength(ROWS)
})

test('the clock reads seconds, minutes, then hours, and fits its room at the longest', () => {
  expect(clockOf(20_000)).toBe('20s')
  expect(clockOf(252_000)).toBe('4m 12s')
  expect(clockOf(3_725_000)).toBe('1h 02m')
  expect(clockOf(3_599_000).length).toBeLessThanOrEqual(7)
  expect(clockOf(43_500_000).length).toBeLessThanOrEqual(7)
})

test('the clock is a pill, an icon and the time on one ground, as wide as its text', () => {
  const cellsOf = (ms: number) => {
    const words = new Uint32Array(Uint8Array.from(atob(rowCells(MOTION.thinking, 3, ms, CALM)), c => c.charCodeAt(0)).buffer)
    const columns = columnsOf(CALM)
    const row = Array.from({ length: columns }, (_, x) => words.slice((columns + x) * 3, (columns + x + 1) * 3))
    return { codes: String.fromCodePoint(...row.map(cell => cell[0]!)), row }
  }
  for (const ms of [5000, 252_000, 43_500_000]) {
    const { codes, row } = cellsOf(ms)
    const start = codes.indexOf('\ue0b6'), end = codes.indexOf('\ue0b4')
    expect(codes.slice(start, end + 1)).toBe(`\ue0b6 \uf017  ${clockOf(ms)} \ue0b4`)
    for (const cell of row.slice(start + 1, end)) expect(cell[2]).toBe(0x173b42)
  }
})

const SPINNER = { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' as const }
const FRAME_MS = 120

test('a row outlasts a few refused blits, and goes once they keep coming', async ($, on) => {
  const clock = mock.clock(on)
  on('env.get', () => ({ value: 't9' }))
  let blits = 0
  let refuse = (_: number) => true
  on('ui.blit', async () => {
    blits += 1
    return { value: refuse(blits) ? { deny: 'not mounted' } : {} }
  })
  on('ui.render', { component: 'Spinner' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>{e.props.word}</Text>
  })
  await $.ui.mount({ plugin: 'helm-spinner', surface: 'terminal', component: 'Spinner', props: SPINNER })

  refuse = n => n <= 3
  await clock.advance(FRAME_MS * 12)
  expect(blits).toBeGreaterThanOrEqual(12)

  blits = 100
  refuse = () => true
  await clock.advance(FRAME_MS * 30)
  expect(blits).toBeLessThanOrEqual(108)
})

const textOf = async (line: { findAll: (query: { type: string }) => Promise<{ text: string }[]> }) =>
  (await line.findAll({ type: 'Text' })).map(found => found.text).join('')

test("the figures go to their turn's closing line, not an older one drawn meanwhile", async ($, on) => {
  on('env.get', () => ({ value: 't9' }))
  on('tool.call', () => ({ result: {} }))
  on('clock.now', () => ({ value: 1000 }))
  on('session.usage', () => ({ value: { context: {}, rateLimits: [], cost: { usd: 1 } } }) as never)
  on('turn.start', () => ({ turnId: 't' }))
  on('turn.complete', () => ({ text: '' }))
  const lineOf = (id: string, durationMs: number) =>
    $.ui.mount({ plugin: 'helm-spinner', surface: 'terminal', component: 'TurnDuration', requestId: id, props: { word: 'Baked', durationMs } })

  await $.turn.start({ text: 'go', turnId: 't' } as never)
  await $.tool.call({ tool: 'Write', file_path: '/a', content: 'x' })
  await $.turn.complete({ answer: '', durationMs: 90_000, isAborted: false, turnId: 't', reason: 'answer' } as never)

  expect(await textOf(await lineOf('old', 5000))).not.toContain('+1')
  expect(await textOf(await lineOf('new', 90_400))).toContain('+1')
})

test("a subagent's end isn't the turn's", async ($, on) => {
  on('env.get', () => ({ value: 't9' }))
  on('tool.call', () => ({ result: {} }))
  on('clock.now', () => ({ value: 1000 }))
  on('session.usage', () => ({ value: { context: {}, rateLimits: [], cost: { usd: 1 } } }) as never)
  on('turn.start', () => ({ turnId: 't' }))
  on('turn.complete', () => ({ text: '' }))

  await $.turn.start({ text: 'go', turnId: 't' } as never)
  await $.tool.call({ tool: 'Write', file_path: '/a', content: 'x' })
  await $.turn.start({ text: 'help', turnId: 's', agentId: 'a1' } as never)
  await $.turn.complete({ answer: '', durationMs: 7000, isAborted: false, turnId: 's', agentId: 'a1', reason: 'answer' } as never)
  await $.turn.complete({ answer: '', durationMs: 90_000, isAborted: false, turnId: 't', reason: 'answer' } as never)

  const line = await $.ui.mount({ plugin: 'helm-spinner', surface: 'terminal', component: 'TurnDuration', requestId: 'l', props: { word: 'Baked', durationMs: 90_000 } })
  expect(await textOf(line)).toContain('+1')
})
