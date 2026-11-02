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

test('no verb carries VS16, which some terminals draw a cell short', () => {
  for (const verb of [...Object.values(VERBS).flat(), ...PAST_VERBS]) expect(verb.includes('️')).toBe(false)
})
