import { expect, test } from 'claude-code/testing'

import { countCall, hintTail, pendingModes, tallyLine } from './register'

const NONE = { unpushed: 0, jobs: 0, agents: 0 }
const FRESH = { calls: 0, editedFiles: [], failed: 0, isLive: true }

test('shows nothing while nothing is pending', () => {
  expect(pendingModes(NONE)).toEqual([])
})

test('flags what still needs the person', () => {
  expect(pendingModes({ unpushed: 2, jobs: 1, agents: 3, boss: 'npm test' })).toEqual([
    '↑2 unpushed', '⚙ 1 job', '◈ 3 agents', '✗ npm test',
  ])
})

test('counts calls, distinct edited files and failures', () => {
  let tally = countCall(FRESH, { path: '/a.ts', isFailed: false })
  tally = countCall(tally, { path: '/a.ts', isFailed: false })
  tally = countCall(tally, { isFailed: true })
  expect(tally).toEqual({ calls: 3, editedFiles: ['/a.ts'], failed: 1, isLive: true })
  expect(tallyLine(tally)).toBe('this turn: 3 calls · 1 file edited · 1 failed')
  expect(tallyLine({ ...tally, isLive: false })).toBe('last turn: 3 calls · 1 file edited · 1 failed')
})

test('keeps the hint line clean while typing or before any call', () => {
  const tally = countCall(FRESH, { isFailed: false })
  expect(hintTail(true, tally)).toBeUndefined()
  expect(hintTail(false, FRESH)).toBeUndefined()
  expect(hintTail(false, null)).toBeUndefined()
  expect(hintTail(false, tally)).toBe('this turn: 1 call')
})

test("adds rpg-hud's pending work before the engine's modes", async ($, on) => {
  on('state.get', async (_$, e, next) => {
    const ref = e as unknown as { plugin: string; key: string }
    if (ref.plugin !== 'rpg-hud') return next(e)
    const values: Record<string, unknown> = {
      map: { ahead: 2 }, jobs: [{ status: 'run' }, { status: 'ok' }], pets: [], boss: null,
    }
    return { value: { value: values[ref.key], version: 1 } } as never
  })
  let seen: readonly string[] = []
  on('ui.render', { component: 'SessionMode' }, async ($$, e) => {
    seen = (e.props as { modes: readonly string[] }).modes
    const { Text } = $$.ui.resolve(e)
    return <Text>{seen.join(' & ')}</Text>
  })
  await $.ui.mount({ plugin: 'rpg-prompt', surface: 'terminal', component: 'SessionMode', props: { modes: ['focus'] } })
  expect(seen).toEqual(['↑2 unpushed', '⚙ 1 job', 'focus'])
})

test('leaves the footer alone without rpg-hud', async ($, on) => {
  let seen: readonly string[] = []
  on('ui.render', { component: 'SessionMode' }, async ($$, e) => {
    seen = (e.props as { modes: readonly string[] }).modes
    const { Text } = $$.ui.resolve(e)
    return <Text>x</Text>
  })
  await $.ui.mount({ plugin: 'rpg-prompt', surface: 'terminal', component: 'SessionMode', props: { modes: ['focus'] } })
  expect(seen).toEqual(['focus'])
})
