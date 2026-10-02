import type { Boss } from '../types'

// Checks the bosses guard, most specific first; `kind` pairs a failing run with the run that clears it.
const BOSSES: readonly { kind: string; name: string; pattern: RegExp }[] = [
  { kind: 'e2e', name: 'Phantom Browser', pattern: /\b(playwright|cypress)\b/ },
  { kind: 'types', name: 'Type Wraith', pattern: /\b(tsc|typecheck|type-check|mypy|pyright)\b/ },
  { kind: 'lint', name: 'Lint Goblin', pattern: /\b(eslint|lint|biome|ruff|stylelint|shellcheck)\b/ },
  { kind: 'test', name: 'Bug Hydra', pattern: /\b(test|tests|vitest|jest|pytest|mocha|spec)\b/ },
]

export const bossFor = (command: string): { kind: string; name: string } | undefined =>
  BOSSES.find(boss => boss.pattern.test(command))

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
