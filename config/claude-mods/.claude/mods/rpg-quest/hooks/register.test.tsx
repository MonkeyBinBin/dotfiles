import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { BANNER_COLUMNS, BANNER_FRAMES, BANNER_ROWS, burstOf, endingMark, kindOf, questBanner, questPrefix, SETTLE_MS } from './register'

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

const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

test('each ending has its burst; an unknown one goes without', () => {
  expect(burstOf('completed')).toBe('completed')
  expect(burstOf('failed')).toBe('failed')
  expect(burstOf('killed')).toBe('killed')
  expect(burstOf('expired')).toBeUndefined()
  expect(burstOf(undefined)).toBeUndefined()
})

test('a quest back plays its ending under the row once, then the picture goes', async ($, on) => {
  const start = Date.UTC(2026, 10, 3, 12)
  const clock = mock.clock(on, { now: start })
  const FRAMES = 4
  const asked: string[] = []
  const swaps: string[] = []
  on('fs.read', async (_$, e) => {
    asked.push(e.path)
    return { value: e.as === 'bytes' ? { base64: PIXEL } : JSON.stringify({ frames: FRAMES, cells: [8, 3], fps: 12.5 }) }
  })
  on('ui.blit', async (_$, e) => {
    if ('source' in e) swaps.push(e.key)
    return { value: {} }
  })
  on('ui.render', { component: 'UserMessage' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>{(e.props as { text: string }).text}</Text>
  })
  // The transcript drawn as the mod loads keeps still.
  const history = await $.ui.mount({ plugin: 'rpg-quest', surface: 'terminal', component: 'UserMessage', props: { ...ROW, task: { id: 'old', status: 'completed' } } as never })
  expect(await history.findAll({ type: 'Image' })).toHaveLength(0)
  await clock.advance(SETTLE_MS)
  const props = { ...ROW, task: { id: 'q1', status: 'failed' } }
  const ui = await $.ui.mount({ plugin: 'rpg-quest', surface: 'terminal', component: 'UserMessage', props: props as never })
  const images = await ui.findAll({ type: 'Image' })
  expect(images).toHaveLength(1)
  expect(images[0]?.props).toMatchObject({ columns: 8, rows: 3 })
  expect(asked.some(path => path.endsWith('/assets/fx/failed/meta.json'))).toBe(true)
  await clock.advance(80 * (FRAMES - 1))
  expect(swaps.filter(key => key === 'quest-fx').length).toBeGreaterThan(0)
  await clock.advance(80 * 2)
  expect(await ui.findAll({ type: 'Image' })).toHaveLength(0)
  // Drawn again later (a resize), the same quest does not play twice.
  const again = await $.ui.mount({ plugin: 'rpg-quest', surface: 'terminal', component: 'UserMessage', props: props as never })
  expect(await again.findAll({ type: 'Image' })).toHaveLength(0)
})

// One blank cell, packed: a space in the terminal's default colours.
const BLANK_CELL = btoa(String.fromCharCode(...new Uint8Array(Uint32Array.of(0x20, 0x01000000, 0x01000000).buffer)))

test('a terminal that draws no pictures gets the ending in half-block cells instead', async ($, on) => {
  const start = Date.UTC(2026, 10, 3, 13)
  const clock = mock.clock(on, { now: start })
  const FRAMES = 6
  const asked: string[] = []
  on('fs.read', async (_$, e) => {
    asked.push(e.path)
    if (e.path.endsWith('raster-12x5.json'))
      return { value: JSON.stringify({ columns: 1, rows: 1, frames: Array.from({ length: FRAMES }, () => BLANK_CELL) }) }
    return { value: e.as === 'bytes' ? { base64: PIXEL } : JSON.stringify({ frames: FRAMES, cells: [8, 3], fps: 12.5 }) }
  })
  on('ui.blit', async (_$, e) =>
    'source' in e ? { value: { deny: 'the Image draws its alt here: the terminal draws neither kitty placeholder images' } } : { value: {} })
  on('ui.render', { component: 'UserMessage' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>{(e.props as { text: string }).text}</Text>
  })
  await $.ui.mount({ plugin: 'rpg-quest', surface: 'terminal', component: 'UserMessage', props: { ...ROW, task: { id: 'warmup', status: 'expired' } } as never })
  await clock.advance(SETTLE_MS)
  const ui = await $.ui.mount({ plugin: 'rpg-quest', surface: 'terminal', component: 'UserMessage', props: { ...ROW, task: { id: 'q2', status: 'killed' } } as never })
  expect(await ui.findAll({ type: 'Image' })).toHaveLength(1)
  await clock.advance(80 * 2)
  expect(await ui.findAll({ type: 'Image' })).toHaveLength(0)
  expect(await ui.findAll({ type: 'Raster' })).toHaveLength(1)
  expect(asked.some(path => path.endsWith('/assets/fx/killed/raster-12x5.json'))).toBe(true)
  await clock.advance(80 * FRAMES)
  expect(await ui.findAll({ type: 'Raster' })).toHaveLength(0)
})

const glyphsOf = (cells: string): number[] => {
  const words = new Uint32Array(Uint8Array.from(atob(cells), ch => ch.charCodeAt(0)).buffer)
  return Array.from({ length: words.length / 3 }, (_, i) => words[i * 3]!)
}

test('the glyph banner unfurls, says the quest is complete with its seal, then rolls up', () => {
  const frames = Array.from({ length: BANNER_FRAMES }, (_, frame) => glyphsOf(questBanner(frame)))
  for (const glyphs of frames) {
    expect(glyphs).toHaveLength(BANNER_COLUMNS * BANNER_ROWS)
    for (const glyph of glyphs) expect(glyph < 0x10000).toBe(true)
  }
  const ribbon = (glyphs: number[]) => String.fromCodePoint(...glyphs.slice(BANNER_COLUMNS, BANNER_COLUMNS * 2))
  expect(ribbon(frames[0]!).trim().length).toBeLessThan(BANNER_COLUMNS / 2)
  expect(ribbon(frames[15]!)).toContain('QUEST COMPLETE')
  expect(ribbon(frames[15]!)).toContain('✓')
  expect(ribbon(frames[BANNER_FRAMES - 1]!).trim()).toBe('')
})

test("a completed quest's banner draws as glyph cells where the terminal draws no pictures", async ($, on) => {
  const start = Date.UTC(2026, 10, 3, 14)
  const clock = mock.clock(on, { now: start })
  const cells: string[] = []
  on('fs.read', async (_$, e) => ({ value: e.as === 'bytes' ? { base64: PIXEL } : JSON.stringify({ frames: BANNER_FRAMES, cells: [15, 3], fps: 12.5 }) }))
  on('ui.blit', async (_$, e) => {
    if ('source' in e) return { value: { deny: 'the Image draws its alt here: no placeholder images' } }
    cells.push((e as { cells: string }).cells)
    return { value: {} }
  })
  on('ui.render', { component: 'UserMessage' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>{(e.props as { text: string }).text}</Text>
  })
  await $.ui.mount({ plugin: 'rpg-quest', surface: 'terminal', component: 'UserMessage', props: { ...ROW, task: { id: 'warm', status: 'expired' } } as never })
  await clock.advance(SETTLE_MS)
  const ui = await $.ui.mount({ plugin: 'rpg-quest', surface: 'terminal', component: 'UserMessage', props: { ...ROW, task: { id: 'q3', status: 'completed' } } as never })
  await clock.advance(80 * 15)
  const raster = (await ui.findAll({ type: 'Raster' }))[0]
  expect(raster?.props).toMatchObject({ columns: BANNER_COLUMNS, rows: BANNER_ROWS })
  expect(cells.length).toBeGreaterThan(5)
})
