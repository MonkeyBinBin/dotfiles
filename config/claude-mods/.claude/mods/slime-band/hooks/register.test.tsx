import { expect, mock, test } from 'claude-code/testing'

import { SLIME_WIDTH } from './slime-sprite'
import { SLIME_AREA_MIN, gradientAt, layoutHud } from './hud'
import { allocateCells, gaugeLine, layoutGauge, legendLines, percentColor, rowWidth, wrapLegend } from './context-bar'
import { TUBE_ROWS, TUBE_TICKS, groundPixels, soilAt, tubeColumns, tubePixels } from './mana-tube'
import { hexOf, iconOf, liquidOf } from './liquids'
import type { ContextInfo } from '../types'
import { HOP_MS, sceneSize, sceneSvg, walkAt } from './desktop'
import { BANNER_MS, bannerFor } from './banner'
import { CAST_TICKS, LISTEN_MS, NAP_AFTER_MS, TRACK_ROWS, composeTrack, floorAt, formatTokens, infoLine, infoSegments, slimePose, stepSlime } from './register'

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
    const texts = (await ui.findAll({ type: 'Text' })).map(row => row.text ?? '').join('|')
    const scene = surface === 'terminal' ? undefined : (await ui.findAll({ type: 'Svg' }))[0]
    const shown = scene === undefined ? texts : `${texts}|${String(scene.props.alt)}|${String(scene.props.source)}`
    expect(shown).not.toContain('opus')
    expect(shown).toContain('turns')
    expect(shown).toContain('engine band')
    if (surface === 'terminal') {
      expect(await ui.find({ type: 'Raster' })).toBeDefined()
    } else {
      expect(String(scene?.props.source)).toContain('<svg')
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

test('a narrow band drops the changed count, then the last turn, before the tokens', () => {
  const labelsAt = (width: number) => layoutHud(infoSegments(FACTS, 12), width).labels.map(label => label.text)
  const widths = Array.from({ length: 200 }, (_, at) => at + 1)
  const firstWithTokens = widths.find(width => labelsAt(width).includes('↑ out'))
  expect(firstWithTokens).toBeDefined()
  expect(labelsAt(firstWithTokens ?? 0)).toEqual(['↻ turns', '↓ in', '↑ out'])
  const firstWithLast = widths.find(width => labelsAt(width).includes('◷ last turn'))
  expect(labelsAt(firstWithLast ?? 0)).toEqual(['↻ turns', '◷ last turn', '↓ in', '↑ out'])
  const narrow = layoutHud(infoSegments(FACTS, 12), 60)
  expect(narrow.areaWidth).toBeGreaterThanOrEqual(SLIME_AREA_MIN)
  expect(narrow.labels.map(label => label.text)).not.toContain('✎ changed')
})

test('paints the big numbers into the track', () => {
  const hud = layoutHud(infoSegments({ ...FACTS, dirty: 0, lastMs: 0 }, 7), 60)
  const cells = composeTrack(60, { x: 0, dir: 1, pose: 'sit', snore: 0 }, hud.pixels)
  const lit = hud.pixels[0]
  expect(lit).toBeDefined()
  // The cell holding that pixel is drawn in the fact's colour at that row of its gradient.
  const cell = cellAt(cells, 60, Math.floor((lit?.y ?? 0) / 2), lit?.x ?? 0)
  expect(cell.slice(1)).toContain(gradientAt(0x56c8dc, lit?.y ?? 0, 5))
})

test('the HUD ends flush with the band, lined up with the context window', () => {
  const hud = layoutHud(infoSegments(FACTS, 12), 120)
  const rightmostPixel = Math.max(...hud.pixels.map(pixel => pixel.x))
  const rightmostLabel = Math.max(...hud.labels.map(label => label.x + label.width - 1))
  expect(Math.max(rightmostPixel, rightmostLabel)).toBe(119)
})

test('the big numbers stand on the same ground row as the slime', () => {
  const hud = layoutHud(infoSegments(FACTS, 12), 120)
  const rows = hud.pixels.map(pixel => pixel.y)
  // The bottom pixel row of the track (row 5) is the slime's ground; the extrusion stands on it.
  expect(Math.max(...rows)).toBe(5)
  expect(Math.min(...rows)).toBe(0)
})

test('the big numbers have a darker extrusion down and right of their face', () => {
  const hud = layoutHud([{ key: 'turns', icon: '↻', value: '1', label: 'turn', color: 'cyan', rgb: 0x56c8dc }], 60)
  const faceRgbs = new Set([0, 1, 2, 3, 4].map(y => gradientAt(0x56c8dc, y, 5)))
  const at = new Map(hud.pixels.map(pixel => [`${pixel.x},${pixel.y}`, pixel.rgb]))
  const face = hud.pixels.filter(pixel => faceRgbs.has(pixel.rgb))
  const side = hud.pixels.filter(pixel => !faceRgbs.has(pixel.rgb))
  expect(face.length).toBeGreaterThan(0)
  expect(side.length).toBeGreaterThan(0)
  for (const pixel of side) {
    expect(faceRgbs.has(at.get(`${pixel.x - 1},${pixel.y - 1}`) ?? -1)).toBe(true)
    expect(pixel.rgb).toBeLessThan(0x56c8dc)
  }
})

test('the big numbers fade from a light top to their own colour at the bottom', () => {
  const hud = layoutHud([{ key: 'turns', icon: '↻', value: '1', label: 'turn', color: 'cyan', rgb: 0x56c8dc }], 60)
  const green = (rgb: number) => (rgb >> 8) & 0xff
  const rowRgb = (y: number) => hud.pixels.find(pixel => pixel.y === y && pixel.rgb === gradientAt(0x56c8dc, y, 5))?.rgb
  const top = rowRgb(0)
  const bottom = rowRgb(4)
  expect(top).toBeDefined()
  expect(bottom).toBeDefined()
  expect(green(top!)).toBeGreaterThan(green(0x56c8dc))
  expect(green(bottom!)).toBeLessThan(green(0x56c8dc))
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
  expect([...line].length).toBe(80)
  expect(legendLines(gauge!)).toEqual(['📜 System prompt 3.0k  💬 Messages 37.0k'])
})

test('the tube spans the band; how full it is ends the legend line, which leaves it room', () => {
  const gauge = layoutGauge(CONTEXT, 80)!
  expect(gauge.width).toBe(80)
  expect(gauge.fill).toBe('20% · 40.0k / 200k')
  // The legend names read in their liquid's colour.
  expect(gauge.legend[0]).toEqual({ icon: '📜', name: 'System prompt', tokens: '3.0k', color: hexOf(liquidOf('System prompt')) })
  for (const row of gauge.legendRows) expect(rowWidth(row) + 2 + gauge.fill.length).toBeLessThanOrEqual(80)
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
  expect(layoutGauge(CONTEXT, 24)).toBeUndefined()
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
  // One Raster: the slime, its grass and soil, and the tube of mana set in the ground below; then the line.
  const rasters = kids.flatMap((k, at) => (k.type === 'Raster' ? [at] : []))
  expect(rasters).toHaveLength(1)
  const [tube = -1] = rasters
  expect((kids[tube] as { props?: { rows?: number } }).props?.rows).toBe(TRACK_ROWS + TUBE_ROWS)
  const engine = kids.findIndex(k => textOf(k).includes('engine band'))
  const line = textOf(kids[tube + 1] ?? {})
  expect(line).toContain('💬 Messages')
  expect(line).toContain('20% · 40.0k / 200k')
  expect(kids.some(k => /MANA|POWER|[╭╰│]/.test(textOf(k)))).toBe(false)
  expect(engine).toBeGreaterThan(tube)
})

test('a long legend wraps onto more rows, every item whole', () => {
  const items = Array.from({ length: 8 }, (_, at) => ({ icon: '🔮', name: `Category ${at}`, tokens: '12.3k', color: 'x' }))
  const rows = wrapLegend(items, 60)
  expect(rows.length).toBeGreaterThan(1)
  expect(rows.flat()).toEqual(items)
  const gauge = layoutGauge(
    { ...CONTEXT, slices: items.map(i => ({ name: i.name, tokens: 12_300, color: 'x', kind: 'used' as const })) },
    60,
  )
  // Each row fits inside the frame, the emoji counted two cells wide.
  for (const row of gauge!.legendRows) expect(rowWidth(row) + 2 + gauge!.fill.length).toBeLessThanOrEqual(60)
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
    return (await ui.findAll({ type: 'Svg' })).some(svg => String(svg.props.alt).includes('. Mana '))
  }
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ['context'] } as never)
  expect(await shows()).toBe(true)
  await $.session.end({ reason: 'clear' } as never)
  expect(await shows()).toBe(false)
})

test('on desktop the walk ping-pongs, one pixel per hop, as the terminal steps it', () => {
  expect(walkAt(5, 1, 20, 0)).toEqual({ x: 5, dir: 1 })
  expect(walkAt(5, 1, 20, HOP_MS * 3)).toEqual({ x: 8, dir: 1 })
  expect(walkAt(18, 1, 20, HOP_MS * 4)).toEqual({ x: 18, dir: -1 })
  expect(walkAt(2, -1, 20, HOP_MS * 4)).toEqual({ x: 2, dir: 1 })
  expect(walkAt(7, -1, 0, HOP_MS * 9).x).toBe(0)
})

test('the desktop scene animates the walk and holds still otherwise', () => {
  const hud = layoutHud([], 60)
  const walking = sceneSvg(60, hud, { mode: 'walk', x: 4, dir: 1, last: 40 }, {})
  expect(walking).toContain('animateTransform')
  expect(walking).toContain(`begin="-${4 * HOP_MS}ms"`)
  const sitting = sceneSvg(60, hud, { mode: 'sit', x: 4, dir: 1, last: 40 }, {})
  expect(sitting).not.toContain('animate')
  expect(sceneSvg(60, hud, { mode: 'wait', x: 4, dir: 1, last: 40 }, {})).toContain('>!<animate')
  expect(sceneSvg(60, hud, { mode: 'sleep', x: 4, dir: 1, last: 40 }, {})).toContain('>Z<animate')
})

test('the desktop scene is sized for its frame, so no default height pads it', () => {
  expect(sceneSize(100)).toEqual({ width: 600, height: 60 })
})

test('on desktop the slime sets off when work starts and settles when it ends', async ($, on) => {
  const clock = mock.clock(on)
  on('session.turns', async () => ({ value: 1 }))
  on('ui.render', { component: 'AbovePrompt' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text> </Text>
  })
  const sceneOf = async (isWorking: boolean) => {
    const ui = await $.ui.mount({ plugin: 'slime-band', surface: 'desktop', component: 'AbovePrompt', props: { ...BAND_PROPS, isWorking, bodyColumns: 100 } })
    const scene = (await ui.findAll({ type: 'Svg' }))[0]
    return { source: String(scene?.props.source), alt: String(scene?.props.alt) }
  }
  expect((await sceneOf(true)).alt).toContain('hopping')
  await clock.advance(HOP_MS * 5)
  await $.prompt.submit({ text: 'x' } as never).catch(() => undefined)
  await $.turn.complete({ durationMs: 1000 } as never).catch(() => undefined)
  const rest = await sceneOf(false)
  expect(rest.alt).toContain('sitting')
  expect(rest.source).toContain(`translate(${5 * 6} 0)`)
})

test('the biggest moment wins the banner: a slain boss, a boss appearing, a level up, a return', () => {
  const now = 10_000
  const boss = { name: 'Bug Hydra' }
  expect(bannerFor({}, now)).toBeUndefined()
  expect(bannerFor({ flashUntil: now + 100 }, now)?.word).toBe('LEVEL UP!')
  expect(bannerFor({ flashUntil: now + 100, bossFx: { event: 'appear', at: now - 10, boss } }, now)).toMatchObject({ word: 'BOSS!', color: 'red' })
  expect(bannerFor({ bossFx: { event: 'defeat', at: now - 10, boss } }, now)).toMatchObject({ word: 'VICTORY!', label: 'Bug Hydra is defeated' })
  // A hit is the encounter card's to show; an old moment is over.
  expect(bannerFor({ bossFx: { event: 'hit', at: now - 10, boss } }, now)).toBeUndefined()
  expect(bannerFor({ bossFx: { event: 'defeat', at: now - BANNER_MS - 1, boss } }, now)).toBeUndefined()
  const back = bannerFor({ pets: [{ status: 'ok', endedAt: now - 5, isBackground: true, description: 'a very long description of what the scout went out to find' }] }, now)
  expect(back?.word).toBe('QUEST CLEAR')
  expect(back?.label.length).toBeLessThanOrEqual(30)
  expect(bannerFor({ pets: [{ status: 'err', endedAt: now - 5, isBackground: true, description: 'x' }] }, now)).toBeUndefined()
  // One the turn waited on reports in the transcript: no banner.
  expect(bannerFor({ pets: [{ status: 'ok', endedAt: now - 5, description: 'x' }] }, now)).toBeUndefined()
  expect(bannerFor({ pets: [{ status: 'ok', endedAt: now - 5, isBackground: false, description: 'x' }] }, now)).toBeUndefined()
})

test('the hero falling and rising, a save and a delivery get banners too, behind the bigger moments', () => {
  const now = 1_000_000
  expect(bannerFor({ knockout: { state: 'down', at: now - 10 } }, now)).toMatchObject({ word: 'GAME OVER', color: 'red' })
  expect(bannerFor({ knockout: { state: 'up', at: now - 10 } }, now)).toMatchObject({ word: 'REVIVE!', color: 'green' })
  expect(bannerFor({ mapFx: { event: 'save', at: now - 10 } }, now)).toMatchObject({ word: 'SAVED!', color: 'cyan' })
  expect(bannerFor({ mapFx: { event: 'deliver', at: now - 10 } }, now)).toMatchObject({ word: 'DELIVERED!', color: 'yellow' })
  expect(bannerFor({ mapFx: { event: 'deliver', at: now - BANNER_MS - 1 } }, now)).toBeUndefined()
  // A level up outranks a revive or a save; a knockout outranks a level up.
  expect(bannerFor({ flashUntil: now + 100, knockout: { state: 'up', at: now - 10 }, mapFx: { event: 'save', at: now - 10 } }, now)?.word).toBe('LEVEL UP!')
  expect(bannerFor({ flashUntil: now + 100, knockout: { state: 'down', at: now - 10 } }, now)?.word).toBe('GAME OVER')
  expect(bannerFor({ restFx: { at: now - 10 } }, now)).toMatchObject({ word: 'REST AT INN', color: 'blue' })
  expect(bannerFor({ bossFx: { event: 'enrage', at: now - 10, boss: { name: 'Bug Hydra' } } }, now)).toMatchObject({ word: 'ENRAGED!', color: 'red' })
})

test('a banner takes the big numbers\' place on the track, then the facts come back', async ($, on) => {
  const start = Date.UTC(2026, 9, 2, 12)
  const clock = mock.clock(on, { now: start })
  on('session.turns', async () => ({ value: 3 }))
  on('state.get', async (_$, e, next) =>
    (e as { plugin: string; key: string }).plugin === 'rpg-hud' && (e as { key: string }).key === 'flashUntil'
      ? ({ value: { value: start + BANNER_MS, version: 1 } } as never)
      : next(e))
  on('ui.render', { component: 'AbovePrompt' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text> </Text>
  })
  const ui = await $.ui.mount({ plugin: 'slime-band', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND_PROPS, bodyColumns: 80 } })
  let shown = (await ui.findAll({ type: 'Text' })).map(row => row.text ?? '').join('|')
  expect(shown).toContain('✦ the hero grows stronger')
  expect(shown).not.toContain('turns')
  await clock.advance(BANNER_MS + 10)
  shown = (await ui.findAll({ type: 'Text' })).map(row => row.text ?? '').join('|')
  expect(shown).toContain('turns')
})

test('the tube pours each category as a layer of its own mana, empty glass after, the rune before the buffer', () => {
  const columns = tubeColumns(CONTEXT, 40)
  expect(columns).toHaveLength(40)
  expect(columns[0]).toEqual({ kind: 'used', color: liquidOf('System prompt') })
  const kinds = columns.map(c => c.kind)
  expect(kinds.indexOf('free')).toBeGreaterThan(kinds.lastIndexOf('used'))
  expect(kinds.indexOf('buffer')).toBeGreaterThan(kinds.lastIndexOf('free'))
  const pixels = tubePixels(CONTEXT, 42, 0, false)
  expect(pixels).toHaveLength(TUBE_ROWS * 2)
  // Rounded glass: the corners stay clear.
  expect(pixels[0]?.[0]).toBeUndefined()
  // The rune runs through both rims at the buffer's first column.
  const rune = kinds.indexOf('buffer') + 1
  expect(pixels.map(row => row[rune])).toEqual(Array(TUBE_ROWS * 2).fill(0xff3b3b))
})

test('the surface sloshes as it ticks, bubbles rise only while Claude works, and the mana flushes red near the rune', () => {
  const still = (tick: number, working: boolean, info: ContextInfo = CONTEXT) => JSON.stringify(tubePixels(info, 60, tick, working))
  expect(still(0, false)).not.toBe(still(TUBE_TICKS, false))
  expect(still(0, true)).not.toBe(still(0, false))
  const brink = { ...CONTEXT, percent: 80, compactAt: 167_000 }
  expect(still(0, false, brink)).not.toBe(still(0, false, { ...brink, compactAt: undefined, percent: 20 }))
  expect(iconOf('Messages')).toBe('💬')
  expect(iconOf('Something new')).toBe('🔮')
  expect(liquidOf('Something new')).toBe(liquidOf('Something new'))
})

test('on desktop the mana tube is a drawing that ripples by itself', async ($, on) => {
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
    return <Text> </Text>
  })
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({ plugin: 'slime-band', surface: 'desktop', component: 'AbovePrompt', props: { ...BAND_PROPS, bodyColumns: 100 } })
  // The ground is part of the slime's scene, its ripple frames taking turns under the soil.
  const scene = (await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).includes('. Mana 20%'))
  expect(String(scene?.props.source)).toContain('attributeName="visibility"')
  const shown = (await ui.findAll({ type: 'Text' })).map(row => row.text ?? '').join('|')
  expect(shown).toContain('💬 ')
  expect(shown).toContain('20%')
  expect(shown).not.toContain('MANA')
})

test('the ground under the grass is the tube set in soil, and cracks glow near the rune', () => {
  const ground = groundPixels(CONTEXT, 40, 0, false)
  expect(ground).toHaveLength(TUBE_ROWS * 2)
  // Soil at either end and in the tube's rounded corners: no gap shows under the grass.
  for (const row of ground) {
    expect(row).toHaveLength(40)
    for (const color of row) expect(color).toBeDefined()
  }
  expect(ground[0]?.[0]).toBe(soilAt(0, 0))
  expect(ground[0]?.[1]).toBe(soilAt(1, 0))
  const slimeAt = { x: 0, dir: 1 as const, pose: 'sit' as const, snore: 0 }
  const plain = composeTrack(40, slimeAt, [], ground)
  expect(atob(plain).length).toBe(40 * (TRACK_ROWS + TUBE_ROWS) * 3 * 4)
  expect(composeTrack(40, { ...slimeAt, embers: true }, [], ground)).not.toBe(plain)
  // No ground, and the track ends at the soil as before.
  expect(atob(composeTrack(40, slimeAt)).length).toBe(40 * TRACK_ROWS * 3 * 4)
})

test('listening, a note sits over the slime; casting, it flashes white and sparks fly off it', () => {
  const at = { x: 10, dir: 1 as const, pose: 'sit' as const, snore: 0 }
  const glyphs = (cells: string) => {
    const words = new Uint32Array(Uint8Array.from(atob(cells), ch => ch.charCodeAt(0)).buffer)
    return Array.from({ length: words.length / 3 }, (_, n) => [words[n * 3], words[n * 3 + 1], words[n * 3 + 2]] as const)
  }
  expect(glyphs(composeTrack(40, { ...at, note: 0 })).some(([glyph]) => glyph === 0x266a)).toBe(true)
  expect(glyphs(composeTrack(40, at)).some(([glyph]) => glyph === 0x266a)).toBe(false)
  // The leap's flash: every lit pixel of the slime white.
  const flash = glyphs(composeTrack(40, { ...at, pose: 'run2', cast: 2 }))
  expect(flash.some(([, fg]) => fg === 0xffffff)).toBe(true)
  // Sparks out past the slime's sides, gone once the cast ends.
  const sparked = composeTrack(40, { ...at, cast: 6 })
  expect(sparked).not.toBe(composeTrack(40, at))
  expect(composeTrack(40, { ...at, cast: CAST_TICKS + 5 })).not.toBe(sparked)
})

test('on desktop the slime listens while the person types, then casts what they send', async ($, on) => {
  const start = Date.UTC(2026, 9, 2, 12)
  const clock = mock.clock(on, { now: start })
  on('session.turns', async () => ({ value: 1 }))
  on('prompt.edit', async (_$, e) => ({ text: `${(e as { text: string }).text}h`, cursor: 1 }) as never)
  on('prompt.submit', async (_$, e) => ({ text: (e as { text: string }).text }) as never)
  on('ui.render', { component: 'AbovePrompt' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text> </Text>
  })
  const scene = async () => {
    const ui = await $.ui.mount({ plugin: 'slime-band', surface: 'desktop', component: 'AbovePrompt', props: { ...BAND_PROPS, bodyColumns: 100 } })
    const svg = (await ui.findAll({ type: 'Svg' }))[0]
    return { alt: String(svg?.props.alt), source: String(svg?.props.source) }
  }
  expect((await scene()).alt).not.toContain('listening')
  // The engine raises prompt.edit as the person types; a test raises it as the engine does.
  await ($.prompt as unknown as { edit: (e: unknown) => Promise<unknown> }).edit({ origin: { kind: 'person' }, text: '', cursor: 0, start: 0, end: 0, inputText: 'h' } as never)
  const listening = await scene()
  expect(listening.alt).toContain('listening to you type')
  expect(listening.source).toContain('♪')
  await clock.advance(LISTEN_MS + 10)
  expect((await scene()).alt).not.toContain('listening')

  await $.prompt.submit({ text: 'go', origin: { kind: 'person' } } as never)
  const cast = await scene()
  expect(cast.source).toContain('attributeName="opacity"')
  expect(cast.alt).not.toContain('listening')
})
