import type { BagItem, GitMap } from '../types'

// `## main...origin/main [ahead 1, behind 2]`, or `## HEAD (no branch)` when detached.
export const parseStatus = (porcelain: string): Omit<GitMap, 'isRepo' | 'graph'> => {
  const lines = porcelain.split('\n').filter(line => line.length > 0)
  const head = lines[0]?.startsWith('## ') ? (lines.shift() ?? '') : ''
  const branch = head.slice(3).split('...')[0]?.replace(/^No commits yet on /, '') ?? ''
  const ahead = Number(/ahead (\d+)/.exec(head)?.[1] ?? 0)
  const behind = Number(/behind (\d+)/.exec(head)?.[1] ?? 0)
  return { branch, ahead, behind, dirty: lines.length }
}

export type GraphRow = {
  graph: string
  hash: string
  refs: string
  age: string
  subject: string
  isHead: boolean
  // The remote-tracking branches that point here (`origin/main`), without `origin/HEAD`.
  remotes: string[]
}

// Fields after the graph's lanes, split by the unit separator.
const SEP = '\x1f'
const ROW = new RegExp(`^([*|\\\\/_ .-]*?)([0-9a-f]{7,40})${SEP}([^${SEP}]*)${SEP}([^${SEP}]*)${SEP}(.*)$`)

// One `git log --graph` line in GIT_LOG's format; a connector-only line has no hash.
export const parseGraphLine = (line: string): GraphRow => {
  const match = ROW.exec(line)
  if (match === null) return { graph: line, hash: '', refs: '', age: '', subject: '', isHead: false, remotes: [] }
  const refs = match[3] ?? ''
  const names = refs.split(',').map(ref => ref.trim()).filter(ref => ref.length > 0)
  return {
    graph: match[1] ?? '',
    hash: match[2] ?? '',
    refs,
    age: shortAge(match[4] ?? ''),
    subject: match[5] ?? '',
    isHead: names.some(ref => ref === 'HEAD' || ref.startsWith('HEAD -> ')),
    remotes: names.filter(ref => /^[\w.-]+\/[\w./-]+$/.test(ref) && !ref.endsWith('/HEAD') && !ref.startsWith('tag:')),
  }
}

// `3 hours ago` → `3h`, `2 weeks ago` → `2w`; anything else as git wrote it.
export const shortAge = (age: string): string => {
  const match = /^(\d+) (second|minute|hour|day|week|month|year)s? ago$/.exec(age.trim())
  if (match === null) return age.replace(/ ago$/, '')
  const unit = { second: 's', minute: 'm', hour: 'h', day: 'd', week: 'w', month: 'mo', year: 'y' }[match[2] ?? 'day']
  return `${match[1]}${unit}`
}

// A history with no fork or merge in sight: every line is a lone commit.
export const isLinear = (rows: readonly GraphRow[]): boolean =>
  rows.length > 0 && rows.every(row => row.hash !== '' && row.graph.trim() === '*')

export const GRAPH_LIMIT = 40

export const GIT_LOG = [
  'git',
  'log',
  '--graph',
  '--color=never',
  '--all',
  `-n${GRAPH_LIMIT}`,
  `--format=%h${SEP}%D${SEP}%cr${SEP}%s`,
]
export const GIT_STATUS = ['git', 'status', '--porcelain=v1', '--branch', '--untracked-files=all']

export const GIT_NUMSTAT = ['git', 'diff', '--numstat', 'HEAD']

// Paths from a porcelain line's tail: `a.ts`, `"with space.ts"` or `old.ts -> new.ts` (the new one).
const porcelainPath = (tail: string): string => {
  const path = tail.includes(' -> ') ? (tail.split(' -> ').pop() ?? tail) : tail
  return path.replace(/^"(.*)"$/, '$1')
}

const STATUS_OF: Record<string, BagItem['status']> = { M: 'M', A: 'A', D: 'D', R: 'R', C: 'A', '?': '?', U: 'M', T: 'M' }

// The bag from `git status --porcelain=v1 --branch` and `git diff --numstat HEAD`: one item per changed path.
export const parseBag = (porcelain: string, numstat: string): BagItem[] => {
  const counts = new Map<string, { added: number; removed: number; isBinary: boolean }>()
  for (const line of numstat.split('\n')) {
    const [added, removed, ...rest] = line.split('\t')
    if (added === undefined || removed === undefined || rest.length === 0) continue
    const path = rest.join('\t').replace(/^(.*)\{(.*) => (.*)\}(.*)$/, '$1$3$4').replace(/^.* => /, '')
    const isBinary = added === '-'
    counts.set(path, { added: isBinary ? 0 : Number(added), removed: isBinary ? 0 : Number(removed), isBinary })
  }
  return porcelain
    .split('\n')
    .filter(line => line.length > 3 && !line.startsWith('## '))
    .map(line => {
      const code = line.slice(0, 2)
      const path = porcelainPath(line.slice(3))
      const letter = code === '??' ? '?' : (code.trim()[0] ?? 'M')
      const count = counts.get(path) ?? { added: 0, removed: 0, isBinary: false }
      return { path, status: STATUS_OF[letter] ?? 'M', ...count }
    })
}

// What `git diff` prints for one bag item: against HEAD, or against nothing for a file git does not track yet.
export const diffArgv = (item: Pick<BagItem, 'path' | 'status'>): string[] =>
  item.status === '?'
    ? ['git', 'diff', '--no-color', '--no-index', '--', '/dev/null', item.path]
    : ['git', 'diff', '--no-color', 'HEAD', '--', item.path]
