import type { BagItem, GitMap, Outpost } from '../types'

// `## main...origin/main [ahead 1, behind 2]`, or `## HEAD (no branch)` when detached.
export const parseStatus = (porcelain: string): Omit<GitMap, 'isRepo' | 'graph' | 'remotes'> => {
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
// `remoteNames` (`git remote`) tells a remote-tracking ref (`origin/main`) from a local branch with a slash (`feat/x`).
export const parseGraphLine = (line: string, remoteNames: readonly string[] = ['origin']): GraphRow => {
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
    remotes: names.filter(ref => remoteNames.some(remote => ref.startsWith(`${remote}/`)) && !ref.endsWith('/HEAD')),
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
export const GIT_REMOTES = ['git', 'remote']
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

export const GIT_WORKTREES = ['git', 'worktree', 'list', '--porcelain']

export type WorktreeEntry = Pick<Outpost, 'path' | 'name' | 'branch' | 'isMain' | 'isLocked' | 'isPrunable'>

// `git worktree list --porcelain`: one block per worktree, the main one first. A bare repository's own entry
// is left out, and then no worktree is the main one: every one of them is linked.
export const parseWorktrees = (text: string): WorktreeEntry[] => {
  const blocks = text
    .split(/\n\s*\n/)
    .map(block => block.split('\n').filter(line => line.length > 0))
    .filter(lines => lines[0]?.startsWith('worktree '))
  const isBare = blocks[0]?.includes('bare') === true
  return blocks
    .filter(lines => !lines.includes('bare'))
    .map((lines, index) => {
      const path = (lines[0] ?? '').slice('worktree '.length)
      const branch = lines.find(line => line.startsWith('branch '))?.slice('branch '.length).replace(/^refs\/heads\//, '') ?? ''
      return {
        path,
        name: path.split('/').filter(part => part.length > 0).pop() ?? path,
        branch,
        isMain: !isBare && index === 0,
        isLocked: lines.some(line => line === 'locked' || line.startsWith('locked ')),
        isPrunable: lines.some(line => line === 'prunable' || line.startsWith('prunable ')),
      }
    })
}

// A worktree's status, numstat and last commit, run from its own folder.
export const outpostArgv = {
  status: (path: string) => ['git', '-C', path, ...GIT_STATUS.slice(1)],
  numstat: (path: string) => ['git', '-C', path, ...GIT_NUMSTAT.slice(1)],
  age: (path: string) => ['git', '-C', path, 'log', '-1', '--format=%cr'],
}
