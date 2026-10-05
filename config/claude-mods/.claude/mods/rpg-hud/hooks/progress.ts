import type { Progress } from '../types'

export const EMPTY_PROGRESS: Progress = { skillUses: {} }

// The progress a store holds, without the figures older builds kept beside it: a save writes back this alone.
export const progressOf = (stored: Partial<Progress> | undefined): Progress => ({ skillUses: stored?.skillUses ?? {} })
