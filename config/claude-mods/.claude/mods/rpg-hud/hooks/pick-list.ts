import type { ClientSurface } from 'claude-code'

// A Client's state for a list of rows the pointer and the arrow keys pick from.
export type PickState = { tick: number; hover?: number }

export type PickOptions<R> = {
  rows: readonly R[]
  width: number
  isPickable: (row: R) => boolean
  open: (row: R) => void
  // Left or backspace, once a click has given the list the focus.
  back?: () => void
  // How often the cursor on the hovered row blinks.
  frameMs?: number
}

const FRAME_MS = 320

// Text cut to `width` columns at its end, padded to fill them.
export const fit = (text: string, width: number): string =>
  text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text.padEnd(width)

// Text cut to `width` columns at its start (a path keeps its file name), padded to fill them.
export const fitTail = (text: string, width: number): string =>
  text.length > width ? `…${text.slice(text.length - Math.max(0, width - 1))}` : text.padEnd(width)

// Wires a pick list onto a Client: a row a line, a click anywhere on a pickable row opens it, the pointer
// hovers, up and down walk the pickable rows and Enter opens. Call it on every draw; it answers the state
// to draw with and the blinking cursor for a row.
export function pickList<R>(surface: ClientSurface<PickState>, options: PickOptions<R>) {
  const { rows, width, isPickable, open, back } = options
  if (surface.state === undefined) {
    // The cursor blinks on the hovered row; nothing redraws while nothing is hovered.
    surface.every(options.frameMs ?? FRAME_MS, () => {
      const now = surface.state ?? { tick: 0 }
      if (now.hover !== undefined) surface.setState({ ...now, tick: now.tick + 1 })
    })
    surface.setState({ tick: 0 })
  }
  const state = surface.state ?? { tick: 0 }
  const pickable = (index: number) => {
    const row = rows[index]
    return row !== undefined && isPickable(row)
  }
  const openAt = (index: number) => {
    const row = rows[index]
    if (row !== undefined && isPickable(row)) open(row)
  }

  surface.onPointer(e => {
    const index = e.y >= 0 && e.y < rows.length && e.x >= 0 && e.x < width ? e.y : undefined
    const hover = index !== undefined && pickable(index) ? index : undefined
    if (e.type === 'up' && e.button === 'left' && hover !== undefined) return openAt(hover)
    if (e.type === 'leave') return state.hover === undefined ? undefined : surface.setState({ ...state, hover: undefined })
    if (e.type === 'move' && state.hover !== hover) surface.setState({ ...state, hover })
  })

  surface.onKey(e => {
    const order = rows.flatMap((_, index) => (pickable(index) ? [index] : []))
    if ((e.key === 'left' || e.key === 'backspace') && back !== undefined) return back()
    if (order.length === 0) return
    const at = state.hover === undefined ? -1 : order.indexOf(state.hover)
    if (e.key === 'down') surface.setState({ ...state, hover: order[(at + 1) % order.length] })
    if (e.key === 'up') surface.setState({ ...state, hover: order[(at - 1 + order.length) % order.length] })
    if (e.key === 'return' && state.hover !== undefined) openAt(state.hover)
  })

  const cursor = (isHover: boolean) => (isHover ? (state.tick % 2 === 0 ? '▶ ' : '▷ ') : '  ')
  return { state, cursor }
}
