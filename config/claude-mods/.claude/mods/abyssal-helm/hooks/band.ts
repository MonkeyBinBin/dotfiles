import type { SessionRateLimit } from 'claude-code'

import type { Git, Quota } from '../types'

// Oxygen is the context left: it runs out as the window fills.
export const oxygenOf = (percentUsed: number | undefined): number | null =>
  percentUsed === undefined ? null : Math.max(0, Math.round(100 - percentUsed))

export const LOW_OXYGEN = 20
export const HIGH_QUOTA = 80

export const quotaOf = (limits: readonly SessionRateLimit[]): Quota | null => {
  const five = limits.find(l => l.kind === 'five_hour')

  return five === undefined ? null : { percent: Math.round(five.percentUsed), resetsAt: five.resetsAt ?? null }
}

// `git status --porcelain=v2 --branch`: header lines start with `#`, every other line is one changed path.
export const gitOf = (stdout: string): Git | null => {
  let branch: string | null = null
  let ahead = 0
  let behind = 0
  let dirty = 0

  for (const line of stdout.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      branch = line.slice('# branch.head '.length)
    } else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(line)
      ahead = m === null ? 0 : Number(m[1])
      behind = m === null ? 0 : Number(m[2])
    } else if (line.length > 0 && !line.startsWith('#')) {
      dirty += 1
    }
  }

  return branch === null ? null : { branch, ahead, behind, dirty }
}

const pad = (n: number) => String(n).padStart(2, '0')

export const clockOf = (iso: string | null): string | null => {
  if (iso === null) {
    return null
  }
  const d = new Date(iso)

  return Number.isNaN(d.getTime()) ? null : `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const gitText = (g: Git): string => {
  const parts = [`⎇ ${g.branch}`]

  if (g.ahead > 0) {
    parts.push(`↑${g.ahead}`)
  }
  if (g.behind > 0) {
    parts.push(`↓${g.behind}`)
  }
  if (g.dirty > 0) {
    parts.push(`●${g.dirty}`)
  }

  return parts.join(' ')
}

export const durationText = (seconds: number): string =>
  seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${pad(seconds % 60)}s`
