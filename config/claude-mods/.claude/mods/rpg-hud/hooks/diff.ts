// Shared by the bag, the inspect view and the transcript's edit cards: how big a change is, and its diff lines.

export type Rarity = { name: string; color: string; glyph: string }

// The bigger the change, the rarer the item.
export const rarityOf = (lines: number): Rarity => {
  if (lines >= 200) return { name: 'epic', color: 'magenta', glyph: '✦' }
  if (lines >= 50) return { name: 'rare', color: 'blue', glyph: '◆' }
  if (lines >= 10) return { name: 'uncommon', color: 'green', glyph: '◆' }
  return { name: 'common', color: 'white', glyph: '◇' }
}

// The status letter's glyph: edited, new, gone, moved.
export const STATUS_GLYPHS: Record<string, string> = { M: '✎', A: '✚', '?': '✚', D: '✖', R: '➜' }

// The added and removed shares of a `width`-cell bar.
export const splitBar = (added: number, removed: number, width: number) => {
  const total = added + removed
  if (total === 0) return { plus: 0, minus: 0 }
  const plus = Math.round((added / total) * width)
  return { plus, minus: width - plus }
}

export type DiffLine =
  | { kind: 'hunk'; text: string; newStart: number }
  | { kind: 'add' | 'del' | 'ctx'; text: string; number: number }
  | { kind: 'meta'; text: string }

// `git diff` output as numbered lines: hunk headers keep their position, file headers are dropped.
export const parseDiff = (lines: readonly string[]): DiffLine[] => {
  const out: DiffLine[] = []
  let oldLine = 0
  let newLine = 0
  for (const line of lines) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/.exec(line)
    if (hunk !== null) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      out.push({ kind: 'hunk', text: hunk[3] ?? '', newStart: newLine })
      continue
    }
    if (/^(diff --git|index |--- |\+\+\+ |new file mode|deleted file mode|similarity index|rename (from|to) )/.test(line)) continue
    if (line.startsWith('Binary files')) {
      out.push({ kind: 'meta', text: 'a binary relic: no lines to read' })
      continue
    }
    if (line.startsWith('\\')) continue
    if (line.startsWith('+')) out.push({ kind: 'add', text: line.slice(1), number: newLine++ })
    else if (line.startsWith('-')) out.push({ kind: 'del', text: line.slice(1), number: oldLine++ })
    else if (line.startsWith(' ')) out.push({ kind: 'ctx', text: line.slice(1), number: (oldLine++, newLine++) })
  }
  return out
}
