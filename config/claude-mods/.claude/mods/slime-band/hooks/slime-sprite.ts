// One character per pixel; '.' is see-through. The slime faces right.
export const SLIME_PALETTE: Record<string, number> = {
  G: 0x5aa9ff,
  g: 0x2a5fb4,
  L: 0xd2e8ff,
  K: 0x191e23,
  P: 0xff8caa,
}

export const SLIME_WIDTH = 12
// Six pixels tall: three terminal rows of half blocks.
export const SLIME_ROWS = 3

export const SLIME_FRAMES = {
  // A slime: it hops (squash, then stretch) instead of running.
  run1: [
    '............',
    '............',
    '...GGGGGG...',
    '.GLLGGGGGGG.',
    'GGGGGKGGKGGG',
    '.gggggggggg.',
  ],
  run2: [
    '....GGGG....',
    '...GLGGGG...',
    '..GLGKGGKGG.',
    '..GGGGGGGGG.',
    '...GGGGGG...',
    '....gggg....',
  ],
  sit: [
    '............',
    '....GGGG....',
    '..GLLGGGGG..',
    '.GLGGKGGKGG.',
    '.GGGPGGGGPG.',
    '..gggggggg..',
  ],
  sleep: [
    '............',
    '............',
    '............',
    '...GGGGGG...',
    '.GLGggGGggG.',
    'gggggggggggg',
  ],
} as const

export type SlimePose = keyof typeof SLIME_FRAMES
