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
// Words before the program itself: launchers and wrappers.
const LAUNCHERS = new Set(['npx', 'bunx', 'pnpx', 'exec', 'dlx', 'time', 'env', 'sudo', 'nice'])

// A package script's kind by its name: `test`, `test:unit`, `lint:fix`, `typecheck`, `e2e`.
const scriptKind = (script: string): string | undefined => {
  if (/^(e2e|test:e2e)\b/.test(script)) return 'e2e'
  if (/^test\b/.test(script)) return 'test'
  if (/^lint\b/.test(script)) return 'lint'
  if (/^(typecheck|type-check|check-types|tsc)\b/.test(script)) return 'types'
  return undefined
}

// The check one simple command runs, read from the program it starts, never from words in its arguments:
// `grep test` or `ls tests/` run no check.
const kindOf = (segment: string): string | undefined => {
  const words = segment.trim().split(/\s+/).filter(word => !/^\w+=/.test(word))
  while (words.length > 0 && (LAUNCHERS.has(words[0] ?? '') || (PACKAGE_MANAGERS.has(words[0] ?? '') && words[1] === 'exec'))) {
    words.shift()
  }
  const [program = '', first = '', second = ''] = words.map(word => word.replace(/^.*\//, ''))
  if (RUNNERS[program] !== undefined) return RUNNERS[program]
  if (/^python3?$/.test(program) && first === '-m') return RUNNERS[second]
  if (SUBCOMMANDS[program] !== undefined) return SUBCOMMANDS[program][first]
  if (PACKAGE_MANAGERS.has(program)) return scriptKind(first === 'run' ? second : first)
  return undefined
}

// The check a shell command runs, if any: the first one among its `&&`, `||`, `;` and `|` parts.
export const bossFor = (command: string): { kind: string; name: string } | undefined => {
  for (const segment of command.split(/&&|\|\||;|\||\n/)) {
    const kind = kindOf(segment)
    if (kind !== undefined) return { kind, name: BOSS_NAMES[kind] ?? 'Bug Hydra' }
  }
  return undefined
}

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

// One guarded run against the current boss: a failure spawns or heals it, a pass of the same kind slays it.
export const fightBoss = (current: Boss | null, command: string, isError: boolean, output: string): BossTurn => {
  const found = bossFor(command)
  if (found === undefined) return { boss: current }
  if (!isError) {
    if (current !== null && current.kind === found.kind) return { boss: null, event: 'defeat' }
    return { boss: current }
  }
  const hp = countFailures(output)
  if (current === null || current.kind !== found.kind) {
    return { boss: { ...found, hp, maxHp: hp, command }, event: 'appear' }
  }
  return {
    boss: { ...current, hp, maxHp: Math.max(current.maxHp, hp), command },
    event: hp < current.hp ? 'hit' : undefined,
  }
}
