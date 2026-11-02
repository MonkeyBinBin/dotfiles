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
  // A slime: it hops instead of running. A crouch winds it up,
  run1: [
    '............',
    '............',
    '............',
    '..GGGGGGGG..',
    '.GLLGKGGKGG.',
    'gggggggggggg',
  ],
  // then it is in the air, stretched tall and a pixel off the ground,
  run2: [
    '....GGGG....',
    '...GLGGGG...',
    '..GLGKGGKGG.',
    '...GGGGGG...',
    '....gggg....',
    '............',
  ],
  // squashes flat as it lands,
  run3: [
    '............',
    '............',
    '...GGGGGG...',
    '.GLLGGGGGGG.',
    'GGGGGKGGKGGG',
    '.gggggggggg.',
  ],
  // and stands round again before the next crouch.
  run4: [
    '............',
    '....GGGG....',
    '..GLLGGGGG..',
    '.GLGGKGGKGG.',
    '.GGGGGGGGGG.',
    '..gggggggg..',
  ],
  sit: [
    '............',
    '....GGGG....',
    '..GLLGGGGG..',
    '.GLGGKGGKGG.',
    '.GGGPGGGGPG.',
    '..gggggggg..',
  ],
  // Sitting with its eyes shut for a tick.
  blink: [
    '............',
    '....GGGG....',
    '..GLLGGGGG..',
    '.GLGGgGGgGG.',
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
