// Why this session is waiting on the person, and since when (`$.clock.now()` ms).
export type Sos = { reason: string; since: number }

// What the session is up to, as helm-spinner draws it and the Herdr app's labels carry it.
export type Live = {
  op: string // the kind of work of the main loop's latest tool call this turn: edit bash read web agent gear, or ''
  hull: number // main loop tool calls failed in a row
  o2: number // context window used, percent
  fuel: number // the fullest rate-limit window, percent
}

declare module 'claude-code' {
  interface PluginState {
    'helm-bridge': {
      sos: Sos | null
      live: Live
    }
  }
}
