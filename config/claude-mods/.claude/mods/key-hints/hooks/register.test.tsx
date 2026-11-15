import { expect, test } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'

import { HINTS, layoutFor, modeOf } from './register'
import type { Hint, Layout } from './register'

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

// Cells the row really draws, counted the way the render lays pills out.
const drawn = ({ shown, words }: Layout) =>
  shown.reduce((sum, hint: Hint) => {
    const word = words === 'all' || (words === 'unfamiliar' && !hint.isFamiliar) ? hint.word.length : 0
    return sum + 2 + 1 + hint.key.length + 1 + 2 + word + 1
  }, 0) + Math.max(0, shown.length - 1)
const keys = (layout: Layout) => layout.shown.map(hint => hint.key)

test('a wide band shows every key with its word', () => {
  const layout = layoutFor(HINTS.idle, 200)
  expect(layout.words).toBe('all')
  expect(keys(layout)).toEqual(HINTS.idle.map(hint => hint.key))
})

test('as the band narrows, familiar words go, then familiar keys, then the rest of the words', () => {
  expect(layoutFor(HINTS.idle, 130).words).toBe('unfamiliar')
  const noFamiliar = layoutFor(HINTS.idle, 90)
  expect(noFamiliar.words).toBe('all')
  expect(keys(noFamiliar)).toEqual(['^G', '^S', '^R', 'esc esc', '?'])
  const bare = layoutFor(HINTS.idle, 60)
  expect(bare.words).toBe('none')
  expect(keys(bare)).toEqual(['^G', '^S', '^R', 'esc esc', '?'])
})

test('below that, pills drop from the end; nothing ever overflows the band', () => {
  expect(keys(layoutFor(HINTS.idle, 30))).toEqual(['^G', '^S', '^R'])
  expect(layoutFor(HINTS.idle, 5).shown).toEqual([])
  for (const mode of ['idle', 'working', 'agents'] as const)
    for (let columns = 0; columns <= 200; columns++) expect(drawn(layoutFor(HINTS[mode], columns))).toBeLessThanOrEqual(columns)
})
