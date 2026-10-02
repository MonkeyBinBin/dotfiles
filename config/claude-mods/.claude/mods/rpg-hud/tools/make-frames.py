"""Build every hero class's animation frames into hooks/hero-cells.ts.

Usage: python3 tools/make-frames.py
Reads tools/classes/<class>.txt (20x20, one character per pixel, see PALETTE) and writes, per class,
idle (its glow breathing), cast (weapon raised, sparkles) and hurt (smoke puff) frames as half-block
Raster cells. Transparent pixels take the terminal's default colour. With Pillow installed it also
writes tools/frames-preview.png, one row per class, to eyeball.
"""
import base64
import pathlib
import struct

ROOT = pathlib.Path(__file__).resolve().parent.parent
SIZE = 20

PALETTE = {
    '.': None,
    'B': (30, 144, 255), 'b': (120, 200, 255),
    'S': (247, 196, 140), 's': (232, 150, 60),
    'K': (20, 20, 20), 'W': (255, 255, 255), 'P': (255, 105, 160),
    'R': (229, 57, 53), 'r': (150, 25, 25),
    'U': (40, 120, 235), 'Y': (255, 210, 60),
    'L': (240, 240, 240), 'G': (170, 170, 170),
    'N': (150, 85, 35), 'n': (95, 50, 20),
    'H': (217, 119, 87), 'h': (160, 78, 55),
    'V': (98, 78, 190), 'v': (64, 48, 135),
    'C': (150, 240, 255), 'c': (60, 170, 225), 'D': (30, 100, 150),
    'E': (238, 238, 248), 'e': (185, 185, 210),
    'O': (40, 32, 64),
    'g': (120, 120, 135), 'm': (190, 190, 205),
    # Steel, forest, shadow cloth, leather, copper and canvas for the other classes.
    'A': (180, 190, 205), 'a': (110, 120, 140),
    'F': (70, 160, 80), 'f': (35, 100, 50),
    'x': (60, 50, 78), 'X': (75, 52, 40),
    'Z': (205, 125, 60), 'T': (225, 200, 150),
}

UPPER_HALF = 0x2580
LOWER_HALF = 0x2584
SPACE = 0x20
DEFAULT = 0x01000000  # the terminal's own colour

# Per class: the pixels that glow while idle (bright and dim swaps), where they glow (columns, or the
# whole sprite), and the weapon's pixels and columns that lift a row while casting.
CLASSES = {
    'wizard': {'bright': {'c': 'C', 'C': 'W'}, 'dim': {'c': 'D', 'C': 'c'}, 'glow': range(0, 7),
               'weapon': {'c', 'C', 'n'}, 'arms': range(0, 7)},
    'knight': {'bright': {'L': 'W'}, 'dim': {'L': 'G'}, 'glow': range(0, 6),
               'weapon': {'W', 'L', 'Y', 'n'}, 'arms': range(0, 6)},
    'ranger': {'bright': {'L': 'W', 'N': 'Z'}, 'dim': {'L': 'G'}, 'glow': range(0, 5),
               'weapon': {'N', 'L'}, 'arms': range(0, 5)},
    'rogue': {'bright': {'Y': 'W'}, 'dim': {'Y': 's'}, 'glow': None,
              'weapon': {'W', 'L', 'n'}, 'arms': range(0, 5)},
    'cleric': {'bright': {'C': 'W', 'Y': 'W'}, 'dim': {'C': 'c', 'Y': 's'}, 'glow': range(0, 7),
               'weapon': {'Y', 'C', 'W', 'n'}, 'arms': range(0, 7)},
    'artificer': {'bright': {'C': 'W'}, 'dim': {'C': 'D'}, 'glow': None,
                  'weapon': {'G', 'n'}, 'arms': range(0, 6)},
}


def load(name):
    rows = [r for r in (ROOT / 'tools' / 'classes' / f'{name}.txt').read_text().split('\n') if r.strip()]
    assert len(rows) == SIZE and all(len(r) == SIZE for r in rows), name
    return [list(r) for r in rows]


def copy(grid):
    return [row[:] for row in grid]


def recolor(grid, mapping, columns):
    out = copy(grid)
    for y in range(SIZE):
        for x in columns if columns is not None else range(SIZE):
            out[y][x] = mapping.get(out[y][x], out[y][x])
    return out


def raise_weapon(grid, pixels, columns):
    """Lift the weapon one row; the hand stays where it holds it."""
    out = copy(grid)
    for y in range(SIZE):
        for x in columns:
            if grid[y][x] in pixels:
                out[y][x] = '.'
    for y in range(1, SIZE):
        for x in columns:
            if grid[y][x] in pixels:
                out[y - 1][x] = grid[y][x]
    return out


def dot(grid, points, ch):
    out = copy(grid)
    for x, y in points:
        out[y][x] = ch
    return out


def encode(grid):
    def color(ch):
        rgb = PALETTE[ch]
        return None if rgb is None else (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]

    words = []
    for row in range(SIZE // 2):
        for col in range(SIZE):
            top, bottom = color(grid[2 * row][col]), color(grid[2 * row + 1][col])
            if top is None and bottom is None:
                words += [SPACE, DEFAULT, DEFAULT]
            elif top is None:
                # A default foreground is the text colour, not see-through: draw the lower half.
                words += [LOWER_HALF, bottom, DEFAULT]
            elif bottom is None:
                words += [UPPER_HALF, top, DEFAULT]
            else:
                words += [UPPER_HALF, top, bottom]
    return base64.b64encode(struct.pack(f'<{len(words)}I', *words)).decode()


def frames(name):
    spec = CLASSES[name]
    base = load(name)
    bright = recolor(base, spec['bright'], spec['glow'])
    dim = recolor(base, spec['dim'], spec['glow'])
    idle = [base, bright, base, dim]

    raised = recolor(raise_weapon(base, spec['weapon'], spec['arms']), spec['bright'], spec['glow'])
    cast = [
        dot(raised, [(0, 0), (6, 1), (0, 5), (6, 4)], 'Y'),
        dot(raised, [(5, 0), (0, 2), (6, 3), (1, 6)], 'W'),
    ]

    hurt = [
        dot(dim, [(16, 1), (17, 1), (16, 2)], 'g'),
        dot(dot(dim, [(15, 0), (16, 0), (17, 0), (16, 1), (17, 1), (18, 1)], 'm'), [(17, 2), (18, 2), (16, 2)], 'g'),
        dot(dim, [(17, 0), (19, 1), (18, 3)], 'g'),
    ]
    return {'idle': idle, 'cast': cast, 'hurt': hurt}


def main():
    built = {name: frames(name) for name in CLASSES}
    lines = [
        '// Generated by tools/make-frames.py from tools/classes/*.txt; do not edit by hand.',
        'export const HERO_SIZE = {',
        f'  columns: {SIZE},',
        f'  rows: {SIZE // 2},',
        '}',
        '',
        'export const HERO_CLASS_FRAMES = {',
    ]
    for name, moods in built.items():
        lines.append(f'  {name}: {{')
        for mood, grids in moods.items():
            lines.append(f'    {mood}: [')
            lines += [f"      '{encode(grid)}'," for grid in grids]
            lines.append('    ],')
        lines.append('  },')
    lines += [
        '} as const',
        '',
        'export type HeroClassId = keyof typeof HERO_CLASS_FRAMES',
        '',
        '// The first hero, kept under its old name.',
        'export const HERO_FRAMES = { ...HERO_SIZE, ...HERO_CLASS_FRAMES.wizard }',
    ]
    out = ROOT / 'hooks' / 'hero-cells.ts'
    out.write_text('\n'.join(lines) + '\n')
    print(f'{out}: ' + ', '.join(built))

    # Previews for a person to eyeball, outside the mod: one row per class, its nine frames across.
    try:
        from PIL import Image
    except ImportError:
        return
    scale, gap = 8, 6
    width = SIZE * scale * 9 + gap * 8
    sheet = Image.new('RGBA', (width, (SIZE * scale + gap) * len(built)), (30, 30, 40, 255))
    for row, moods in enumerate(built.values()):
        x = 0
        for grids in moods.values():
            for grid in grids:
                im = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
                for yy, line in enumerate(grid):
                    for xx, ch in enumerate(line):
                        if PALETTE[ch]:
                            im.putpixel((xx, yy), PALETTE[ch] + (255,))
                sheet.alpha_composite(im.resize((SIZE * scale, SIZE * scale), Image.NEAREST), (x, row * (SIZE * scale + gap)))
                x += SIZE * scale + gap
    sheet.save(ROOT / 'tools' / 'frames-preview.png')


if __name__ == '__main__':
    main()
