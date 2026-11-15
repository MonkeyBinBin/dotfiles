import type { AgentInfo, EngineInterface, Register, Timer } from 'claude-code'

// Key hints above the prompt, in helm-spinner's pill style: the key in gold, an icon, a short word. Which keys depends on what's
// going on: idle, a turn running, or background agents still out. Keys are the engine's defaults (no keybindings.json).

export type Mode = 'idle' | 'working' | 'agents'
// `isFamiliar`: readline keys whose word goes first when the row runs short.
export type Hint = { key: string; icon: string; word: string; isDanger?: true; isFamiliar?: true }

const INK = { pill: '#173b42', text: '#a8e8c4', gold: '#f0d07a', danger: '#ff9a8a' }
const LEFT_CAP = ''
const RIGHT_CAP = ''
const LOOK_MS = 2000 // how often background agents are counted while the band isn't redrawn by a turn
const LIVE: ReadonlySet<AgentInfo['status']> = new Set(['pending', 'running', 'waiting'])

export const HINTS: Record<Mode, Hint[]> = {
  idle: [
    { key: '^G', icon: '\uf044', word: 'editor' },
    { key: '^S', icon: '\uf187', word: 'stash' },
    { key: '^R', icon: '\uf1da', word: 'history' },
    { key: 'esc esc', icon: '\uf04a', word: 'rewind' },
    { key: '?', icon: '\uf11c', word: 'keys' },
    { key: '^W', icon: '\uf12d', word: 'del word', isFamiliar: true },
    { key: '^Y', icon: '\uf0ea', word: 'paste', isFamiliar: true },
    { key: '^_', icon: '\uf0e2', word: 'undo', isFamiliar: true },
    { key: '^Z', icon: '\uf04c', word: 'suspend', isFamiliar: true },
  ],
  working: [
    { key: 'esc', icon: '', word: 'stop' },
    { key: '^B', icon: '', word: 'bg' },
    { key: '^X⏎', icon: '', word: 'queue' },
    { key: '^⏎', icon: '', word: 'now' },
    { key: '^O', icon: '', word: 'log' },
  ],
  agents: [
    { key: '^X^K', icon: '', word: 'kill', isDanger: true },
    { key: '^T', icon: '', word: 'todos' },
    { key: '^O', icon: '', word: 'log' },
  ],
}

export function modeOf(isWorking: boolean, agents: readonly AgentInfo[]): Mode {
  if (isWorking) return 'working'
  return agents.some(agent => LIVE.has(agent.status)) ? 'agents' : 'idle'
}

// Cells a pill takes: two caps, the pad before the key, the key and its blank, the icon and the blank after it (Ghostty widens
// the icon over that blank), the word, the closing pad. Pills sit one cell apart.
const widthOf = (hint: Hint, withWord: boolean) => hint.key.length + 7 + (withWord ? hint.word.length : 0)

export type Words = 'all' | 'unfamiliar' | 'none'
const showsWord = (hint: Hint, words: Words) => words === 'all' || (words === 'unfamiliar' && !hint.isFamiliar)
const rowWidth = (hints: readonly Hint[], words: Words) =>
  hints.reduce((sum, hint) => sum + widthOf(hint, showsWord(hint, words)), 0) + Math.max(0, hints.length - 1)

export type Layout = { shown: readonly Hint[]; words: Words }

// Always one row. As it runs short: the familiar keys' words go, then the familiar keys themselves, then the remaining words,
// then pills from the end until the rest fit.
export function layoutFor(hints: readonly Hint[], columns: number): Layout {
  const unfamiliar = hints.filter(hint => !hint.isFamiliar)
  const tries: Layout[] = [
    { shown: hints, words: 'all' },
    { shown: hints, words: 'unfamiliar' },
    { shown: unfamiliar, words: 'all' },
  ]
  for (const layout of tries) if (rowWidth(layout.shown, layout.words) <= columns) return layout
  let shown = unfamiliar
  while (shown.length > 0 && rowWidth(shown, 'none') > columns) shown = shown.slice(0, -1)
  return { shown, words: 'none' }
}

let drawnMode: Mode | undefined
let ticker: Timer | undefined

const agentsNow = ($: EngineInterface) => $.agent.list().catch(() => [] as AgentInfo[])

// An agent ending between turns redraws nothing by itself.
async function look($: EngineInterface) {
  if (drawnMode === 'working') return
  const mode = modeOf(false, await agentsNow($))
  if (mode !== drawnMode) $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    // Other band mods (slime-band) draw beneath: keep what they drew, the hints under it.
    const below = await next(e)
    ticker ??= $.clock.every(LOOK_MS, () => void look($).catch(() => undefined))
    const mode = modeOf(e.props.isWorking, await agentsNow($))
    drawnMode = mode
    const { shown, words } = layoutFor(HINTS[mode], e.props.bodyColumns)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
      {below}
      {/* Pills never shrink: one squeezed by the row wraps its own text onto a second line. */}
      <Box flexDirection="row" columnGap={1} marginTop={1} overflow="hidden">
        {shown.map(hint => (
          <Box key={hint.key} flexDirection="row" flexShrink={0}>
            <Text color={INK.pill}>{LEFT_CAP}</Text>
            <Text backgroundColor={INK.pill}> </Text>
            <Text color={hint.isDanger ? INK.danger : INK.gold} backgroundColor={INK.pill}>{hint.key} </Text>
            <Text color={INK.text} backgroundColor={INK.pill}>{hint.icon} </Text>
            {showsWord(hint, words) ? <Text color={INK.text} backgroundColor={INK.pill}>{hint.word}</Text> : null}
            <Text backgroundColor={INK.pill}> </Text>
            <Text color={INK.pill}>{RIGHT_CAP}</Text>
          </Box>
        ))}
      </Box>
      </Box>
    )
  })
}
