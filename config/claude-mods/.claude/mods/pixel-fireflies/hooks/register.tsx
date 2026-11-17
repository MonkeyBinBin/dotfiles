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

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.scene !== SCENE_NAME) {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)

    return <Svg source={SCENE} alt="Pixel-art fireflies drifting and glowing over a dark meadow at night" />
  })
}
