import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { endingMark, kindOf, questPrefix } from './register'

const KNOWN = {
  jobs: [{ id: 'b1', toolUseId: 'tu-shell' }],
  pets: [{ id: 'tu-agent', agentId: 'a1' }],
}

test('marks how the task ended', () => {
  expect(endingMark('completed')).toBe('✅')
  expect(endingMark('failed')).toBe('❌')
  expect(endingMark('killed')).toBe('🛑')
  expect(endingMark('expired')).toBe('📨')
  expect(endingMark(undefined)).toBe('📨')
})

test("tells shells from subagents by rpg-hud's lists", () => {
  expect(kindOf({ id: 'b1' }, KNOWN)).toBe('shell')
  expect(kindOf({ toolUseId: 'tu-shell' }, KNOWN)).toBe('shell')
  expect(kindOf({ id: 'a1' }, KNOWN)).toBe('agent')
  expect(kindOf({ type: 'remote_agent' }, KNOWN)).toBe('remote')
  expect(kindOf({ id: 'zz' }, KNOWN)).toBeUndefined()
  expect(kindOf({}, { jobs: [], pets: [] })).toBeUndefined()
})

test('puts the ending before the kind', () => {
  expect(questPrefix({ status: 'completed' }, 'agent')).toBe('✅ ◈ ')
  expect(questPrefix({ status: 'failed' }, undefined)).toBe('❌ ')
})

const ROW = {
  text: 'Background command "npm test" completed',
  origin: { kind: 'task-notification' },
  isExpanded: false,
  task: { id: 'b1', status: 'completed', durationMs: 1200 },
}

const drawText = async ($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], props: object) => {
  let seen = ''
  on('ui.render', { component: 'UserMessage' }, async ($$, e) => {
    seen = (e.props as { text: string }).text
    const { Text } = $$.ui.resolve(e)
    return <Text>{seen}</Text>
  })
  await $.ui.mount({ plugin: 'rpg-quest', surface: 'terminal', component: 'UserMessage', props: props as never })
  return seen
}

test('prefixes a collapsed task notification', async ($, on) => {
  on('state.get', async (_$, e, next) => {
    const ref = e as unknown as { plugin: string; key: string }
    if (ref.plugin !== 'rpg-hud') return next(e)
    const values: Record<string, unknown> = { jobs: [{ id: 'b1', toolUseId: 'tu-shell' }], pets: [] }
    return { value: { value: values[ref.key], version: 1 } } as never
  })
  expect(await drawText($, on, ROW)).toBe('✅ ⚙ Background command "npm test" completed')
})

test('leaves prompts and expanded rows alone', async ($, on) => {
  expect(await drawText($, on, { ...ROW, isExpanded: true })).toBe(ROW.text)
})

test("leaves the person's own prompt alone", async ($, on) => {
  expect(await drawText($, on, { text: 'hi', origin: { kind: 'composer' }, isExpanded: false })).toBe('hi')
})
