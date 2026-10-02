import type { ClientModule } from 'claude-code'

import type { SkillRow } from './skills'

export type SkillsProps = {
  // The rows the window shows, already scrolled.
  rows: SkillRow[]
  width: number
}

type SkillsState = {
  tick: number
  // The row under the pointer or the arrow keys.
  hover?: number
  // The skill just cast and the tick its spell effect began.
  cast?: { name: string; start: number }
}

const FRAME_MS = 80
// The flash, then the sparkle sweep, then the row settles.
const FLASH_TICKS = 2
export const CAST_TICKS = 12
// Glowing skills and full-mastery stars shimmer on this beat, in frames.
const BEAT = 4

// Columns: cursor, glow, the three stars and a space; the name takes what is left before the right column.
const CURSOR = 2
const GLOW = 2
const STARS = 4
const RIGHT = 9

// The latest props and how many frames have passed, for the frame clock started on the first draw.
let latest: SkillsProps = { rows: [], width: 0 }
let frames = 0

const isBusy = (state: SkillsState, props: SkillsProps) =>
  state.cast !== undefined || state.hover !== undefined || props.rows.some(row => row.kind === 'skill' && (row.isGlowing || row.uses >= 10))

// The sparkle trail sweeping across `width` columns at frame `f` of the effect.
export const sparkleTrail = (width: number, f: number): string => {
  if (width <= 0) return ''
  const head = Math.floor(((f - FLASH_TICKS) / (CAST_TICKS - FLASH_TICKS)) * (width + 3))
  return Array.from({ length: width }, (_, x) => {
    const behind = head - x
    if (behind === 0) return '✦'
    if (behind === 1) return '✧'
    if (behind === 2) return '⋆'
    return ' '
  }).join('')
}

const fit = (text: string, width: number): string =>
  text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text.padEnd(width)

const Skills: ClientModule<SkillsProps, SkillsState> = (props, surface) => {
  const { Box, Text } = surface.elements
  latest = props
  if (surface.state === undefined) {
    surface.every(FRAME_MS, () => {
      const now = surface.state ?? { tick: 0 }
      frames += 1
      if (!isBusy(now, latest)) return
      // Only a cast animates every frame; hovers and shimmers move on the beat.
      if (now.cast === undefined && frames % BEAT !== 0) return
      const isOver = now.cast !== undefined && now.tick + 1 - now.cast.start > CAST_TICKS
      surface.setState({ ...now, tick: now.tick + 1, ...(isOver ? { cast: undefined } : {}) })
    })
    surface.setState({ tick: 0 })
  }
  const state = surface.state ?? { tick: 0 }
  const { tick } = state
  const nameWidth = Math.max(4, props.width - CURSOR - GLOW - STARS - RIGHT)

  const cast = (index: number) => {
    const row = props.rows[index]
    if (row?.kind !== 'skill') return
    surface.setState({ ...state, hover: index, cast: { name: row.name, start: tick } })
    surface.post({ cast: row.name })
  }

  surface.onPointer(e => {
    const index = e.y >= 0 && e.y < props.rows.length && e.x >= 0 && e.x < props.width ? e.y : undefined
    const isSkill = index !== undefined && props.rows[index]?.kind === 'skill'
    if (e.type === 'up' && e.button === 'left' && isSkill) return cast(index)
    if (e.type === 'leave') return state.hover === undefined ? undefined : surface.setState({ ...state, hover: undefined })
    const hover = isSkill ? index : undefined
    if (e.type === 'move' && state.hover !== hover) surface.setState({ ...state, hover })
  })

  // Up and down walk the skills, Enter casts the one under the cursor.
  surface.onKey(e => {
    const skills = props.rows.flatMap((row, index) => (row.kind === 'skill' ? [index] : []))
    if (skills.length === 0) return
    const at = state.hover === undefined ? -1 : skills.indexOf(state.hover)
    if (e.key === 'down') surface.setState({ ...state, hover: skills[(at + 1) % skills.length] })
    if (e.key === 'up') surface.setState({ ...state, hover: skills[(at - 1 + skills.length) % skills.length] })
    if (e.key === 'return' && state.hover !== undefined) cast(state.hover)
  })

  const stars = (uses: number) => {
    const shown = ['★', '★', '★'].map((star, at) => (uses >= [1, 3, 10][at]! ? star : '☆'))
    // Full mastery: a glint runs along the three stars.
    const glint = uses >= 10 ? Math.floor(tick) % 3 : -1
    return shown.map((star, at) => (
      <Text key={`s${at}`} color={at === glint ? 'white' : 'yellow'} bold={at === glint} dimColor={uses === 0}>
        {star}
      </Text>
    ))
  }

  const skillRow = (row: Extract<SkillRow, { kind: 'skill' }>, index: number) => {
    const isHover = state.hover === index
    const f = state.cast?.name === row.name ? tick - state.cast.start : -1
    const isCasting = f >= 0 && f <= CAST_TICKS
    if (isCasting && f < FLASH_TICKS) {
      return (
        <Text key={`row-${index}`} bold color="black" backgroundColor="yellow">
          {fit(`  ✦ ${row.name}`, props.width - RIGHT) + fit('  CAST!', RIGHT)}
        </Text>
      )
    }
    const cursor = isHover || isCasting ? (tick % 2 === 0 ? '▶ ' : '▷ ') : '  '
    const glow = row.isGlowing ? (tick % 2 === 0 ? '✦ ' : '✧ ') : '  '
    const name = fit(row.name, nameWidth)
    let right
    if (isCasting) {
      right = (
        <Text color={f % 2 === 0 ? 'yellow' : 'magenta'} bold>
          {fit(' → prompt', RIGHT)}
        </Text>
      )
    } else if (isHover) {
      right = <Text color="yellow">{fit(' ⏎ cast', RIGHT)}</Text>
    } else {
      right = <Text dimColor>{fit(row.uses > 0 ? ` ×${row.uses}` : '', RIGHT)}</Text>
    }
    return (
      <Box key={`row-${index}`} flexDirection="row" height={1}>
        <Text color="yellow">{cursor}</Text>
        <Text color={tick % 2 === 0 ? 'yellow' : 'white'}>{glow}</Text>
        {stars(row.uses)}
        <Text> </Text>
        {isCasting ? (
          <Text color="yellow">{fit(sparkleTrail(nameWidth, f), nameWidth)}</Text>
        ) : (
          <Text bold={isHover || row.isGlowing} color={isHover ? 'cyan' : undefined} dimColor={!isHover && row.uses === 0}>
            {name}
          </Text>
        )}
        {right}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" width={props.width}>
      {props.rows.map((row, index) => {
        switch (row.kind) {
          case 'skill':
            return skillRow(row, index)
          case 'school':
            return (
              <Text key={`row-${index}`} bold color="blue">
                ❖ {row.text}
              </Text>
            )
          case 'gear-title':
            return (
              <Text key={`row-${index}`} bold color="magenta">
                🛡 Equipment <Text dimColor>{row.count} MCP servers</Text>
              </Text>
            )
          case 'gear':
            return (
              <Text key={`row-${index}`} wrap="truncate">
                <Text color={row.isLoaded ? 'magenta' : 'gray'}>{row.isLoaded ? '  ⚔ ' : '  · '}</Text>
                <Text dimColor={!row.isLoaded}>{row.server}</Text>
                <Text dimColor> {row.tools} tools</Text>
              </Text>
            )
          case 'note':
            return (
              <Text key={`row-${index}`} dimColor>
                {row.text}
              </Text>
            )
          default:
            return <Text key={`row-${index}`}> </Text>
        }
      })}
    </Box>
  )
}

export default Skills
