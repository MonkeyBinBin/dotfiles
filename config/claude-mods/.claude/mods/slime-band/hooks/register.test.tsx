import { expect, mock, test } from 'claude-code/testing'

import { SLIME_WIDTH } from './slime-sprite'
import { RIGHT_MARGIN, SLIME_AREA_MIN, layoutHud } from './hud'
import { allocateCells, gaugeLine, layoutGauge, legendLines, percentColor, wrapLegend } from './context-bar'
import { NAP_AFTER_MS, TRACK_ROWS, composeTrack, floorAt, formatTokens, infoLine, infoSegments, slimePose, stepSlime } from './register'

const BAND_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 20,
  bodyColumns: 40,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
} as const

// Decode one Raster cell: [codePoint, foreground, background].
const cellAt = (cells: string, width: number, row: number, col: number) => {
  const bytes = Uint8Array.from(atob(cells), ch => ch.charCodeAt(0))
  const words = new Uint32Array(bytes.buffer)
  const at = (row * width + col) * 3
  return [words[at], words[at + 1], words[at + 2]]
}

test('hops while working, sits after a turn, naps when left alone', () => {
  expect(slimePose(true, 0, 0)).toBe('run1')
  expect(slimePose(true, 0, 3)).toBe('run2')
  expect(slimePose(false, 1000, 0)).toBe('sit')
  expect(slimePose(false, NAP_AFTER_MS, 0)).toBe('sleep')
})

test('turns round at both ends of the track', () => {
  expect(stepSlime(5, 1, 40)).toEqual({ x: 6, dir: 1 })
  expect(stepSlime(40 - SLIME_WIDTH, 1, 40)).toEqual({ x: 40 - SLIME_WIDTH - 1, dir: -1 })
  expect(stepSlime(0, -1, 40)).toEqual({ x: 1, dir: 1 })
})

test('paints the slime where it stands and leaves the rest see-through', () => {
  const cells = composeTrack(40, { x: 10, dir: 1, pose: 'sit', snore: 0 })
  expect(cellAt(cells, 40, 0, 0)).toEqual([0x20, 0x01000000, 0x01000000])
  // The sit frame's crown is pixel row 1, sprite columns 4-7: the lower half of the top cell row.
  expect(cellAt(cells, 40, 0, 14)?.[0]).toBe(0x2584)
  expect(cellAt(cells, 40, 0, 9)).toEqual([0x20, 0x01000000, 0x01000000])
})

test('mirrors the slime when it runs left', () => {
  const right = composeTrack(40, { x: 0, dir: 1, pose: 'run1', snore: 0 })
  const left = composeTrack(40, { x: 0, dir: -1, pose: 'run1', snore: 0 })
  expect(cellAt(right, 40, 0, 0)).toEqual(cellAt(left, 40, 0, SLIME_WIDTH - 1))
  expect(right).not.toBe(left)
})

test('shortens token counts', () => {
  expect(formatTokens(950)).toBe('950')
  expect(formatTokens(32_140)).toBe('32.1k')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`draws the info line above the prompt on ${surface}`, async ($, on) => {
    mock.clock(on)
    on('session.turns', async () => ({ value: 3 }))
    on('ui.render', { component: 'AbovePrompt' }, async ($$, e) => {
      const { Text } = $$.ui.resolve(e)
      return <Text>engine band</Text>
    })

    const ui = await $.ui.mount({ plugin: 'slime-band', surface, component: 'AbovePrompt', props: BAND_PROPS })
    const shown = (await ui.findAll({ type: 'Text' })).map(row => row.text ?? '').join('|')
    expect(shown).not.toContain('opus')
    expect(shown).toContain('turns')
    expect(shown).toContain('engine band')
    if (surface === 'terminal') {
      expect(await ui.find({ type: 'Raster' })).toBeDefined()
    }
  })
}

// The first column the slime paints on the middle row of a track.
const slimeColumn = (cells: string, width: number) => {
  for (let col = 0; col < width; col += 1) {
    if (cellAt(cells, width, 1, col)[0] !== 0x20) return col
  }
  return -1
}

test('the slime hops along the track while Claude works', async ($, on) => {
  const clock = mock.clock(on)
  const blitted: string[] = []
  on('ui.blit', async (_$, e) => {
    if ('cells' in e) blitted.push(e.cells)
    return { value: {} }
  })
  on('session.turns', async () => ({ value: 1 }))
  on('ui.render', { component: 'AbovePrompt' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text> </Text>
  })

  await $.ui.mount({
    plugin: 'slime-band',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...BAND_PROPS, isWorking: true },
  })
  await clock.advance(80 * 6)

  const first = blitted[0]
  const last = blitted.at(-1)
  expect(first).toBeDefined()
  expect(last).toBeDefined()
  expect(slimeColumn(last ?? '', 40)).toBeGreaterThan(slimeColumn(first ?? '', 40))
})

test('adds only what the status line leaves out', () => {
  const base = { branch: 'develop', dirty: 3, lastMs: 14_200, inTokens: 32_140, outTokens: 1200 }
  expect(infoLine(base, 12)).toBe(
    '✎ 3 changed  │  ↻ 12 turns  │  ◷ 14s last turn  │  ↓ 32.1k in  │  ↑ 1.2k out',
  )
  expect(infoLine({ ...base, dirty: 0, lastMs: 0 }, 1)).toBe('↻ 1 turn')
  expect(infoLine(base, 12)).not.toContain('develop')
})

test('colours each fact apart', () => {
  const base = { branch: 'develop', dirty: 3, lastMs: 14_200, inTokens: 32_140, outTokens: 1200 }
  const colors = infoSegments(base, 12).map(s => s.color)
  expect(new Set(colors).size).toBe(colors.length)
})

const FACTS = { branch: 'develop', dirty: 3, lastMs: 14_200, inTokens: 32_140, outTokens: 1200 }

test('right-aligns the big numbers and leaves the slime its corner', () => {
  const hud = layoutHud(infoSegments(FACTS, 12), 200)
  expect(hud.labels.map(label => label.text)).toEqual(['✎ changed', '↻ turns', '◷ last turn', '↓ in', '↑ out'])
  expect(Math.max(...hud.pixels.map(pixel => pixel.x))).toBeLessThan(200)
  expect(Math.min(...hud.pixels.map(pixel => pixel.x))).toBeGreaterThan(hud.areaWidth)
})

test('drops the last facts first when the band is narrow', () => {
  const hud = layoutHud(infoSegments(FACTS, 12), 60)
  expect(hud.areaWidth).toBeGreaterThanOrEqual(SLIME_AREA_MIN)
  expect(hud.labels[0]?.text).toBe('✎ changed')
  expect(hud.labels.map(label => label.text)).not.toContain('↑ out')
})

test('paints the big numbers into the track', () => {
  const hud = layoutHud(infoSegments({ ...FACTS, dirty: 0, lastMs: 0 }, 7), 60)
  const cells = composeTrack(60, { x: 0, dir: 1, pose: 'sit', snore: 0 }, hud.pixels)
  const lit = hud.pixels[0]
  expect(lit).toBeDefined()
  // The cell holding that pixel is drawn in the fact's colour.
  const cell = cellAt(cells, 60, Math.floor((lit?.y ?? 0) / 2), lit?.x ?? 0)
  expect(cell.slice(1)).toContain(0x56c8dc)
})

test("keeps the HUD clear of the band's '[-]' corner", () => {
  const hud = layoutHud(infoSegments(FACTS, 12), 120)
  const rightmostPixel = Math.max(...hud.pixels.map(pixel => pixel.x))
  const rightmostLabel = Math.max(...hud.labels.map(label => label.x + label.width - 1))
  expect(Math.max(rightmostPixel, rightmostLabel)).toBeLessThan(120 - RIGHT_MARGIN)
  expect(RIGHT_MARGIN).toBe(3)
})

test('the big numbers stand on the same ground row as the slime', () => {
  const hud = layoutHud(infoSegments(FACTS, 12), 120)
  const rows = hud.pixels.map(pixel => pixel.y)
  // The bottom pixel row of the track (row 5) is the slime's ground.
  expect(Math.max(...rows)).toBe(5)
  expect(Math.min(...rows)).toBe(1)
})

test('a grass and soil floor runs under the whole track', () => {
  const cells = composeTrack(30, { x: 0, dir: 1, pose: 'sit', snore: 0 })
  for (const col of [0, 15, 29]) {
    expect(cellAt(cells, 30, TRACK_ROWS - 1, col)).toEqual([0x2580, floorAt(col, 6), floorAt(col, 7)])
  }
  // The floor does not reach into the slime's rows.
  expect(floorAt(3, 5)).toBeUndefined()
})

test('the labels sit above the big numbers', async ($, on) => {
  mock.clock(on)
  on('session.turns', async () => ({ value: 3 }))
  on('ui.render', { component: 'AbovePrompt' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text> </Text>
  })
  const ui = await $.ui.mount({ plugin: 'slime-band', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
  const band = await ui.find({ type: 'Box' })
  const kinds = (band?.children ?? []).map(child => (child as { type?: string }).type)
  expect(kinds.indexOf('Text')).toBeLessThan(kinds.indexOf('Raster'))
})

// Whether any cell of the track's top row holds `glyph`.
const topRowHas = (cells: string, width: number, glyph: number) =>
  Array.from({ length: width }, (_, col) => cellAt(cells, width, 0, col)[0]).includes(glyph)

test('waiting on the person, the slime sits up with a ! ahead of its face', () => {
  expect(slimePose(true, 0, 0, true)).toBe('sit')
  expect(slimePose(false, NAP_AFTER_MS * 2, 0, true)).toBe('sit')
  const right = composeTrack(40, { x: 10, dir: 1, pose: 'sit', snore: 0, alert: true })
  expect(cellAt(right, 40, 0, 10 + SLIME_WIDTH)[0]).toBe(0x21)
  const left = composeTrack(40, { x: 10, dir: -1, pose: 'sit', snore: 0, alert: true })
  expect(cellAt(left, 40, 0, 9)[0]).toBe(0x21)
  expect(topRowHas(composeTrack(40, { x: 10, dir: 1, pose: 'sit', snore: 0 }), 40, 0x21)).toBe(false)
})

test('a permission prompt makes the slime wait until its tool has run', async ($, on) => {
  const clock = mock.clock(on)
  const blitted: string[] = []
  on('ui.blit', async (_$, e) => {
    if ('cells' in e) blitted.push(e.cells)
    return { value: {} }
  })
  on('session.turns', async () => ({ value: 1 }))
  on('classic.PermissionRequest', async () => ({}))
  on('tool.call', async () => ({ result: { text: 'ok' } }))
  on('ui.render', { component: 'AbovePrompt' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text> </Text>
  })
  await $.ui.mount({ plugin: 'slime-band', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })

  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' } } as never)
  await clock.advance(80 * 12)
  expect(blitted.some(cells => topRowHas(cells, 40, 0x21))).toBe(true)

  await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  await clock.advance(80 * 12)
  // Whatever the blink showed last, the track now stands without the '!'.
  expect(topRowHas(blitted.at(-1) ?? '', 40, 0x21)).toBe(false)
})

const CONTEXT = {
  slices: [
    { name: 'System prompt', tokens: 3000, color: 'promptBorder', kind: 'used' as const },
    { name: 'Messages', tokens: 37_000, color: 'permission', kind: 'used' as const },
    { name: 'MCP tools', tokens: 9000, color: 'inactive', kind: 'deferred' as const },
    { name: 'Free space', tokens: 127_000, color: 'promptBorder', kind: 'free' as const },
    { name: 'Autocompact buffer', tokens: 33_000, color: 'inactive', kind: 'buffer' as const },
  ],
  total: 40_000,
  max: 200_000,
  percent: 20,
}

test('the context gauge fills its width exactly, one run per category', () => {
  const gauge = layoutGauge(CONTEXT, 80)
  expect(gauge).toBeDefined()
  const line = gaugeLine(gauge!)
  expect(line.startsWith('◈ ▕')).toBe(true)
  expect(line.endsWith('▏ 20% 40.0k/200k')).toBe(true)
  // Deferred tool schemas sit outside the window and the gauge.
  expect(gauge!.runs.map(r => r.glyph)).toEqual(['█', '█', '░', '▒'])
  expect([...line].length).toBe(80 - 3)
  expect(legendLines(gauge!)).toEqual(['■ System prompt 3.0k  ■ Messages 37.0k'])
})

test('every non-empty category keeps a cell, even a tiny one', () => {
  const cells = allocateCells(
    [
      { name: 'a', tokens: 10, color: 'x', kind: 'used' },
      { name: 'b', tokens: 100_000, color: 'x', kind: 'free' },
    ],
    20,
  )
  expect(cells).toEqual([1, 19])
})

test('the gauge reddens as auto-compaction nears, or the window fills when it is off', () => {
  const at = (percent: number, compactAt?: number) => percentColor({ percent, max: 200_000, compactAt })
  // Compaction at 167k is 83.5%: red from 73.5%, amber from 58.5%.
  expect(at(75, 167_000)).toBe('#ff5f5f')
  expect(at(60, 167_000)).toBe('#ffd23c')
  expect(at(50, 167_000)).toBe('#5ad27a')
  // Off, the limit is the whole window.
  expect(at(85)).toBe('#ffd23c')
  expect(at(92)).toBe('#ff5f5f')
})

test('the gauge hides when too narrow or empty, and survives NaN counts', () => {
  expect(allocateCells([{ name: 'a', tokens: Number.NaN, color: 'x', kind: 'used' }], 20)).toEqual([0])
  expect(layoutGauge(CONTEXT, 30)).toBeUndefined()
  expect(layoutGauge({ ...CONTEXT, slices: [] }, 120)).toBeUndefined()
})

test('a context measure fills the gauge under the floor, above the engine band', async ($, on) => {
  mock.clock(on)
  on('session.turns', async () => ({ value: 1 }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }) as never)
  on('session.usage', async () => ({
    value: {
      startedAt: 0,
      rateLimits: [],
      context: {
        window: 200_000,
        breakdown: {
          categories: CONTEXT.slices.map(s => ({ ...s, isDeferred: s.kind === 'deferred' })),
          totalTokens: 40_000,
          maxTokens: 200_000,
          rawMaxTokens: 200_000,
          percentage: 20,
          isAutoCompactEnabled: true,
          autoCompactThreshold: 167_000,
        },
      },
    },
  }) as never)
  on('ui.render', { component: 'AbovePrompt' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>engine band</Text>
  })
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({
    plugin: 'slime-band',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...BAND_PROPS, bodyColumns: 100 },
  })
  const band = await ui.find({ type: 'Box' })
  type Node = { type?: string; text?: string | null; children?: unknown[] }
  // A nested Text carries its words on its leaves.
  const textOf = (node: Node): string =>
    (node.text ?? '') + (node.children ?? []).map(child => (typeof child === 'string' ? child : textOf(child as Node))).join('')
  const kids = (band?.children ?? []) as Node[]
  const raster = kids.findIndex(k => k.type === 'Raster')
  const gauge = kids.findIndex(k => textOf(k).includes('◈'))
  const engine = kids.findIndex(k => textOf(k).includes('engine band'))
  expect(textOf(kids[gauge + 1] ?? {})).toContain('Messages')
  expect(raster).toBeGreaterThan(-1)
  expect(gauge).toBeGreaterThan(raster)
  expect(engine).toBeGreaterThan(gauge)
})

test('a long legend wraps onto more rows, every item whole', () => {
  const items = Array.from({ length: 8 }, (_, at) => ({ name: `Category ${at}`, tokens: '12.3k', color: 'x' }))
  const rows = wrapLegend(items, 60)
  expect(rows.length).toBeGreaterThan(1)
  expect(rows.flat()).toEqual(items)
  const gauge = layoutGauge(
    { ...CONTEXT, slices: items.map(i => ({ name: i.name, tokens: 12_300, color: 'x', kind: 'used' as const })) },
    60,
  )
  for (const line of legendLines(gauge!)) expect([...line].length).toBeLessThanOrEqual(60 - 3)
})

test('shortens big windows without a decimal', () => {
  expect(formatTokens(200_000)).toBe('200k')
  expect(formatTokens(99_950)).toBe('100.0k')
})

test('ending the conversation (/clear, resume) drops the gauge', async ($, on) => {
  mock.clock(on)
  on('session.turns', async () => ({ value: 1 }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }) as never)
  on('session.usage', async () => ({
    value: {
      startedAt: 0,
      rateLimits: [],
      context: {
        window: 200_000,
        breakdown: {
          categories: CONTEXT.slices.map(s => ({ ...s, isDeferred: s.kind === 'deferred' })),
          totalTokens: 40_000,
          rawMaxTokens: 200_000,
          percentage: 20,
          isAutoCompactEnabled: false,
        },
      },
    },
  }) as never)
  on('session.end', async () => ({ sessionId: 's' }) as never)
  on('ui.render', { component: 'AbovePrompt' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text> </Text>
  })
  const shows = async () => {
    const ui = await $.ui.mount({ plugin: 'slime-band', surface: 'desktop', component: 'AbovePrompt', props: { ...BAND_PROPS, bodyColumns: 100 } })
    return (await ui.findAll({ type: 'Text' })).some(t => (t.text ?? '').includes('◈'))
  }
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ['context'] } as never)
  expect(await shows()).toBe(true)
  await $.session.end({ reason: 'clear' } as never)
  expect(await shows()).toBe(false)
})
