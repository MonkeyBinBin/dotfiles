import type { ElementTable } from 'claude-code'

import { CLASS_IDS } from './classes'
import type { Item } from './window'

// Every /hud command, as the help page and `/hud help` list it.
export const HELP_COMMANDS: readonly { usage: string; what: string }[] = [
  { usage: '/hud', what: 'Open the adventure HUD' },
  { usage: '/hud spell|party|map|skill|jobs', what: 'Open it on that tab; 1–5 name them too' },
  { usage: '/hud class [name]', what: `Reroll the hero's class, or pick one: ${CLASS_IDS.join(', ')}` },
  { usage: '/hud cards', what: 'Draw Edit and Write results as spell cards, or as before' },
  { usage: '/hud follow', what: 'On a message turn to the spell book, then to what happens (skills, party, map); or stay put' },
  { usage: '/hud recap', what: "This session's adventure log" },
  { usage: '/hud help', what: 'This list' },
]

// What the HUD does on a click or the wheel, which no command says.
export const HELP_TIPS: readonly string[] = [
  'ctrl+x tab, then 1–5 pick a tab; Tab and Enter reach every button',
  '⚔ fix on a boss fills the prompt with its fix',
  '✗ and ◷ in the spell book keep the fizzled or slow casts',
  'A skill, or its letter on the skill tab, fills the prompt with its /name',
  'j and k, or the wheel, scroll the window under the menu',
]

// The help as text, for `/hud help`.
export const helpText = (): string =>
  [...HELP_COMMANDS.map(one => `${one.usage}  ${one.what}`), '', ...HELP_TIPS.map(tip => `· ${tip}`)].join('\n')

// The help page: the back button, each command with its meaning under it, then the tips.
export function helpItems(ui: ElementTable, close: () => void): Item[] {
  const { Box, Button, Text } = ui
  return [
    { key: 'back', rows: 1, node: <Button key="help-back" label="◂ back" plain onPress={close} /> },
    ...HELP_COMMANDS.map(
      (one): Item => ({
        key: one.usage,
        rows: 2,
        node: (
          <Box flexDirection="column">
            <Text bold color="cyan" wrap="truncate">
              {one.usage}
            </Text>
            <Text dimColor wrap="truncate">
              {'  '}
              {one.what}
            </Text>
          </Box>
        ),
      }),
    ),
    ...HELP_TIPS.map(
      (tip): Item => ({
        key: tip,
        rows: 1,
        node: (
          <Text dimColor wrap="truncate">
            · {tip}
          </Text>
        ),
      }),
    ),
  ]
}
