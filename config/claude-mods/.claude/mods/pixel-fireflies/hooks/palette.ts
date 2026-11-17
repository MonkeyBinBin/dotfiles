import { makeColors } from './make-colors.js'

// A night meadow: surfaces tinted from the scene's green-black sky, firefly lime as the accent, a cooler
// grass green for success so code doesn't flatten into one green, a lantern amber and a dusk violet.
// Dark only: the scene is a night.
export const palette = makeColors({
  label: 'Pixel Fireflies',
  only: 'dark',
  // Code blocks are colored by the surface's own highlighter (Shiki), not by the roles below: pick its theme.
  codeTheme: { dark: 'vitesse-dark' },
  roles: {
    accent: '#b9e33a', // keywords, focus, links: a firefly's glow
    success: '#4fbf8a', // strings, added lines: dew-cool grass
    danger: '#e5645a', // errors, removed lines
    warning: '#efb04a', // variables, warnings: lantern amber
    pro: '#9a8cf0', // literals: the sky just after dusk
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#080d0b',
        'surface-1': '#0c1310',
        'surface-2': '#101914',
        'surface-3': '#131d17',
        'text-primary': '#eef2df',
        'text-secondary': '#c6ccb4',
        'text-muted': '#9aa38b',
      },
    },
    git: {
      added: '#6fcf7a',
      removed: '#e5645a',
      modified: '#e0b24a',
      merged: '#ab9ff5',
    },
  },
})
