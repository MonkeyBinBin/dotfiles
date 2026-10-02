export type ToolCallStatus = 'run' | 'ok' | 'err'

export type ToolCall = {
  id: string
  tool: string
  summary: string
  startedAt: number
  ms?: number
  status: ToolCallStatus
}

declare module 'claude-code' {
  interface PluginState {
    'tool-calls': { calls: ToolCall[]; logOffset: number }
  }
}
