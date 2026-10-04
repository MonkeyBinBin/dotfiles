export type BandInfo = {
  branch: string
  dirty: number
  lastMs: number
  inTokens: number
  outTokens: number
}

// One /context row (the SDK's ContextCategory), its colour a theme key. The
// contract must stand alone, so register.tsx's mapping and context-bar.ts's
// GLYPH table are what tsc holds to the SDK's kinds.
export type ContextSlice = {
  name: string
  tokens: number
  color: string
  kind: 'used' | 'free' | 'buffer' | 'deferred'
}

export type ContextInfo = {
  slices: ContextSlice[]
  total: number
  max: number
  percent: number
  // Tokens at which auto-compaction runs; absent when it is off.
  compactAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    'slime-band': { info: BandInfo; context: ContextInfo }
  }
}
