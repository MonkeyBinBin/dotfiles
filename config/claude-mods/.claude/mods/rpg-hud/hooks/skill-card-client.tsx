import type { ClientModule } from 'claude-code'

import type { TextCell } from './menu'

// One skill card on the terminal, drawn whole by this Client so the card is one target: a click anywhere on it,
// frame included, casts the skill. The art fills the top inside the frame; under it the name, then the stars and
// the source. The frame and the name share a hover group that lights the card at once.
export type SkillCardProps = {
  name: string
  width: number
  height: number
  scope: string
  color: string
  isLearned: boolean
  isGlowing: boolean
  art: TextCell[][]
  label: string
  stars: string
  source: string
}

const SkillCard: ClientModule<SkillCardProps> = (props, surface) => {
  const { Box, Text } = surface.elements
  surface.onPointer(e => {
    if (e.type === 'up' && e.button === 'left') surface.post({ cast: props.name })
  })
  return (
    <Box
      flexDirection="column"
      alignItems="center"
      width={props.width}
      height={props.height}
      borderStyle="round"
      borderColor={props.isGlowing ? 'yellow' : props.color}
      borderDimColor={!props.isLearned}
      hover={{ scope: props.scope, borderColor: 'yellow', borderDimColor: false }}
    >
      {props.art.map((cells, y) => (
        <Box key={`art-${y}`} flexDirection="row" height={1}>
          {cells.map(([glyph, color, background], x) => (
            <Text key={`c${x}`} {...(color === null ? {} : { color })} {...(background === null ? {} : { backgroundColor: background })}>
              {glyph}
            </Text>
          ))}
        </Box>
      ))}
      <Text bold color={props.isLearned ? props.color : undefined} dimColor={!props.isLearned} wrap="truncate" hover={{ scope: props.scope, color: 'yellow' }}>
        {props.label}
      </Text>
      <Text wrap="truncate">
        <Text color="yellow" dimColor={!props.isLearned}>
          {props.stars}
        </Text>
        <Text dimColor>
          {' '}
          {props.source}
        </Text>
      </Text>
    </Box>
  )
}

export default SkillCard
