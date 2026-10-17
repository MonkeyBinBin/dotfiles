import type { TextCell } from './menu'

// The skill cards' art: a 10x8 pixel icon, picked by what the skill's name says it does, on a backplate in its
// tier's colour; four terminal rows of half blocks.
export const ART_ROWS = 4
const ICON_WIDTH = 10

const PALETTE: Record<string, number> = {
  k: 0x0a0a0c, W: 0xfff0dc, K: 0x191e23,
  Y: 0xffd23c, y: 0xb48c1e, O: 0xff9a3c,
  R: 0xff5a5a, r: 0xa82828,
  B: 0x5aa9ff, b: 0x2a5fb4, C: 0x8be8ff,
  G: 0x5ad27a, g: 0x2d8c4b,
  P: 0xb07ae8, p: 0x6a3aa8,
  T: 0xf0dcaa, t: 0xb89860, M: 0x7a4a1c,
  S: 0xc8d0d8, s: 0x7a828c,
}

export type SkillIcon = 'scroll' | 'eye' | 'shield' | 'bulb' | 'palette' | 'lens' | 'book' | 'bug' | 'rocket' | 'gear' | 'orb'

const ICONS: Record<SkillIcon, readonly string[]> = {
  // A sealed scroll: lines of ink and a red wax seal.
  scroll: ['.kkkkkkkk.', 'kTTTTTTTTk', 'kTttttTTTk', 'kTTTTTTTTk', 'kTtttTTTTk', 'kTTTTTRRTk', 'kTTTTRrRTk', '.kkkkkkkk.'],
  // An open eye, its blue iris and a dark pupil.
  eye: ['...kkkk...', '.kkWWWWkk.', 'kWWkBBkWWk', 'kWkBKKBkWk', 'kWkBKKBkWk', 'kWWkBBkWWk', '.kkWWWWkk.', '...kkkk...'],
  // A silver shield with a green check.
  shield: ['kkkkkkkkkk', 'kSSSSSSSSk', 'kSSSSSSGSk', 'kSGSSSGgSk', '.kSGSGgSk.', '.kSSGgSSk.', '..kSSSSk..', '...kkkk...'],
  // A lit bulb on its silver screw.
  bulb: ['...kkkk...', '..kYYYYk..', '.kYWYYYYk.', '.kYYYYYyk.', '..kYYYyk..', '...kSSk...', '...ksSk...', '....kk....'],
  // A painter's palette: dabs of red, blue, green and gold, a thumb hole.
  palette: ['..kkkkkk..', '.kTTTTTTk.', 'kTRTTBTTTk', 'kTTTTTTGTk', 'kTYTTkkTTk', 'kTTTk..kk.', '.kTTTk....', '..kkk.....'],
  // A magnifying glass, its lens catching the light.
  lens: ['..kkkk....', '.kCWCCk...', '.kWCCCk...', '.kCCCbk...', '..kkkkMk..', '......kMk.', '.......kMk', '........k.'],
  // A blue tome with gold lettering and cream pages.
  book: ['.kkkkkkkk.', 'kbBBBBBBTk', 'kbBYYYBBTk', 'kbBBBBBBTk', 'kbBYYBBBTk', 'kbBBBBBBTk', 'kbbbbbbbTk', '.kkkkkkkk.'],
  // A red beetle, its legs out.
  bug: ['.k......k.', '..k.kk.k..', '...kRRk...', '.kkRWRRkk.', '...kRRrk..', '.kkRRRrkk.', '...krrk...', '..k.kk.k..'],
  // A rocket on its flame.
  rocket: ['....kk....', '...kWWk...', '...kSSk...', '..kSBBSk..', '..kSbBSk..', '..kSSSsk..', '.kRkSskRk.', '..kOkkOk..'],
  // A silver cog.
  gear: ['..k.kk.k..', '.kSkSSkSk.', '.kSSSSSSk.', 'kSSSkkSSsk', 'kSSkKKkSsk', '.kSSkkSsk.', '.ksSssSsk.', '..k.kk.k..'],
  // A purple crystal orb on a gold stand: any other skill.
  orb: ['...kkkk...', '..kPPPPk..', '.kPWPPPpk.', '.kPPPPPpk.', '.kPPPPppk.', '..kpppPk..', '..kYYYyk..', '.kkkkkkkk.'],
}

// What a name says, checked in order; the first match picks the icon.
const KEYWORDS: readonly [SkillIcon, RegExp][] = [
  ['bug', /debug|bug|rescue|diagnos/],
  ['shield', /test|tdd|verif|qa\b|secur/],
  ['eye', /review|audit|inspect|lint|check/],
  ['scroll', /commit|git|push|merge|changelog|branch|\bpr\b|pull/],
  ['bulb', /brainstorm|idea|plan|think|spec/],
  ['palette', /ui|ux|design|front|style|css|figma|pencil|art/],
  ['lens', /find|search|seo|explor|research|query|context/],
  ['book', /doc|pdf|xlsx|pptx|write|readme|markdown|notion|guide/],
  ['rocket', /deploy|release|ship|publish|launch/],
  ['gear', /config|setup|setting|init|install|hook|statusline|update/],
]

export const iconOf = (name: string): SkillIcon => {
  const lower = name.toLowerCase()
  return KEYWORDS.find(([, pattern]) => pattern.test(lower))?.[0] ?? 'orb'
}

export type ArtTier = 'master' | 'adept' | 'novice' | 'untried' | 'sealed'

// Each tier's backplate, lighter at the top; a skill never cast shows grey on grey.
const PLATES: Record<ArtTier, [top: number, bottom: number]> = {
  master: [0x8a6a12, 0x3d2f08],
  adept: [0x2a6a9a, 0x0f2a40],
  novice: [0x2c7a3e, 0x10331a],
  untried: [0x3a3a40, 0x1c1c20],
  sealed: [0x2a2a2e, 0x141416],
}

const mix = (a: number, b: number, t: number): number => {
  const channel = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t)
  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

const toGray = (rgb: number, level: number): number => {
  const luma = 0.299 * ((rgb >> 16) & 0xff) + 0.587 * ((rgb >> 8) & 0xff) + 0.114 * (rgb & 0xff)
  const gray = Math.round(luma * level)
  return (gray << 16) | (gray << 8) | gray
}

const SPARK = 0xfff7c0
// Where a skill cast moments ago sparkles on its plate: a corner each side.
const SPARKS: readonly [x: number, y: number][] = [
  [1, 0],
  [0, 1],
  [-2, 6],
  [-1, 7],
]

const hex = (rgb: number): string => `#${rgb.toString(16).padStart(6, '0')}`

// The card's art as `ART_ROWS` rows of `width` half-block cells: the plate filling the row, the icon centred on it.
export const cardArt = (name: string, tier: ArtTier, width: number, isGlowing: boolean): TextCell[][] => {
  const pixels = ICONS[iconOf(name)]
  const [top, bottom] = PLATES[tier]
  const left = Math.floor((width - ICON_WIDTH) / 2)
  const isGray = tier === 'untried' || tier === 'sealed'
  const height = ART_ROWS * 2
  const sparks = new Set(isGlowing ? SPARKS.map(([x, y]) => `${x < 0 ? width + x : x},${y}`) : [])
  const colorAt = (x: number, y: number): number => {
    if (sparks.has(`${x},${y}`)) return SPARK
    const key = pixels[y]?.[x - left]
    const rgb = key === undefined ? undefined : PALETTE[key]
    if (rgb === undefined) return mix(top, bottom, y / (height - 1))
    return isGray ? toGray(rgb, tier === 'sealed' ? 0.45 : 0.7) : rgb
  }
  return Array.from({ length: ART_ROWS }, (_, row) =>
    Array.from({ length: width }, (_, x): TextCell => ['▀', hex(colorAt(x, row * 2)), hex(colorAt(x, row * 2 + 1))]),
  )
}
