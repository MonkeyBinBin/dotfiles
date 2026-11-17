import type { Register, ThemeSetArgs } from 'claude-code'

import { palette } from './palette'
import { SCENE } from './scene'

const SCENE_NAME = 'pixel-fireflies'

// A dark-only palette makes surfaces act as if dark mode were set; the glass takes the page color.
const LOOK: ThemeSetArgs = {
  colors: palette.theme,
  backdrop: { scene: SCENE_NAME, glass: { blur: 10, tint: '#080d0b', opacity: 0.68 } },
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const unpainted = palette.problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    await $.theme.set(LOOK)

    return next(e)
  })

  // The built-in theme-examples (/custom-theme) re-follows the project's choice at each turn's start and can clear
  // the session's theme, and a session switch has been seen to leave it undrawn. Set ours again once the plugins
  // beneath have run, so a lost look comes back at the next prompt. A failed set never costs the prompt.
  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    await $.theme.set(LOOK).catch(() => {})

    return result
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.scene !== SCENE_NAME) {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)

    return <Svg source={SCENE} alt="Pixel-art fireflies drifting and glowing over a dark meadow at night" />
  })
}
