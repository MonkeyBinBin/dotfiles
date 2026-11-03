// The hero who levels up: the session's class (rpg-hud's heroClass, rolled per session) as a little figure who
// steps into the pillar of light and cheers, drawn in it where the burst plays as cells. Each after rpg-hud's
// portrait of that class, kept to what reads at this size. One character per pixel; '.' is see-through. Seven wide,
// six tall: three rows of half blocks, so the light still rises a row over the head.

export const HERO_WIDTH = 7
export const HERO_ROWS = 3

export type HeroPose = 'stand' | 'cheer'
export type HeroSprite = { palette: Readonly<Record<string, number>>; frames: Readonly<Record<HeroPose, readonly string[]>> }

const SKIN = 0xf2c79a
const BOOTS = 0x5a4632
const HAIR = 0x8a5a34

export const HEROES = {
  // A blue pointed hat and robe, a staff with a glowing orb raised at the cheer.
  wizard: {
    palette: { H: 0x3a6fd8, h: 0x23428a, S: SKIN, B: 0x4a82e8, T: 0x8a6a3a, O: 0x7ff0ff, L: BOOTS },
    frames: {
      stand: [
        '...H..O',
        '..HHH.T',
        '.hhhhhT',
        '..SSS.T',
        '.BBBBST',
        '..L.L.T',
      ],
      cheer: [
        '...H..O',
        '..HHH.T',
        '.hhhhST',
        '..SSS..',
        '.BBBB..',
        '..L.L..',
      ],
    },
  },
  // A plumed steel helm and armour, shield on one arm and the sword up at the cheer.
  knight: {
    palette: { R: 0xe0452c, H: 0xc8ccd8, K: 0x191e23, D: 0x7d8296, O: 0xf08a2c, W: 0xeef2ff, S: SKIN, L: BOOTS },
    frames: {
      stand: [
        '...R...',
        '..HHH..',
        '..HKH..',
        'DHHHHH.',
        'O.HHHSW',
        '..L.L.W',
      ],
      cheer: [
        '...R..W',
        '..HHH.W',
        '..HKH.S',
        'DHHHHH.',
        'O.HHH..',
        '..L.L..',
      ],
    },
  },
  // A green hood and tunic, the bow held high at the cheer.
  ranger: {
    palette: { G: 0x4f9a3a, g: 0x2f6a24, S: SKIN, W: 0xa8743a, L: BOOTS },
    frames: {
      stand: [
        '..GGG..',
        '.GSSSG.',
        '.gGGGgW',
        '.GGGGSW',
        '..GGG.W',
        '..L.L..',
      ],
      cheer: [
        '..GGG.W',
        '.GSSSGW',
        '.gGGGSW',
        '..GGG.W',
        '..GGG..',
        '..L.L..',
      ],
    },
  },
  // A black hood and mask, a dagger in each hand, both up at the cheer.
  rogue: {
    palette: { K: 0x2a2a34, k: 0x14141a, S: SKIN, D: 0x3c3448, W: 0xd8dce8, L: BOOTS },
    frames: {
      stand: [
        '..KKK..',
        '.KSSSK.',
        '.kkkkk.',
        'W.DDD.W',
        'S.DDD.S',
        '..L.L..',
      ],
      cheer: [
        'W.KKK.W',
        'SKSSSKS',
        '.kkkkk.',
        '..DDD..',
        '..DDD..',
        '..L.L..',
      ],
    },
  },
  // A golden halo, a white robe trimmed red, the cross-staff raised at the cheer.
  cleric: {
    palette: { Y: 0xffd23c, N: HAIR, S: SKIN, W: 0xf4f0e6, R: 0xd8453a, L: BOOTS },
    frames: {
      stand: [
        '.YYYYY.',
        '..NNN.Y',
        '..SSSYY',
        '.WRWRWY',
        '.WWWWSY',
        '..L.L.Y',
      ],
      cheer: [
        '.YYYYYY',
        '..NNNYY',
        '..SSS.Y',
        '.WRWRWS',
        '.WWWW..',
        '..L.L..',
      ],
    },
  },
  // Spiky hair and brass goggles, a leather apron, a wrench in one hand and a bulb in the other.
  artificer: {
    palette: { N: HAIR, C: 0x6fd8e8, S: SKIN, A: 0x9a5a2c, M: 0xa8b0bc, Y: 0xffe060, L: BOOTS },
    frames: {
      stand: [
        '.N.N.N.',
        '.NCNCN.',
        '..SSS..',
        'MAAAAA.',
        'M.AAASY',
        '..L.L..',
      ],
      cheer: [
        'MN.N.NY',
        'MNCNCNS',
        'S.SSS..',
        '.AAAAA.',
        '..AAA..',
        '..L.L..',
      ],
    },
  },
} as const satisfies Record<string, HeroSprite>

export type HeroClassId = keyof typeof HEROES

// Before rpg-hud has rolled a class (or where it does not run), the knight.
export const DEFAULT_HERO: HeroClassId = 'knight'

export const heroOf = (heroClass: string | undefined): HeroSprite =>
  HEROES[(heroClass !== undefined && heroClass in HEROES ? heroClass : DEFAULT_HERO) as HeroClassId]

// The hero's pose and glow at frame `frame` of a level-up burst of `frames`: in once the light rises, cheering from
// a third of the way, glowing gold at the peak.
export const heroAt = (frame: number, frames: number): { pose: HeroPose; glow: number } | undefined => {
  if (frame < 1) return undefined
  const cheer = Math.max(2, Math.round(frames / 3))
  const pose: HeroPose = frame >= cheer ? 'cheer' : 'stand'
  const glow = frame === cheer ? 0.7 : frame === cheer + 1 ? 0.35 : 0
  return { pose, glow }
}
