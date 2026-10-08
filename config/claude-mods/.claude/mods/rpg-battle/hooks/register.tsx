import type { Register } from 'claude-code'

// Emoji with default emoji presentation only: no VS16, so every terminal gives them two cells.
const SKILLS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(Bash|BashOutput|KillShell|TaskOutput|TaskStop|Monitor)$/, '🔥'],
  [/^Read$|^NotebookRead$/, '📖'],
  [/^Grep$|^Glob$|^LS$|^ToolSearch$/, '🔍'],
  [/^Edit$|^MultiEdit$|^Write$|^NotebookEdit$/, '🔨'],
  [/^Web(Fetch|Search)$/, '🔭'],
  [/^(Agent|Task|SendMessage)$/, '🧙'],
  [/^Todo|^Task(Create|Update|List|Get)$/, '📜'],
  [/^Skill$/, '✨'],
  [/^mcp__/, '🔮'],
]
const DEFAULT_SKILL = '🎯'
const FAILED = '💀'
const FLED = '🚫'
const GROUP = '🌀'
// Runs this long or longer read as a combo.
export const COMBO_MIN = 3

export const skillIcon = (tool: string): string =>
  SKILLS.find(([pattern]) => pattern.test(tool))?.[1] ?? DEFAULT_SKILL

export const rowIcon = (row: { tool: string; isErrored: boolean; isInterrupted: boolean }): string => {
  if (row.isInterrupted) return FLED
  if (row.isErrored) return FAILED
  return skillIcon(row.tool)
}

// A folded run shows its worst call: fled over failed over the plain group mark.
export const groupIcon = (calls: ReadonlyArray<{ isErrored: boolean; isInterrupted: boolean }>): string => {
  if (calls.some(call => call.isInterrupted)) return FLED
  if (calls.some(call => call.isErrored)) return FAILED
  return GROUP
}

export const comboLabel = (count: number): string | undefined =>
  count >= COMBO_MIN ? ` ×${count} COMBO` : undefined

// The engine's row stays whole; the icon sits in a gutter beside it.
// Engine rows open with a blank spacer row, so the gutter starts one row down to meet the title.
const GUTTER_TOP = 1

export const register: Register = on => {
  // ToolResult carries no isInterrupted: remember the fled calls from their ToolUse rows.
  const fled = new Set<string>()

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const drawn = await next(e)
    if (e.props.isInterrupted) fled.add(e.props.tool_use_id)
    if (e.surface !== 'terminal') return drawn
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row">
        <Box marginTop={GUTTER_TOP}><Text>{`${rowIcon(e.props)} `}</Text></Box>
        <Box flexGrow={1} flexDirection="column">{drawn}</Box>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const drawn = await next(e)
    if (e.surface !== 'terminal' || !e.props.isErrored || fled.has(e.props.tool_use_id)) return drawn
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {drawn}
        <Text color="error" bold>{'   ❌ MISS!'}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const drawn = await next(e)
    if (e.surface !== 'terminal' || e.props.isExpanded) return drawn
    const combo = comboLabel(e.props.calls.length)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row">
        <Box marginTop={GUTTER_TOP}><Text>{`${groupIcon(e.props.calls)} `}</Text></Box>
        <Box flexGrow={1} flexDirection="column">{drawn}</Box>
        {combo === undefined ? null : <Box marginTop={GUTTER_TOP}><Text color="warning" bold>{combo}</Text></Box>}
      </Box>
    )
  })
}
