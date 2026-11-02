import { expect, mock, test } from 'claude-code/testing'

import { AURA_COLUMNS, auraCells, PAST_VERBS, VERBS, pick } from './register'

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

const MODES = ['requesting', 'thinking', 'tool-input', 'tool-use', 'responding'] as const

test('every aura frame fills its columns with width-1 glyphs', () => {
  for (const mode of MODES)
    for (let tick = 0; tick < 24; tick++) {
      const cells = auraCells(mode, tick)
      expect(cells).toHaveLength(AURA_COLUMNS)
      for (const [glyph] of cells) expect(glyph < 0x10000).toBe(true)
    }
})

test('the aura moves from tick to tick', () => {
  for (const mode of MODES) {
    const frames = new Set(Array.from({ length: 8 }, (_, tick) => JSON.stringify(auraCells(mode, tick))))
    expect(frames.size > 1).toBe(true)
  }
})

const SPINNER = { word: 'Baking', message: null, suffix: '…', mode: 'thinking' as const }

for (const surface of ['terminal', 'desktop'] as const) {
  test(`draws the aura before the verb on the terminal only (${surface})`, async ($, on) => {
    mock.clock(on)
    on('ui.render', { component: 'Spinner' }, async ($$, e) => {
      const { Text } = $$.ui.resolve(e)
      return <Text>{e.props.word}</Text>
    })
    const ui = await $.ui.mount({ plugin: 'rpg-spinner', surface, component: 'Spinner', props: SPINNER })
    expect(await ui.findAll({ type: 'Raster' })).toHaveLength(surface === 'terminal' ? 1 : 0)
    expect((await ui.findAll({ type: 'Text' })).map(found => found.text).join('|')).toMatch(/Channeling|Studying|Consulting|Charging/)
  })
}

test('the aura plays by blits while the spinner shows', async ($, on) => {
  const clock = mock.clock(on)
  let blits = 0
  on('ui.blit', async () => {
    blits += 1
    return { value: {} }
  })
  on('ui.render', { component: 'Spinner' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>{e.props.word}</Text>
  })
  await $.ui.mount({ plugin: 'rpg-spinner', surface: 'terminal', component: 'Spinner', props: SPINNER })
  await clock.advance(120 * 4)
  expect(blits >= 3).toBe(true)
})
