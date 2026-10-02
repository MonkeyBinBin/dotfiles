export type SkillNames = string[]

declare module 'claude-code' {
  interface PluginState {
    'skill-bar': { skills: SkillNames }
  }
}
