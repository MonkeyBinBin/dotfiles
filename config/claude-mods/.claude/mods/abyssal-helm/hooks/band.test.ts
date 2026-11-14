import { expect, test } from 'claude-code/testing'

import { clockOf, durationText, gitOf, gitText, oxygenOf, quotaOf } from './band'

test('oxygen is the context left, blank when the window is unknown', () => {
  expect(oxygenOf(38)).toBe(62)
  expect(oxygenOf(100.4)).toBe(0)
  expect(oxygenOf(undefined)).toBe(null)
})

test('quota reads the five-hour window only', () => {
  expect(quotaOf([{ kind: 'seven_day', percentUsed: 12 }, { kind: 'five_hour', percentUsed: 41.5, resetsAt: '2026-11-14T10:00:00Z' }]))
    .toEqual({ percent: 42, resetsAt: '2026-11-14T10:00:00Z' })
  expect(quotaOf([{ kind: 'seven_day', percentUsed: 12 }])).toBe(null)
})

test('git status v2 gives branch, ahead/behind and changed paths', () => {
  const out = '# branch.oid abc\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -1\n1 .M N... 100644 100644 100644 a b f.ts\n? new.ts\n'
  const g = gitOf(out)

  expect(g).toEqual({ branch: 'main', ahead: 2, behind: 1, dirty: 2 })
  expect(gitText(g!)).toBe('⎇ main ↑2 ↓1 ●2')
  expect(gitText({ branch: 'dev', ahead: 0, behind: 0, dirty: 0 })).toBe('⎇ dev')
  expect(gitOf('')).toBe(null)
})

test('reset time and duration read as clock and minutes', () => {
  expect(clockOf(null)).toBe(null)
  expect(clockOf('not a date')).toBe(null)
  expect(clockOf('2026-11-14T10:05:00')).toBe('10:05')
  expect(durationText(42)).toBe('42s')
  expect(durationText(72)).toBe('1m12s')
})
