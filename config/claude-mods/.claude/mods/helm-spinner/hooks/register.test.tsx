import { expect, test } from 'claude-code/testing'

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

test('the clock reads minutes, then hours', () => {
  expect(clockOf(20_000)).toBe('00:20')
  expect(clockOf(3_725_000)).toBe('1:02:05')
})
