import { expect, test } from 'claude-code/testing'

import { PAST_VERBS, VERBS, pick } from './register'

test('keeps a verb steady for the same seed', () => {
  expect(pick(VERBS.thinking, 'Sauteingthinking')).toBe(pick(VERBS.thinking, 'Sauteingthinking'))
})

test('picks from the pool of the current phase', () => {
  for (const seed of ['a', 'Baking', 'Sauteing', 'Noodling']) {
    expect(VERBS['tool-use']).toContain(pick(VERBS['tool-use'], seed))
    expect(PAST_VERBS).toContain(pick(PAST_VERBS, seed))
  }
})
