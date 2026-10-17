// What each /context category is as mana: the colour of its liquid in the tube, and the legend's mark for it.

// Each category's mana by its name; another takes a colour from the rest by its name.
const LIQUIDS: Readonly<Record<string, number>> = {
  'System prompt': 0x8c7cff,
  'System tools': 0x56c8dc,
  'MCP tools': 0xff7ad9,
  'Custom agents': 0xffa94d,
  'Memory files': 0xffd23c,
  Skills: 0x7cf29c,
  Messages: 0x5aa9ff,
}
const SPARE = [0xc88cff, 0x4fd1c5, 0xf6ad55, 0x9ae6b4]

export const liquidOf = (name: string): number => {
  const known = LIQUIDS[name]
  if (known !== undefined) return known
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return SPARE[hash % SPARE.length]!
}

export const hexOf = (rgb: number): string => `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`

// The legend's mark for each category: what that mana is made of.
const ICONS: Readonly<Record<string, string>> = {
  'System prompt': '📜',
  'System tools': '🔧',
  'MCP tools': '🔌',
  'Custom agents': '🤖',
  'Memory files': '🧠',
  Skills: '✨',
  Messages: '💬',
}
export const iconOf = (name: string): string => ICONS[name] ?? '🔮'
