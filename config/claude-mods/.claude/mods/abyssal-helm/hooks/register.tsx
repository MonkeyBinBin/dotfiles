import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import type { Dive } from '../types'
import { HIGH_QUOTA, LOW_OXYGEN, clockOf, durationText, gitOf, gitText, oxygenOf, quotaOf } from './band'
import { palette } from './palette'
import { SCENE } from './scene'

// The whole look is desktop-only: terminal, VS Code and mobile keep the stock UI.
const DESKTOP = 'desktop'

const dive = atom({ plugin: 'abyssal-helm', key: 'dive' } as const, null)

const LOOK: ThemeSetArgs = {
  colors: palette.theme,
  backdrop: { scene: 'abyssal-sonar', glass: { blur: 14, tint: '#07121a', opacity: 0.72 } },
}

// Tools that can change the working tree; git is re-read after them.
const TREE_TOOLS = new Set(['Bash', 'Edit', 'Write', 'NotebookEdit', 'MultiEdit'])

// Gauges the band reads. Each one is optional: a failed read leaves that gauge blank.
async function readGauges($: EngineInterface, withGit: boolean): Promise<Partial<Dive>> {
  const usage = await $.session.usage().catch(() => null)
  const out: Partial<Dive> = {
    oxygen: oxygenOf(usage?.context.percent),
    quota: usage === null ? null : quotaOf(usage.rateLimits),
  }

  if (withGit) {
    const res = await $.process.run(['git', 'status', '--porcelain=v2', '--branch'], { timeoutMs: 5000 }).catch(() => null)
    out.git = res === null || res.exitCode !== 0 ? null : gitOf(res.stdout)
  }

  return out
}

async function refresh($: EngineInterface, withGit: boolean, patch: Partial<Dive> = {}) {
  const gauges = await readGauges($, withGit)
  await update($, dive, (d): Dive => ({
    phase: d?.phase ?? 'surfaced',
    oxygen: null,
    quota: null,
    git: null,
    seconds: null,
    ...d,
    ...gauges,
    ...patch,
  })).catch(() => {})
}

const lineCount = (out: unknown): number | null => {
  const o = out as { stdout?: unknown } | undefined

  if (o === undefined || typeof o.stdout !== 'string') {
    return null
  }

  return o.stdout.length === 0 ? 0 : o.stdout.trimEnd().split('\n').length
}

export const register: Register = on => {
  let startedAt = 0

  on('session.start', async ($, e, next) => {
    const blocking = palette.problems.find(line => line.startsWith("Desktop won't paint"))

    if (blocking !== undefined) {
      $.ui.toast(blocking)
    }
    // Only the desktop app paints looks; elsewhere isDrawn is false and we stay silent.
    await $.theme.set(LOOK)
    await refresh($, true)

    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== DESKTOP) {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)

    return <Svg source={SCENE} alt="Sonar rings pulsing over slowly drifting marine snow as a submarine cruises past" />
  })

  on('prompt.submit', async ($, e, next) => {
    // Never gate the prompt on the band: a failed read or write is dropped.
    startedAt = await $.clock.now().catch(() => Date.now())
    await refresh($, false, { phase: 'dive', seconds: null })

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    await refresh($, TREE_TOOLS.has(e.tool))

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const seconds = Math.round(((await $.clock.now()) - startedAt) / 1000)
    await refresh($, true, { phase: 'surfaced', seconds })

    return next(e)
  })

  // Mission band above the prompt: the agent's state as a dive log.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== DESKTOP) {
      return next(e)
    }
    const d = await read($, dive)

    if (e.props.hasSurvey || d === null) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    const isDiving = d.phase === 'dive'
    const reset = clockOf(d.quota?.resetsAt ?? null)

    return (
      <Box flexDirection="row" gap={1}>
        <Text color={isDiving ? '#2ee6d6' : '#83a0a8'} bold>
          {isDiving ? '▼ 下潛中' : '▲ 已上浮'}
        </Text>
        {d.oxygen !== null && (
          <Text color={d.oxygen <= LOW_OXYGEN ? '#ff6b6b' : undefined} dimColor={d.oxygen > LOW_OXYGEN}>
            · 氧氣 {d.oxygen}%
          </Text>
        )}
        {d.quota !== null && (
          <Text color={d.quota.percent >= HIGH_QUOTA ? '#f0b352' : undefined} dimColor={d.quota.percent < HIGH_QUOTA}>
            · 5h 配額 {d.quota.percent}%{reset !== null ? `（${reset} 重置）` : ''}
          </Text>
        )}
        {d.git !== null && <Text dimColor>· {gitText(d.git)}</Text>}
        {d.seconds !== null && <Text dimColor>· 航時 {durationText(d.seconds)}</Text>}
      </Box>
    )
  })

  // Tool rows read as sonar sweeps; Bash rows read as a gauge.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const row = await next(e)

    if (e.surface !== DESKTOP || e.props.isInterrupted) {
      return row
    }
    const { Box, Text } = $.ui.resolve(e)
    const p = e.props
    let label: string
    let color: string

    if (p.isRunning) {
      label = p.tool === 'Bash' ? '◌ 儀表讀取中…' : '◌ 聲納掃描中…'
      color = '#2ee6d6'
    } else if (p.isErrored) {
      label = '✕ 無回波'
      color = '#ff6b6b'
    } else if (p.tool === 'Bash') {
      const lines = lineCount(p.output)
      label = lines === null ? '▮ 儀表讀數' : `▮ 儀表讀數 · ${lines} 行`
      color = '#83a0a8'
    } else {
      label = '◉ 回波已接收'
      color = '#83a0a8'
    }

    return (
      <Box flexDirection="column">
        {row}
        <Text color={color} dimColor={!p.isRunning}>
          {label}
        </Text>
      </Box>
    )
  })
}
