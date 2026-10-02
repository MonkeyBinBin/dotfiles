export type BandInfo = {
  branch: string
  dirty: number
  lastMs: number
  inTokens: number
  outTokens: number
}

declare module 'claude-code' {
  interface PluginState {
    'slime-band': { info: BandInfo }
  }
}
