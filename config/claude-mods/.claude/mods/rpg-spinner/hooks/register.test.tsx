import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { AURA_COLUMNS, auraCells, loopFrame, PAST_VERBS, VERBS, pick, refusesPictures } from './register'

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
    on('fs.read', async () => {
      throw new Error('no assets')
    })
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
  on('fs.read', async () => {
    throw new Error('no assets')
  })
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

const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

test('only a refusal that says so, or tmux holding it, means no pictures', () => {
  expect(refusesPictures({ deny: 'the Image draws its alt there: no placeholder images' })).toBe(true)
  expect(refusesPictures({ deny: 'held back', fix: 'tmux-passthrough' })).toBe(true)
  expect(refusesPictures({ deny: 'nothing of this plugin is mounted there' })).toBe(false)
  expect(refusesPictures({})).toBe(false)
})

test('a loop goes round and round', () => {
  const loop = { frames: ['a', 'b', 'c'] }
  expect([0, 1, 2, 3, 4, 7].map(tick => loopFrame(loop, tick))).toEqual(['a', 'b', 'c', 'a', 'b', 'b'])
})

// Module state outlives a test: these use phases the tests above never loaded, and the refusal comes last.
const assets = (on: Parameters<TestBody>[1], asked: string[]) =>
  on('fs.read', async (_$, e) => {
    asked.push(e.path)
    return { value: e.as === 'bytes' ? { base64: PIXEL } : JSON.stringify({ frames: 3, cells: [AURA_COLUMNS, 1], fps: 8.33 }) }
  })

test("where the terminal draws pictures the aura is the phase's pixel loop, swapped by blits", async ($, on) => {
  const clock = mock.clock(on)
  const asked: string[] = []
  const swaps: string[] = []
  assets(on, asked)
  on('ui.blit', async (_$, e) => {
    if ('source' in e) swaps.push(e.key)
    return { value: {} }
  })
  on('ui.render', { component: 'Spinner' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>{e.props.word}</Text>
  })
  const ui = await $.ui.mount({ plugin: 'rpg-spinner', surface: 'terminal', component: 'Spinner', props: { ...SPINNER, mode: 'tool-use' } })
  const images = await ui.findAll({ type: 'Image' })
  expect(images).toHaveLength(1)
  expect(images[0]?.props).toMatchObject({ columns: AURA_COLUMNS, rows: 1 })
  expect(await ui.findAll({ type: 'Raster' })).toHaveLength(0)
  expect(asked.some(path => path.endsWith('/assets/fx/tool-use/meta.json'))).toBe(true)
  await clock.advance(120 * 4)
  expect(swaps.filter(key => key === 'aura-fx').length >= 3).toBe(true)
})

test('a terminal that refuses the picture gets the glyph aura back', async ($, on) => {
  const clock = mock.clock(on)
  assets(on, [])
  on('ui.blit', async (_$, e) => ('source' in e ? { value: { deny: 'the Image draws its alt there: no placeholder images' } } : { value: {} }))
  on('ui.render', { component: 'Spinner' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>{e.props.word}</Text>
  })
  const ui = await $.ui.mount({ plugin: 'rpg-spinner', surface: 'terminal', component: 'Spinner', props: { ...SPINNER, mode: 'responding' } })
  expect(await ui.findAll({ type: 'Image' })).toHaveLength(1)
  await clock.advance(120 * 2)
  expect(await ui.findAll({ type: 'Image' })).toHaveLength(0)
  expect(await ui.findAll({ type: 'Raster' })).toHaveLength(1)
})
