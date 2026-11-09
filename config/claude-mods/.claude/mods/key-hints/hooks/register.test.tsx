import { expect, test } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'

import { HINTS, modeOf, wordsFor } from './register'

const agent = (status: AgentInfo['status']): AgentInfo => ({ id: status, description: '', type: 'Explore', status })

test('a running turn shows the working keys, whatever agents are out', () => {
  expect(modeOf(true, [])).toBe('working')
  expect(modeOf(true, [agent('running')])).toBe('working')
})

test('between turns, live agents show the agent keys; ended ones do not', () => {
  expect(modeOf(false, [agent('running')])).toBe('agents')
  expect(modeOf(false, [agent('waiting')])).toBe('agents')
  expect(modeOf(false, [agent('completed'), agent('killed'), agent('idle')])).toBe('idle')
  expect(modeOf(false, [])).toBe('idle')
})

test('on a narrow band the familiar keys lose their words first, then the rest', () => {
  expect(wordsFor(HINTS.idle, 200)).toBe('all')
  expect(wordsFor(HINTS.idle, 120)).toBe('unfamiliar')
  expect(wordsFor(HINTS.idle, 60)).toBe('none')
})
