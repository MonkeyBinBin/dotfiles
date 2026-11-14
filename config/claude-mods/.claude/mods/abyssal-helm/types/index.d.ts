export type Quota = {
  percent: number
  resetsAt: string | null
}

export type Git = {
  branch: string
  ahead: number
  behind: number
  dirty: number
}

export type Dive = {
  phase: 'dive' | 'surfaced'
  oxygen: number | null
  quota: Quota | null
  git: Git | null
  seconds: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'abyssal-helm': { dive: Dive | null }
  }
}
