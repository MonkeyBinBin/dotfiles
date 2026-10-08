// One main-loop turn's calls, live while it runs and kept once it ends.
export type TurnTally = { calls: number; editedFiles: string[]; failed: number; isLive: boolean }

declare module 'claude-code' {
  interface PluginState {
    'rpg-prompt': {
      turn: TurnTally | null
    }
  }
}
