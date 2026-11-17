// The spinner in Herdr's dispatch layout, four rows tall: the agent's own train (the model the track map gave its terminal,
// in that model's livery) in a 2.5D oblique view, with the track, masts and contact wire streaming past at the speed of what's
// going on; then a departure board's LED: the clock and pictograms for the work and the gauges. Braille, so one colour a cell: each livery is banded to the cell rows
// (roof and the band over the windows, the windows, the band under them), and faces are told apart by a seam of unlit dots.
// Like the track map's sprites, a train never changes colour: what it's doing shows in its speed, sparks, smoke and lamps.
import type { Motion, Status } from './wave'

export const TRAIN_MODELS = ['emu', 'bullet', 'dmu', 'loco', 'tram'] as const
export type TrainModel = (typeof TRAIN_MODELS)[number]

export const TRAIN_ROWS = 4
const DOT_ROWS = TRAIN_ROWS * 4
const SCENE_COLUMNS = 46
const WIDTH = SCENE_COLUMNS * 2
const BASE = DOT_ROWS - 1 // the near rail's dot row
const DEPTH = 4 // depth steps; one goes a dot right and a dot up
const DEPTHS = [1, 2, 3, 4] // where roofs and cab faces are drawn (0 is the seam)
const HEAD_X = 62 // the cab's front, in dots; the tail runs off the left edge
const WIRE_Y = 12, WIRE_Z = 2, MAST_Z = 6, MAST_SPAN = 34, SLEEPER_SPAN = 5
const GAP = 1
const BRAILLE = 0x2800
const DOTS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]] // [row][column]
const DEFAULT_COLOR = 0x01000000

// themes/dispatch.json and the dispatch mod's state.js INK.
const INK = {
  amber: 0xffb03a, cream: 0xf2ead8, creamDim: 0x8a8476, flap: 0x1b2025, yellow: 0xffe05a, red: 0xff4a3a,
  steel: 0x6a8aa8, steelDim: 0x34465a, rail: 0x5a4a36, railTop: 0x8a949e, plate: 0xe8a03a, plateText: 0x1e1406,
  lit: 0xf0d898, glass: 0x4c6474, glint: 0x7a94a4, head: 0xfffbe8, tail: 0xff3a2a, smoke: 0x8a8a86, spark: 0xe8f4ff,
  bogie: 0x363d45, wheel: 0x58616b, pantograph: 0xc2ccd5, shoe: 0xe4eaef,
}

type Paint = { upper: number; body: number; lower: number; roof: number }
type Car = { len: number; pan?: boolean; cab?: 'raked' | 'nose' | 'round' | 'box'; nose?: number; stack?: boolean; loco?: boolean }
type Livery = Paint & { top: number; bottom: number; cars: Car[]; win: [number, number]; loco?: Paint }

// The track map's models (scripts/herdr-sub/fx/dispatch/_<model>.js) and their liveries (bake.mjs LIVERY plus body paint).
const STEEL = 0xc2ccd5, WHITE = 0xf6f8fa, CREAM = 0xebdcb6, NAVY = 0x34425c, ROOF = 0x727e8a
const LIVERIES: Record<TrainModel, Livery> = {
  // three stainless cars, an orange line over the windows, raked cabs, a pantograph on the middle car
  emu: { top: 9, bottom: 2, cars: [{ len: 24 }, { len: 24, pan: true }, { len: 24, cab: 'raked' }], upper: 0xffb03a, body: STEEL, lower: 0x9aa6b2, roof: ROOF, win: [4, 2] },
  // long low noses, white with a blue stripe under small windows, full skirts
  bullet: { top: 8, bottom: 1, cars: [{ len: 26, pan: true }, { len: 34, cab: 'nose', nose: 16 }], upper: WHITE, body: WHITE, lower: 0x4a8ae8, roof: 0xbcc6cd, win: [2, 2] },
  // a two-car diesel, cream over maroon, a rounded cab, its exhaust stack smoking, no pantograph
  dmu: { top: 9, bottom: 2, cars: [{ len: 34 }, { len: 34, cab: 'round', stack: true }], upper: CREAM, body: CREAM, lower: 0xa8423a, roof: 0xa8966e, win: [4, 2] },
  // a green electric locomotive hauling navy coaches with a green stripe
  loco: {
    top: 9, bottom: 2, cars: [{ len: 26 }, { len: 26 }, { len: 22, cab: 'box', pan: true, loco: true }], upper: NAVY, body: NAVY, lower: 0x3e7a56, roof: 0x4a5a78, win: [2, 2],
    loco: { upper: 0x3e7a56, body: 0x2a5a3e, lower: 0x3e7a56, roof: 0x2a5a3e },
  },
  // three articulated sections, white over a teal skirt with a teal roof fairing, big windows, a low floor
  tram: { top: 8, bottom: 1, cars: [{ len: 20 }, { len: 18, pan: true }, { len: 22, cab: 'round' }], upper: 0x2a9aa4, body: WHITE, lower: 0x2a9aa4, roof: 0x1a6e78, win: [6, 2] },
}

// What's going on, as the scenery's speed in dots a tick, sparks at the pantograph and the train bouncing; read off the
// sub's motions by how hard each one works, so the two layouts agree on what each mode is.
export type Run = { speed: number; sparks: number; bounce: number; isHeld: boolean }
export function runOf(motion: Motion, isAlarm: boolean): Run {
  if (isAlarm) return { speed: 0, sparks: 0, bounce: 0, isHeld: true }
  const effort = Math.max(0, Math.min(1, (motion.amplitude - 2.2) / 3)) // thinking 0 .. tool-use 1
  return { speed: 0.3 + effort * 2.1, sparks: effort > 0.5 ? effort * 0.6 : 0, bounce: effort > 0.5 ? effort * 0.45 : 0, isHeld: false }
}

export const isTrainModel = (value: unknown): value is TrainModel => TRAIN_MODELS.includes(value as TrainModel)

/** The model the track map shows for a terminal: what it drew for it, else its pick from the terminal's number (state.js modelOf). */
export function modelOf(trains: unknown, terminal: string): TrainModel {
  const drawn = trains && typeof trains === 'object' ? (trains as Record<string, unknown>)[terminal] : undefined
  return isTrainModel(drawn) ? drawn : TRAIN_MODELS[(Number(terminal.match(/\d+/)?.[0]) || 0) % TRAIN_MODELS.length]!
}

const noise = (x: number, t: number) => {
  const n = Math.sin(x * 127.1 + t * 311.7) * 43758.5453
  return n - Math.floor(n)
}
const fade = (c: number, k: number) =>
  (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k)
const mod = (a: number, n: number) => ((a % n) + n) % n

// The braille canvas: a colour and a weight a dot; a cell takes the colour with the most weight among its dots.
function canvas() {
  const dots: ([number, number] | null)[][] = Array.from({ length: DOT_ROWS }, () => new Array(WIDTH).fill(null))
  const inside = (x: number, y: number) => x >= 0 && x < WIDTH && y >= 0 && y < DOT_ROWS
  const dot = (x: number, y: number, ink: number, weight: number) => {
    x = Math.round(x), y = Math.round(y)
    if (inside(x, y)) dots[y]![x] = [ink, weight]
  }
  const erase = (x: number, y: number) => {
    x = Math.round(x), y = Math.round(y)
    if (inside(x, y)) dots[y]![x] = null
  }
  // world (x along the track, y up from the rail, z back from the near side) to the screen
  const at = (x: number, y: number, z: number, ink: number, weight = 1) => dot(x + z, BASE - y - z, ink, weight)
  const cell = (cx: number, cy: number): [number, number] | undefined => {
    let bits = 0
    const score = new Map<number, number>()
    for (let r = 0; r < 4; r++) for (let s = 0; s < 2; s++) {
      const d = dots[cy * 4 + r]![cx * 2 + s]
      if (d) {
        bits |= DOTS[r]![s]!
        score.set(d[0], (score.get(d[0]) ?? 0) + d[1])
      }
    }
    if (!bits) return undefined
    return [BRAILLE + bits, [...score].sort((a, b) => b[1] - a[1])[0]![0]]
  }
  return { at, erase, cell }
}

// `travelled` is how far the train has come, in dots: a running total, so a change of speed doesn't jump the scenery.
function drawScene(c: ReturnType<typeof canvas>, model: TrainModel, run: Run, tick: number, travelled: number) {
  const m = LIVERIES[model]
  const offset = travelled
  const blink = Math.floor(tick / 4) % 2 === 0

  // the ground: sleepers going by, the far rail
  for (let x = -4; x < WIDTH; x++) {
    if (mod(Math.floor(x + offset), SLEEPER_SPAN) === 0) for (let z = 0; z <= DEPTH; z++) c.at(x, 0, z, INK.rail)
    c.at(x, 0, DEPTH, INK.railTop)
  }
  // masts on the far side with their cantilevers out over the track, and the wire sagging between them; red when held
  for (let x = -MAST_SPAN; x < WIDTH + MAST_SPAN; x++) {
    if (mod(Math.floor(x + offset), MAST_SPAN) === 0) {
      for (let y = 0; y <= WIRE_Y + 1; y++) c.at(x, y, MAST_Z, INK.steelDim)
      for (let z = WIRE_Z; z <= MAST_Z; z += 0.5) c.at(x, WIRE_Y + 1, z, INK.steelDim)
    }
  }
  for (let x = -4; x < WIDTH; x++) {
    const sag = Math.sin((mod(x + offset, MAST_SPAN) / MAST_SPAN) * Math.PI) * 0.8
    c.at(x, WIRE_Y - sag, WIRE_Z, run.isHeld ? (blink ? INK.red : fade(INK.red, 0.35)) : INK.creamDim)
  }
  // held: a stop signal ahead, red and blinking
  if (run.isHeld) {
    const sx = HEAD_X + 18
    for (let y = 0; y <= 8; y++) c.at(sx, y, MAST_Z - 1, INK.steel, 2)
    for (const [dx, dy] of [[0, 9], [1, 9], [0, 10], [1, 10]] as const) c.at(sx + dx, dy, MAST_Z - 1, blink ? INK.red : fade(INK.red, 0.3), 9)
  }

  // the train, tail first so each car draws over the gangway behind it
  const bounce = run.bounce && noise(Math.floor(tick / 2), 1) < run.bounce * 0.5 ? 1 : 0
  const spin = run.speed > 0 && Math.floor(offset / 2) % 2 === 1
  const lift = (y: number) => y + bounce
  let x0 = HEAD_X - m.cars.reduce((n, car) => n + car.len + 2, -2)
  for (const car of m.cars) {
    const paint: Paint = car.loco && m.loco ? m.loco : m
    const x1 = x0 + car.len - 1
    const top = (x: number) => {
      if (car.cab === 'nose' && car.nose) {
        const k = Math.max(0, (x - (x1 - car.nose)) / car.nose)
        return Math.round(m.top - (m.top - m.bottom - 2) * k * k)
      }
      if (car.cab === 'round' && x >= x1 - 2) return m.top - (x - (x1 - 3))
      if (car.cab === 'raked' && x >= x1 - 1) return m.top - 1
      return m.top
    }
    // the roof, its far strip darker; a nose's cockpit glazed on its slope
    for (let x = x0; x <= x1; x++) for (const z of DEPTHS) c.at(x, lift(top(x)), z, z >= DEPTH - 1 ? paint.roof : paint.upper, 2)
    if (car.cab === 'nose' && car.nose)
      for (let x = x1 - car.nose + 2; x <= x1 - car.nose + 7; x++) for (const z of DEPTHS) c.at(x, lift(top(x)), z, (x + z) % 4 === 0 ? INK.glint : INK.glass, 4)
    // the cab's front face past a seam column: a windscreen edge to edge with a glint across it, the lamps under it, and
    // their throw ahead when running; held, red markers blink instead
    if (car.cab) {
      const t = top(x1)
      for (const z of DEPTHS) for (let y = m.bottom; y <= t; y++) {
        const isGlass = car.cab !== 'nose' && y >= 4 && y <= t - 1
        c.at(x1 + 1, lift(y), z, isGlass ? ((z + y) % 4 === 0 ? INK.glint : INK.glass) : y <= 3 ? paint.lower : paint.upper, isGlass ? 4 : 2)
      }
      const lamp = run.isHeld ? (blink ? INK.tail : undefined) : INK.head
      if (lamp !== undefined) for (const z of [1, DEPTH]) c.at(x1 + 1, lift(car.cab === 'nose' ? m.bottom + 1 : 2), z, lamp, 12)
      if (!run.isHeld) for (let k = 1; k <= 3; k++) c.at(x1 + 1 + k * 1.5, lift(2) - 0.2 * k, 2, fade(INK.head, 0.5 - k * 0.12), 4)
    }
    // the near side: the band under the windows, the windows with unlit pillars between, the band over them;
    // a locomotive's grilles; a cab's own side windows
    for (let x = x0; x <= x1; x++) {
      const t = top(x)
      for (let y = m.bottom; y < t; y++) {
        let ink: number | undefined = paint.upper
        if (y <= 3) ink = paint.lower
        else if (y <= 7) {
          const [w, p] = m.win
          const rel = x - x0 - 2
          const isWindow = rel >= 0 && x <= x1 - 2 && mod(rel, w + p) < w
          if (car.loco) ink = x > x1 - 4 && y >= 6 ? INK.glass : mod(x, 2) ? paint.body : paint.upper
          else ink = isWindow ? (run.isHeld ? fade(INK.lit, 0.55) : INK.lit) : undefined
          if (car.cab && car.cab !== 'nose' && x >= x1 - 3 && y >= 5) ink = INK.glass
        }
        if (ink === undefined) c.erase(x, BASE - lift(y))
        else c.at(x, lift(y), 0, ink, ink === INK.lit ? 3 : 2)
      }
      c.erase(x, BASE - lift(t)) // the seam between side and roof
    }
    if (car.cab) for (let y = m.bottom; y <= top(x1); y++) c.erase(x1 + 1, BASE - lift(y)) // and the cab's corner
    // bogies: a frame and two wheels each, turning while it runs
    for (const bx of [x0 + 3, x1 - 8]) {
      for (let x = bx; x <= bx + 5; x++) c.at(x, 1, 0, INK.bogie)
      for (const wx of [bx, bx + 4]) c.at(wx + (spin ? 1 : 0), 0, 0, INK.wheel)
    }
    // a single-arm pantograph up to the wire, arcing when it works hard
    if (car.pan) {
      const px = x0 + Math.floor(car.len / 2) - 2
      const t = top(px)
      for (const [dx, dy] of [[0, 1], [1, 1], [2, 2], [3, 2], [2, 3], [1, 3]] as const) if (t + dy <= WIRE_Y) c.at(px + dx, lift(t + dy), WIRE_Z, INK.pantograph, 6)
      for (const dx of [-1, 0, 1, 2]) c.at(px + dx, WIRE_Y, WIRE_Z, INK.shoe, 6)
      if (run.sparks)
        for (let i = 0; i < 5; i++)
          if (noise(i, tick) < run.sparks)
            c.at(px - 1 - Math.floor(noise(i + 9, tick) * 6), WIRE_Y - Math.floor(noise(i + 3, tick) * 2), WIRE_Z, noise(i, tick + 1) < 0.5 ? INK.yellow : INK.spark, 8)
    }
    // the diesel's exhaust: puffs leave the stack and drift back and up, faster the harder it works
    if (car.stack && run.speed > 0) {
      const sx = x1 - 10
      for (let i = 0; i < 6; i++) {
        const age = mod(tick * 0.6 + i * 2.3, 14)
        const py = top(sx) + 1 + age * 0.35
        if (py <= WIRE_Y + 2) c.at(sx - age * (0.4 + run.speed * 0.7), py, WIRE_Z, fade(INK.smoke, 1 - age / 16), 2)
      }
    }
    x0 = x1 + 3
  }
}

// Beside the train, a departure board's LED, all of it amber-on-black dot matrix seven dots tall: the run's clock, its colon
// beating each second; the kind of work as a pictogram lit in its service type's colour (a rapid's orange, a limited
// express's red...); and the cab's gauges past amber (water = context, coal = rate limit, a warning sign for failures) as
// amber pictograms, red and blinking at critical. Each sign has a cell's gap before it, so no two share a cell's one colour.
const SERVICE: Record<string, number> = {
  edit: 0xff8a2a, // a rapid's orange
  bash: 0xe8423a, // a limited express's red
  read: 0x3aa864, // a local's green
  web: 0x3a7ae8, // an express's blue
  agent: 0xa070e8, // a special's violet
  gear: 0x8a949e, // any other tool, out-of-service grey
}
const WARN_AT = 70, CRITICAL_AT = 90, HULL_AT = 3
const SIGN_COLUMNS = 4 // eight dots of room for a seven-dot pictogram
const SIGN_TOP = 7 // the top dot row of figures and pictograms: centred on the third row

// The figures, five dots wide and seven tall; the colon one wide.
const FONT: Record<string, string[]> = {
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], 1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], 3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], 5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], 7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], 9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['0', '0', '1', '0', '1', '0', '0'],
}
// The pictograms, seven by seven: the work's kinds, then the gauges (o2 water, fuel coal, hull a warning sign).
const PICTOGRAMS: Record<string, string[]> = {
  edit: ['0000011', '0000111', '0001110', '0011100', '0111000', '1010000', '1100000'], // pencil
  bash: ['1000000', '0100000', '0010000', '0100000', '1000000', '0000000', '0001111'], // prompt
  read: ['0111000', '1000100', '1000100', '1000100', '0111100', '0000010', '0000001'], // magnifying glass
  web: ['0011100', '0101010', '1001001', '1111111', '1001001', '0101010', '0011100'], // globe
  agent: ['0001000', '0011100', '0010100', '0011100', '0111110', '1011101', '0010100'], // rocket
  gear: ['0001000', '0111110', '0100010', '1100011', '0100010', '0111110', '0001000'], // gear
  o2: ['0001000', '0010100', '0100010', '1000001', '1000001', '0100010', '0011100'], // water drop
  fuel: ['0001000', '0011000', '0111100', '0111110', '1111011', '1110011', '0111110'], // flame
  hull: ['0001000', '0010100', '0010100', '0101010', '0100010', '1001001', '1111111'], // warning sign
}
const glyphWidth = (ch: string) => FONT[ch]![0]!.length
const dotsWide = (text: string) => [...text].reduce((n, ch) => n + glyphWidth(ch) + 1, -1)
// Room for the widest reading, 59:59, so the row keeps its width as the clock runs; shorter readings sit right, by the signs.
const CLOCK_COLUMNS = Math.ceil(dotsWide('00:00') / 2)

/** A station clock's reading: minutes and seconds, then hours and minutes past the hour. */
export function boardClockOf(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

export type Sign = [pictogram: string, kind: 'service' | 'gauge', isCritical: boolean]
/** The signs beside the clock: the work, then each gauge past amber. */
export function trainSignsOf(status: Status): Sign[] {
  const signs: Sign[] = []
  if (status.op && SERVICE[status.op] !== undefined) signs.push([status.op, 'service', false])
  if (status.o2 >= WARN_AT) signs.push(['o2', 'gauge', status.o2 >= CRITICAL_AT])
  if (status.fuel >= WARN_AT) signs.push(['fuel', 'gauge', status.fuel >= CRITICAL_AT])
  if (status.hull >= HULL_AT) signs.push(['hull', 'gauge', true])
  return signs
}

export const trainColumnsOf = (status: Status) => SCENE_COLUMNS + GAP * 2 + CLOCK_COLUMNS + trainSignsOf(status).length * (GAP + SIGN_COLUMNS)

export function trainCells(model: TrainModel, run: Run, tick: number, travelled: number, elapsedMs: number, status: Status): string {
  const columns = trainColumnsOf(status)
  const words = new Uint32Array(columns * TRAIN_ROWS * 3)
  for (let i = 0; i < columns * TRAIN_ROWS; i++) words.set([0x20, DEFAULT_COLOR, DEFAULT_COLOR], i * 3)
  const put = (x: number, y: number, code: number, ink: number) => words.set([code, ink, DEFAULT_COLOR], (y * columns + x) * 3)
  // lit dots, isLit(x, y) over a field `width` cells wide from column `left`, in one ink
  const led = (left: number, width: number, ink: number, isLit: (x: number, y: number) => boolean) => {
    for (let cy = 0; cy < TRAIN_ROWS; cy++) for (let cx = 0; cx < width; cx++) {
      let bits = 0
      for (let r = 0; r < 4; r++) for (let s = 0; s < 2; s++) if (isLit(cx * 2 + s, cy * 4 + r)) bits |= DOTS[r]![s]!
      if (bits) put(left + cx, cy, BRAILLE + bits, ink)
    }
  }

  const c = canvas()
  drawScene(c, model, run, tick, travelled)
  for (let cy = 0; cy < TRAIN_ROWS; cy++) for (let cx = 0; cx < SCENE_COLUMNS; cx++) {
    const shown = c.cell(cx, cy)
    if (shown) put(cx, cy, shown[0], shown[1])
  }

  // the clock, right-aligned in its room, the colon lit for the first half of each second
  const text = boardClockOf(elapsedMs)
  const isBeat = Math.floor(elapsedMs / 500) % 2 === 0
  const shift = CLOCK_COLUMNS * 2 - dotsWide(text)
  let at = SCENE_COLUMNS + GAP * 2
  led(at, CLOCK_COLUMNS, INK.amber, (x, y) => {
    let from = shift
    for (const ch of text) {
      const w = glyphWidth(ch)
      if (x >= from && x < from + w) return FONT[ch]![y - SIGN_TOP]?.[x - from] === '1' && (ch !== ':' || isBeat)
      from += w + 1
    }
    return false
  })
  at += CLOCK_COLUMNS

  const isLitBeat = Math.floor(tick / 4) % 2 === 0
  for (const [name, kind, isCritical] of trainSignsOf(status)) {
    at += GAP
    const ink = kind === 'service' ? SERVICE[name]! : isCritical ? (isLitBeat ? INK.red : fade(INK.red, 0.35)) : INK.amber
    const rows = PICTOGRAMS[name]!
    led(at, SIGN_COLUMNS, ink, (x, y) => rows[y - SIGN_TOP]?.[x] === '1')
    at += SIGN_COLUMNS
  }
  return btoa(String.fromCharCode(...new Uint8Array(words.buffer)))
}
