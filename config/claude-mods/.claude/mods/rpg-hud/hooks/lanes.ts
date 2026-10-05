// The branching history laid out in lanes, one row per commit, drawn with box-drawing glyphs so every road
// runs on without a gap: a lane is a column waiting for a commit, forks and merges turn on ╮ ╯ ╭ ╰.

export type LaneCommit = { hash: string; parents: readonly string[] }

// One glyph of a row and the lane whose colour it takes. `isCommit` marks where the row's own commit stands.
export type LaneCell = { glyph: string; color: number; isCommit?: boolean }

export type LaneRow = {
  // Two cells per lane: the lane's glyph, then what lies between it and the next lane.
  cells: LaneCell[]
}

type Lane = { hash: string; color: number }

const EMPTY: LaneCell = { glyph: ' ', color: 0 }

// A turn that another join's road runs on through: it meets the road from both sides.
const THROUGH: Readonly<Record<string, string>> = { '╯': '┴', '╰': '┴', '╮': '┬', '╭': '┬', '┤': '┼', '├': '┼' }

export function layoutLanes(commits: readonly LaneCommit[]): LaneRow[] {
  const lanes: (Lane | null)[] = []
  let nextColor = 0
  const freeLane = (taken: ReadonlySet<number>) => {
    const index = lanes.findIndex((lane, at) => lane === null && !taken.has(at))
    return index === -1 ? lanes.length : index
  }

  return commits.map(commit => {
    const above = lanes.map(lane => lane !== null)
    let column = lanes.findIndex(lane => lane?.hash === commit.hash)
    // A branch's tip: nothing led here, it opens a lane of its own.
    if (column === -1) column = freeLane(new Set())
    const color = lanes[column]?.color ?? nextColor++

    const glyphs = new Map<number, LaneCell>()
    // Where each side road meets the commit's lane on this row.
    const joins: { at: number; color: number }[] = []

    // Lanes that waited for this same commit: their branches end here, turning into it.
    lanes.forEach((lane, at) => {
      if (at === column || lane?.hash !== commit.hash) return
      glyphs.set(at, { glyph: at > column ? '╯' : '╰', color: lane.color })
      joins.push({ at, color: lane.color })
      lanes[at] = null
    })

    const [first, ...others] = commit.parents
    lanes[column] = first === undefined ? null : { hash: first, color }

    // A merge's other parents: into the lane already waiting for one, or down a new lane.
    for (const parent of others) {
      const waiting = lanes.findIndex(lane => lane?.hash === parent)
      if (waiting !== -1 && waiting !== column && !glyphs.has(waiting)) {
        const lane = lanes[waiting] as Lane
        glyphs.set(waiting, { glyph: waiting > column ? '┤' : '├', color: lane.color })
        joins.push({ at: waiting, color: lane.color })
        continue
      }
      const at = freeLane(new Set([column, ...glyphs.keys()]))
      const lane = { hash: parent, color: nextColor++ }
      lanes[at] = lane
      glyphs.set(at, { glyph: at > column ? '╮' : '╭', color: lane.color })
      joins.push({ at, color: lane.color })
    }

    // Each join's road runs flat from the commit to it, crossing the lanes that pass straight down.
    const flat = new Map<number, LaneCell>()
    for (const join of joins) {
      const [low, high] = join.at > column ? [column, join.at] : [join.at, column]
      for (let cell = low * 2 + 1; cell < high * 2; cell++) {
        const lane = cell % 2 === 0 ? cell / 2 : undefined
        const isCrossing = lane !== undefined && above[lane] === true && lanes[lane] !== null && !glyphs.has(lane)
        const turn = lane === undefined ? undefined : glyphs.get(lane)
        if (lane !== undefined && turn !== undefined) {
          glyphs.set(lane, { ...turn, glyph: THROUGH[turn.glyph] ?? turn.glyph })
          continue
        }
        flat.set(cell, { glyph: isCrossing ? '┼' : '─', color: join.color })
      }
    }

    const width = Math.max(column, ...glyphs.keys(), ...lanes.map((lane, at) => (lane === null ? -1 : at))) + 1
    const cells: LaneCell[] = []
    for (let lane = 0; lane < width; lane++) {
      const passing = lanes[lane]
      const glyph =
        lane === column
          ? { glyph: '●', color, isCommit: true }
          : (glyphs.get(lane) ?? flat.get(lane * 2) ?? (passing && above[lane] ? { glyph: '│', color: passing.color } : EMPTY))
      cells.push(glyph, flat.get(lane * 2 + 1) ?? EMPTY)
    }

    // Lanes past the last one still waiting are dropped, so the graph narrows again.
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()
    return { cells }
  })
}

// A row as plain text, the commit drawn as `glyph`: what a test reads.
export const laneText = (row: LaneRow, glyph = '●'): string =>
  row.cells
    .map(cell => (cell.isCommit === true ? glyph : cell.glyph))
    .join('')
    .trimEnd()
