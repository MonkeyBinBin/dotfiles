import type { Boss } from '../types'

const BOSS_NAMES: Record<string, string> = {
  e2e: 'Phantom Browser',
  types: 'Type Wraith',
  lint: 'Lint Goblin',
  test: 'Bug Hydra',
}

// Programs that are a check by themselves, to the kind of boss they guard.
const RUNNERS: Record<string, string> = {
  playwright: 'e2e', cypress: 'e2e',
  tsc: 'types', 'vue-tsc': 'types', mypy: 'types', pyright: 'types',
  eslint: 'lint', stylelint: 'lint', shellcheck: 'lint', ruff: 'lint', biome: 'lint', 'golangci-lint': 'lint',
  vitest: 'test', jest: 'test', pytest: 'test', mocha: 'test', ava: 'test', rspec: 'test', phpunit: 'test', karma: 'test',
}

// Tools whose `test` / `lint` subcommand is the check: `go test`, `ng lint`.
const SUBCOMMANDS: Record<string, Record<string, string>> = {
  go: { test: 'test', vet: 'lint' },
  cargo: { test: 'test', clippy: 'lint', check: 'types' },
  dotnet: { test: 'test' },
  ng: { test: 'test', lint: 'lint', e2e: 'e2e' },
  deno: { test: 'test', lint: 'lint', check: 'types' },
}

const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun'])
// Words before the program itself: launchers and wrappers, their own flags skipped after them.
const LAUNCHERS = new Set(['npx', 'bunx', 'pnpx', 'time', 'env', 'sudo', 'nice'])
// Environment managers that start the program after `run`: `uv run pytest`, `poetry run pytest`.
const RUN_WRAPPERS = new Set(['uv', 'poetry', 'pipenv', 'hatch', 'pdm', 'rye'])
// Shell words a simple command may start with before its program: `if git diff --quiet`, `do git add "$f"`.
const SHELL_WORDS = new Set(['if', 'then', 'else', 'elif', 'while', 'until', 'do', '!', '{', '(', 'exec', 'command'])
// Flags that take the next word as their value: `pnpm --filter web test`, `npm --prefix app test`.
const VALUED_FLAGS = new Set(['--filter', '-F', '-C', '--cwd', '--dir', '--prefix', '-w', '--workspace', '-p', '--package'])

// Drops the flags at the front of `words`, with the value of each flag that takes one.
const dropFlags = (words: string[]): string[] => {
  let at = 0
  while (at < words.length && (words[at] ?? '').startsWith('-')) {
    const flag = words[at] ?? ''
    at += VALUED_FLAGS.has(flag) && !flag.includes('=') ? 2 : 1
  }
  return words.slice(at)
}

// A package script's or make target's kind by its name: `test`, `test:unit`, `lint:fix`, `typecheck`, `e2e`.
const scriptKind = (script: string): string | undefined => {
  if (/^(e2e|test:e2e)\b/.test(script)) return 'e2e'
  if (/^test\b/.test(script)) return 'test'
  if (/^lint\b/.test(script)) return 'lint'
  if (/^(typecheck|type-check|check-types|tsc)\b/.test(script)) return 'types'
  return undefined
}

// The program one simple command starts and its arguments, past env assignments, launchers and wrappers.
export const programOf = (segment: string): { program: string; rest: string[] } => {
  // A subshell or group opener glued to the program, `(git status`, is dropped.
  let words = segment.trim().replace(/^[({]+/, '').split(/\s+/).filter(word => word.length > 0 && !/^\w+=/.test(word))
  for (;;) {
    const [head = '', next = ''] = words
    if (SHELL_WORDS.has(head)) words = words.slice(1)
    else if (LAUNCHERS.has(head)) words = dropFlags(words.slice(1))
    else if (RUN_WRAPPERS.has(head) && next === 'run') words = dropFlags(words.slice(2))
    else if (PACKAGE_MANAGERS.has(head) && (next === 'exec' || next === 'dlx')) words = dropFlags(words.slice(2))
    else break
  }
  return { program: (words[0] ?? '').replace(/^.*\//, ''), rest: words.slice(1) }
}

// A shell command's simple commands: its `&&`, `||`, `;`, `|` and newline-separated parts.
const segmentsOf = (command: string): string[] => command.split(/&&|\|\||;|\||\n/)

// Whether any part of a shell command starts `git` itself: `grep git` or `cat .gitignore` do not.
export const runsGit = (command: string): boolean => segmentsOf(command).some(segment => programOf(segment).program === 'git')

// The check one simple command runs, read from the program it starts, never from words in its arguments:
// `grep test` or `ls tests/` run no check.
export const kindOf = (segment: string): string | undefined => {
  const { program, rest } = programOf(segment)
  if (RUNNERS[program] !== undefined) return RUNNERS[program]
  if (/^python3?$/.test(program) && rest[0] === '-m') return RUNNERS[rest[1] ?? '']
  if (program === 'make') return scriptKind(dropFlags(rest)[0] ?? '')
  if (SUBCOMMANDS[program] !== undefined) return SUBCOMMANDS[program][rest[0] ?? '']
  if (PACKAGE_MANAGERS.has(program)) {
    const args = dropFlags(rest)
    const script = (args[0] === 'run' ? dropFlags(args.slice(1))[0] : args[0]) ?? ''
    // `pnpm vitest run` starts the binary itself; `pnpm test` a script.
    return RUNNERS[script] ?? scriptKind(script)
  }
  return undefined
}

type Guard = { kind: string; name: string }

// Every check a shell command runs, in order, each kind once: `npm test && npm run lint` runs two.
export const bossesFor = (command: string): Guard[] => {
  const found: Guard[] = []
  for (const segment of segmentsOf(command)) {
    const kind = kindOf(segment)
    if (kind !== undefined && !found.some(one => one.kind === kind)) found.push({ kind, name: BOSS_NAMES[kind] ?? 'Bug Hydra' })
  }
  return found
}

// The check a shell command runs, if any: the first one among its `&&`, `||`, `;` and `|` parts.
export const bossFor = (command: string): Guard | undefined => bossesFor(command)[0]

// What each kind of check prints when it fails, to tell which of several checks in one command did. Counts start
// at 1, so a passing run's `0 failed` is no sign; lint's warnings alone are none either.
const FAILURE_SIGNS: Record<string, RegExp> = {
  types: /\berror TS\d+|\berror\[E\d+\]|^\S+:\d+: error:/m,
  lint: /\([1-9]\d* errors?\b|^\s*\d+:\d+\s+error\s/m,
  test: /\b[1-9]\d* (?:failed|failing)\b|^\s*FAIL\s|\bFAILED\b/m,
  e2e: /\b[1-9]\d* failed\b|^\s*✘/m,
}

// Programs that only set the scene for a check: `cd app && npm test` fails at the test or not at all.
// The shell's closing words (`fi`, `done`) are no work either.
const SETUP = new Set(['', 'cd', 'pushd', 'popd', 'export', 'source', '.', 'set', 'unset', 'nvm', 'echo', 'true', 'fi', 'done', 'esac', '}', ')'])

// Whether the command's parts all run in an `&&` chain, where exit 0 vouches for every one of them; after `;`,
// `||` or a pipe it vouches for the last part alone.
const isAndChain = (command: string): boolean => !/\|\||;|\||\n/.test(command.trim().replace(/&&/g, ''))

// The check a failed run failed at, and where its output starts. The first check whose failure shows: in an
// `a && b` chain a failed `a` stops `b` from running at all, so a later check matching too is only alike in its
// wording. With no sign the first check, unless the command does other work (`npm test && git push`) that may
// be what failed.
export const failedGuard = (command: string, output: string): { guard: Guard; from: number } | undefined => {
  const found = bossesFor(command)
  for (const guard of found) {
    const at = FAILURE_SIGNS[guard.kind]?.exec(output)?.index
    if (at !== undefined) return { guard, from: output.lastIndexOf('\n', at) + 1 }
  }
  const hasOtherWork = segmentsOf(command).some(part => kindOf(part) === undefined && !SETUP.has(programOf(part).program))
  const first = found[0]
  return first === undefined || hasOtherWork ? undefined : { guard: first, from: 0 }
}

// The kinds of check a passing command vouches for.
const passedKinds = (command: string): string[] => {
  if (isAndChain(command)) return bossesFor(command).map(one => one.kind)
  const kind = kindOf(segmentsOf(command).filter(part => part.trim() !== '').at(-1) ?? '')
  return kind === undefined ? [] : [kind]
}

const WHAT_FAILED: Record<string, string> = {
  e2e: 'end-to-end tests',
  types: 'type errors',
  lint: 'lint errors',
  test: 'failing tests',
}

// The prompt a click on the boss fills in: fix what its command reported.
export const fightText = (boss: Pick<Boss, 'kind' | 'command'>): string =>
  `Fix the ${WHAT_FAILED[boss.kind] ?? 'failures'} from \`${boss.command}\` and run it again until it passes`

const COUNT = /(\d+)\s+(?:failed|failing|failures?|errors?|problems?)\b/gi

// The largest "N failed / N errors" a run printed, or 1 when it failed without saying how badly.
export const countFailures = (output: string): number => {
  let most = 0
  for (const match of output.matchAll(COUNT)) {
    most = Math.max(most, Number(match[1]))
  }
  return most > 0 ? most : 1
}

export type BossTurn = { boss: Boss | null; event?: 'appear' | 'hit' | 'defeat' }

// One guarded run against the current boss: a failure spawns or heals it, its HP counted from the failed check's
// own output on. A passing command slays the boss when it vouches for that boss's kind of check.
export const fightBoss = (current: Boss | null, command: string, isError: boolean, output: string): BossTurn => {
  if (!isError) {
    if (current !== null && passedKinds(command).includes(current.kind)) return { boss: null, event: 'defeat' }
    return { boss: current }
  }
  const failed = failedGuard(command, output)
  if (failed === undefined) return { boss: current }
  const found = failed.guard
  const hp = countFailures(output.slice(failed.from))
  if (current === null || current.kind !== found.kind) {
    return { boss: { ...found, hp, maxHp: hp, command }, event: 'appear' }
  }
  return {
    boss: { ...current, hp, maxHp: Math.max(current.maxHp, hp), command },
    event: hp < current.hp ? 'hit' : undefined,
  }
}
