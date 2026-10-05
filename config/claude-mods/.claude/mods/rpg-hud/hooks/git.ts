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
  hash: string
  // The parents' full hashes: none for a root, two or more for a merge.
  parents: string[]
  refs: string
  age: string
  subject: string
  isHead: boolean
  // The remote-tracking branches that point here (`origin/main`), without `origin/HEAD`.
  remotes: string[]
}

// Fields of one GIT_LOG line, split by the unit separator.
const SEP = '\x1f'

// One `git log` line in GIT_LOG's format: full hash, parents, refs, age, subject.
// `remoteNames` (`git remote`) tells a remote-tracking ref (`origin/main`) from a local branch with a slash (`feat/x`).
export const parseLogLine = (line: string, remoteNames: readonly string[] = ['origin']): GraphRow => {
  const [hash = '', parents = '', refs = '', age = '', ...subject] = line.split(SEP)
  const names = refs.split(',').map(ref => ref.trim()).filter(ref => ref.length > 0)
  return {
    hash,
    parents: parents.split(' ').filter(parent => parent.length > 0),
    refs,
    age: shortAge(age),
    subject: subject.join(SEP),
    isHead: names.some(ref => ref === 'HEAD' || ref.startsWith('HEAD -> ')),
    remotes: names.filter(ref => remoteNames.some(remote => ref.startsWith(`${remote}/`)) && !ref.endsWith('/HEAD')),
  }
}

// GIT_LOG's lines as commits; a line in any other shape (a graph kept from an older format) is left out.
export const parseLog = (lines: readonly string[], remoteNames?: readonly string[]): GraphRow[] =>
  lines.map(line => parseLogLine(line, remoteNames)).filter(row => /^[0-9a-f]{7,64}$/.test(row.hash))

// `3 hours ago` → `3h`, `2 weeks ago` → `2w`; anything else as git wrote it.
export const shortAge = (age: string): string => {
  const match = /^(\d+) (second|minute|hour|day|week|month|year)s? ago$/.exec(age.trim())
  if (match === null) return age.replace(/ ago$/, '')
  const unit = { second: 's', minute: 'm', hour: 'h', day: 'd', week: 'w', month: 'mo', year: 'y' }[match[2] ?? 'day']
  return `${match[1]}${unit}`
}

// A history with no fork or merge in sight: each commit's one parent is the next one shown.
export const isLinear = (rows: readonly GraphRow[]): boolean =>
  rows.length > 0 &&
  rows.every((row, index) => {
    const next = rows[index + 1]
    return row.parents.length <= 1 && (next === undefined || row.parents[0] === next.hash)
  })

export const GRAPH_LIMIT = 40

export const GIT_LOG = [
  'git',
  'log',
  '--color=never',
  '--all',
  // Each branch's commits together, children before their parents: what the lane layout draws from.
  '--topo-order',
  `-n${GRAPH_LIMIT}`,
  `--format=%H${SEP}%P${SEP}%D${SEP}%cr${SEP}%s`,
]
export const GIT_REMOTES = ['git', 'remote']
// Paths as written (日記.md), not C-escaped ("\346\227\245…"), so they match between commands and on disk.
const RAW_PATHS = ['-c', 'core.quotePath=false']

export const GIT_STATUS = ['git', ...RAW_PATHS, 'status', '--porcelain=v1', '--branch', '--untracked-files=all']

export const GIT_NUMSTAT = ['git', ...RAW_PATHS, 'diff', '--numstat', 'HEAD']

// Paths from a porcelain line's tail: `a.ts`, `"with space.ts"` or `old.ts -> new.ts` (the new one).
// A control character left in a name (git still quotes those) would make the whole drawing invalid: it shows as ?.
const porcelainPath = (tail: string): string => {
  const path = tail.includes(' -> ') ? (tail.split(' -> ').pop() ?? tail) : tail
  return path.replace(/^"(.*)"$/, '$1').replace(/[\u0000-\u001f\u007f]/g, '?')
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
    ? ['git', ...RAW_PATHS, 'diff', '--no-color', '--no-index', '--', '/dev/null', item.path]
    : ['git', ...RAW_PATHS, 'diff', '--no-color', 'HEAD', '--', item.path]

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
