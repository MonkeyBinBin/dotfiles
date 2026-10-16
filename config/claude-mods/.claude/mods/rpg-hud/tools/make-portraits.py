"""Build the hero portraits from tools/portraits/<class>.png into assets/portraits/ and hooks/portrait-cells.ts.

Usage: python3 tools/make-portraits.py
Each source is a pixel-art sprite on a 64x64 grid (any whole-number upscale) over a solid magenta background.
Per class it animates the figure without reshaping it, only moving, recolouring and decorating it whole (idle:
a float and a twinkling focus; cast: a bob, a flaring focus, a pulsing aura and a spreading ring of sparks;
hurt: a flash, a shake and smoke), and writes every frame twice:
assets/portraits/<class>/<mood>-<n>.png, keyed out, laid over the class's scene and upscaled 8x, for the
terminal's Image; and a 20x20 bust (the head, cropped and shrunk) as half-block Raster cells, for terminals that
cannot draw pictures. The scene, tools/backgrounds/<class>.png, is a pixel-art backdrop on the same 64x64 grid
(any whole-number upscale) filling the frame; a class without one keeps a see-through picture. The busts never
take the scene: a half-block cell holds two colours, too few for a figure over a backdrop.
tools/portraits-preview.png shows every frame, figure above bust.
"""
import base64
import math
import pathlib
import struct
from collections import Counter

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
GRID = 64
SCALE = 8
BUST = 20

# Per class: `crop` is where the bust is cut from the 64x64 grid (left, top, side); `focus` the pixel its
# magic glows from (a staff's orb). A side of twice BUST halves the crop exactly; place it so each eye falls
# inside one 2x2 block, or the shrink keeps one eye and drops the other. `mirror` copies the better half of
# the face onto the other, flipped: generated art rarely draws two matching eyes. It is (axis, left, top,
# right, bottom): the box's pixels land at axis - x; an odd axis keeps the halves on mirrored 2x2 blocks
# when the crop's left is (axis - 39) / 2. `patch` repaints single pixels (x, y, rgb), for gaps the
# generated art leaves, like a staff drawn in broken segments. `clear` lists boxes (left, top, right, bottom)
# the bust leaves out: weapons the crop would cut into shards. `charm` is the colour of the little orb
# that floats in the bust's empty top-right corner in its place. `glow` lists the source colours near the
# focus that light up (absent: the wizard's cyan); `aura` the light and deep colours of the cast aura and
# the sparks' arms; `smoke` where the hurt smoke rises, beside the head. `bust_mirror` is `mirror` again in
# bust pixels, after the shrink: a face symmetric about one grid column (an even axis) cannot land on
# mirrored 2x2 blocks, so the bust is evened out on its own grid. `keep` lists colours of thin lines (a
# halo's ring) the bust holds on to: a block showing any of them takes it though mostly see-through, and the
# stray-pixel sweep leaves it. `ink` weighs near-black outline pixels when a bust block picks its colour
# (default 1): below 1, a block split between outline and colour keeps the colour, so a hood drawn in
# alternating green and black stays green rather than breaking into black shards. `reink` redraws the bust's
# lines: inner outline pixels the shrink left scattered take their neighbours' colour, and the silhouette's
# rim is inked again as one unbroken line, for art whose 1-pixel outlines shrink into dashes. `bust_paint`
# recolours the source for the bust alone, as (left, top, right, bottom, colours, to) in grid pixels: what
# reads as detail at full size (a head of hair under a hood) can crowd a 20x20 face. `bust_patch` fixes
# single bust pixels the shrink leaves as specks, as (x, y, rgb) in bust pixels: each fills the 2x2 grid
# block behind that pixel in the bust's source, so lifts, shakes and tints carry it like any other pixel.
# `bust_rows` writes runs of them as (y, x, text), one `bust_palette` letter per pixel, for redrawing an
# area such as the shading inside a hood. `smooth` sweeps the bust for specks, pixels unlike all eight
# around them, and gives each its neighbours' commonest colour, in the source like a patch; pixels drawn by
# `bust_rows` or `bust_patch`, `keep` colours, and the boxes (left, top, right, bottom) in `bust_hold` (a
# mouth, a buckle) are left alone. `scene_dim` darkens the class's scene by that share (default 0), for a
# backdrop as light as the figure it sits behind (silver armour against stone, a white robe in a sunlit hall).
STAFF, INK = (177, 84, 48), (2, 1, 7)
CLASSES = {
    'wizard': {
        'crop': (11, 4, 40),
        'focus': (51, 29),
        'mirror': (61, 31, 26, 39, 31),
        'patch': [(44, 51, STAFF), (43, 51, INK), (43, 55, STAFF), (42, 55, INK)],
        'clear': [(46, 26, 63, 63)],
        # The hat's brim throws its shadow over the fringe and brow; the eyes glow cyan in shaded skin.
        # Below the chin, where the chin's outline, the collar's and its clasp shrank into one black blot,
        # the neck sits in the chin's shadow inside a V of robe trimmed in gold.
        'bust_palette': {
            'e': (2, 1, 7), 'g': (65, 39, 71), 'h': (177, 84, 48), 's': (251, 208, 167), 'S': (205, 160, 130),
            'T': (150, 100, 85), 'E': (190, 250, 255), 'F': (80, 190, 240),
            'd': (28, 62, 150), 'k': (36, 114, 201), 'b': (29, 108, 199), 'o': (248, 190, 72),
        },
        'bust_rows': [
            (9, 5, 'egghhhhgge'),
            (10, 5, 'ghhSSSShhg'),
            (11, 5, 'hTEFSSFETh'),
            (12, 5, 'eTSssssSTe'),
            (13, 5, 'eSssssssSe'),
            (15, 5, 'deSssssSed'),
            (16, 5, 'ddeTSSTedd'),
            (17, 4, 'ekkodTTdokke'),
            (18, 4, 'kkkobddbokkk'),
            (19, 4, 'kkkkobbokkkk'),
        ],
        'charm': (52, 178, 240),
        'smooth': True,
        'bust_hold': [(10, 14, 10, 14)],
    },
    'knight': {
        'crop': (11, 4, 40),
        'scene_dim': 0.4,
        'focus': (18, 45),
        'mirror': (62, 32, 27, 40, 31),
        # The visor's shadow fills the helmet down to the cheeks; the eyes glow amber in it, set in from the
        # helmet's sides so they sit on the face.
        'bust_palette': {
            'b': (2, 2, 1), 'm': (25, 22, 30), 'h': (21, 17, 23), 'e': (165, 173, 182), 'a': (181, 188, 195),
            'k': (234, 201, 167), 'S': (200, 155, 125), 'T': (130, 90, 75), 'E': (255, 210, 110), 'F': (230, 130, 40),
        },
        'bust_rows': [
            (8, 6, 'hheeaeehh'),
            (9, 6, 'bmmmmmmmb'),
            (10, 6, 'bTETTTETb'),
            (11, 6, 'bSFSkSFSb'),
            (12, 6, 'bSkkkkkSb'),
        ],
        'bust_mirror': (20, 11, 11, 15, 14),
        'glow': [(249, 170, 80)],
        'aura': [(255, 236, 170), (230, 170, 60)],
        'charm': (249, 170, 80),
        'smooth': True,
        'bust_hold': [(8, 13, 8, 13), (12, 13, 12, 13), (10, 14, 10, 14)],
        'trim': 'shield',
    },
    'ranger': {
        'crop': (10, 4, 40),
        'focus': (47, 28),
        'mirror': (60, 31, 25, 37, 29),
        # Rows 8-9 are the fringe: its left half is drawn in stray highlight strands that shrink to specks.
        'bust_mirror': (20, 11, 8, 15, 12),
        'clear': [(0, 20, 17, 63), (48, 20, 63, 63)],
        'ink': 0.75,
        'reink': True,
        # The hood comes down over the hair to the brows, its brim a band of shadow over them: no hair shows,
        # only the eyes under it.
        'bust_paint': [
            (18, 14, 40, 17, [(102, 64, 52), (167, 82, 54), (178, 96, 64), (183, 163, 88)], (97, 135, 62)),
            (18, 18, 40, 24, [(102, 64, 52), (167, 82, 54), (178, 96, 64), (183, 163, 88)], (48, 88, 54)),
        ],
        # The hood casts its shadow as an arch: hood green under the brim dithers into a mid tone, darkens
        # over the brow, and falls on the face as shaded skin, deepest at the forehead and the hood's sides.
        # The eyes glow in it. The chin, neck and the strap and quiver ends below the face lose their stray
        # specks to skin and cloak green.
        'bust_patch': [
            *[(x, 7, (97, 135, 62)) for x in range(6, 15)],
            *[(x, 8, (72, 110, 58) if x % 2 else (97, 135, 62)) for x in range(6, 15)],
            (6, 9, (72, 110, 58)), *[(x, 9, (48, 88, 54)) for x in range(7, 14)], (14, 9, (72, 110, 58)),
            (7, 10, (48, 88, 54)), (9, 10, (176, 132, 110)), (10, 10, (176, 132, 110)), (11, 10, (176, 132, 110)), (13, 10, (48, 88, 54)),
            (7, 11, (176, 132, 110)), (10, 11, (214, 170, 140)), (13, 11, (176, 132, 110)),
            (6, 12, (176, 132, 110)), (7, 12, (214, 170, 140)), (13, 12, (214, 170, 140)), (14, 12, (176, 132, 110)),
            (6, 13, (214, 170, 140)),
            (8, 11, (220, 255, 150)), (12, 11, (220, 255, 150)),
            (9, 14, (247, 215, 179)), (10, 14, (247, 215, 179)),
            (9, 15, (97, 135, 62)), (10, 15, (247, 215, 179)), (11, 15, (97, 135, 62)),
            (17, 14, (48, 88, 54)), (16, 15, (48, 88, 54)), (17, 15, (48, 88, 54)), (17, 16, (48, 88, 54)),
            (6, 17, (105, 142, 65)), (9, 17, (105, 142, 65)), (15, 17, (97, 135, 62)), (16, 17, (97, 135, 62)), (17, 17, (48, 88, 54)),
            (6, 18, (97, 135, 62)), (7, 18, (97, 135, 62)), (10, 18, (105, 142, 65)), (14, 18, (97, 135, 62)), (15, 18, (97, 135, 62)), (16, 18, (48, 88, 54)),
        ],
        # Below the face: the hood's collar gathers at the shaded neck, the cloak's halves meet at a gold
        # clasp, and between them the darker tunic shows with the quiver's leather strap across it.
        'bust_palette': {
            'a': (2, 1, 7), 'h': (97, 135, 62), 'b': (105, 142, 65), 'c': (48, 88, 54), 'M': (72, 110, 58),
            'i': (247, 215, 179), 'g': (214, 170, 140), 'e': (176, 132, 110), 'y': (230, 200, 110),
            'r': (167, 82, 54), 'R': (102, 64, 52),
        },
        'bust_rows': [
            (14, 6, 'aegiiigea'),
            (15, 7, 'aMcecMa'),
            (16, 6, 'bhMcycMhb'),
            (17, 6, 'hbcMcrRbh'),
            (18, 6, 'hbcrRMcbh'),
        ],
        'glow': [(183, 163, 88)],
        'aura': [(200, 245, 150), (110, 180, 70)],
        'charm': (130, 200, 80),
        'smooth': True,
        'bust_hold': [(10, 13, 10, 13), (10, 16, 10, 16)],
        'trim': 'leaf',
        'smoke': (52, 10),
    },
    'rogue': {
        'crop': (12, 4, 40),
        'focus': (53, 39),
        'mirror': (64, 33, 24, 38, 28),
        'bust_mirror': (20, 11, 10, 15, 12),
        'clear': [(0, 34, 20, 63), (46, 34, 63, 63)],
        # The hood's opening, shaded: the fabric catches light at the top, its brim throws a deep shadow
        # over the fringe, and the eyes glow violet in shaded skin above the mask's lit edge.
        'bust_palette': {
            'a': (2, 2, 4), 'm': (17, 12, 22), 'e': (38, 36, 53), 'b': (60, 58, 72), 'c': (83, 81, 92),
            'h': (92, 46, 51), 'i': (153, 76, 52), 'l': (222, 205, 193), 'S': (170, 120, 95), 'T': (105, 70, 62),
            'G': (235, 210, 255), 'g': (170, 120, 240),
        },
        'bust_rows': [
            (6, 6, 'bbcccccbb'),
            (7, 6, 'ebbbbbbbe'),
            (8, 6, 'eamhhhmae'),
            (9, 6, 'aThiiihTa'),
            (10, 6, 'aTGglgGTa'),
            (11, 6, 'aTSlllSTa'),
            (12, 6, 'aeccccc' + 'ea'),
            (13, 6, 'aebbbbbea'),
        ],
        'glow': [(222, 205, 193), (123, 132, 150)],
        'aura': [(215, 180, 255), (140, 90, 220)],
        'charm': (170, 120, 240),
        'smooth': True,
        'trim': 'shadow',
        'smoke': (52, 12),
    },
    'cleric': {
        'crop': (12, 4, 40),
        'scene_dim': 0.45,
        'focus': (49, 25),
        'mirror': (64, 33, 27, 39, 30),
        # The fringe shades the brow; the eyes are amber, deep enough to read on the pale skin.
        'bust_palette': {
            'c': (3, 2, 1), 'f': (92, 36, 43), 'e': (149, 53, 46), 'g': (159, 72, 47), 'b': (253, 222, 146),
            'S': (220, 170, 120), 'T': (170, 115, 90), 'E': (240, 150, 20), 'F': (160, 85, 15),
        },
        'bust_rows': [
            (9, 6, 'ffgeeegff'),
            (10, 6, 'fgTSSSTgf'),
            (11, 6, 'fSEbbbESf'),
            (12, 6, 'cbFbbbFbc'),
        ],
        'bust_mirror': (20, 11, 11, 14, 13),
        'clear': [(45, 20, 63, 63)],
        'keep': [(253, 226, 78), (253, 222, 146)],
        'glow': [(253, 226, 78), (245, 174, 68)],
        'aura': [(255, 250, 210), (250, 215, 100)],
        'charm': (253, 226, 78),
        'smooth': True,
        'bust_hold': [(9, 15, 9, 15), (11, 16, 11, 16)],
        'trim': 'cross',
        'smoke': (57, 8),
    },
    'artificer': {
        'crop': (12, 4, 40),
        'focus': (51, 29),
        'mirror': (63, 32, 26, 38, 31),
        # The hair under the goggles shades the brow; the eyes are amber, deep enough to read on the skin.
        'bust_palette': {
            'a': (3, 1, 2), 'c': (165, 80, 40), 'e': (93, 39, 40), 'j': (176, 91, 46), 'k': (251, 212, 168),
            'S': (215, 165, 125), 'T': (160, 105, 80), 'E': (240, 160, 20), 'F': (160, 90, 15),
        },
        'bust_rows': [
            (10, 5, 'cejjjjjjec'),
            (11, 5, 'eTSSkkSSTe'),
            (12, 5, 'aSkEkkEkSa'),
            (13, 5, 'akkFkkFkka'),
        ],
        'clear': [(0, 24, 17, 63), (45, 22, 63, 63)],
        'glow': [(245, 187, 50), (244, 242, 234)],
        'aura': [(255, 240, 160), (245, 187, 50)],
        'charm': (245, 187, 50),
        'smooth': True,
        'bust_hold': [(5, 7, 14, 9), (9, 14, 9, 14)],
        'trim': 'gear',
        'smoke': (52, 12),
    },
}

DEFAULTS = {'aura': [(150, 240, 255), (80, 170, 255)]}

# How far the figure floats, in grid pixels: even, so the bust's 2x2 blocks still fall on the same features.
LIFT = 2

WHITE = (255, 255, 255)
SPARK = (255, 236, 140)
SMOKE = [(190, 190, 205), (120, 120, 135)]
RED = (230, 40, 40)

UPPER_HALF = 0x2580
LOWER_HALF = 0x2584
SPACE = 0x20
DEFAULT = 0x01000000


# A sprite is a GRID x GRID list of rows; a pixel is an (r, g, b) tuple or None, see-through.
def load(path):
    im = Image.open(path).convert('RGBA').resize((GRID, GRID), Image.NEAREST)
    px = im.load()

    def pixel(p):
        r, g, b, a = p
        return None if a < 128 or (r > 200 and g < 60 and b > 200) else (r, g, b)

    return [[pixel(px[x, y]) for x in range(GRID)] for y in range(GRID)]


SCENE_COLOURS = 32


# The class's scene as a GRID x GRID picture, or None when it has none. Generated art carries faint noise
# inside its pixels; folding it to a small palette, undithered, keeps every grid pixel one flat colour.
def backdrop(name, dim):
    path = ROOT / 'tools' / 'backgrounds' / f'{name}.png'
    if not path.exists():
        return None
    scene = Image.open(path).convert('RGB').resize((GRID, GRID), Image.NEAREST)
    scene = scene.quantize(SCENE_COLOURS, dither=Image.Dither.NONE).convert('RGB')
    if dim:
        scene = Image.eval(scene, lambda v: round(v * (1 - dim)))
    return scene.convert('RGBA')


# The figure over its scene: the picture the terminal shows.
def picture(sprite, scene):
    figure = to_image(sprite)
    return figure if scene is None else Image.alpha_composite(scene, figure)


def copy(sprite):
    return [row[:] for row in sprite]


def mirror(sprite, spec):
    axis, left, top, right, bottom = spec
    out = copy(sprite)
    for y in range(top, bottom + 1):
        for x in range(left, right + 1):
            out[y][axis - x] = sprite[y][x]
    return out


def blend(rgb, to, amount):
    return tuple(round(c + (t - c) * amount) for c, t in zip(rgb, to))


def is_cyan(rgb):
    r, g, b = rgb
    return b > 180 and g > 140 and r < 160


# The focus's own light: its lit pixels near the focus, lightened or darkened.
def glow(sprite, focus, to, amount, lit):
    out = copy(sprite)
    fx, fy = focus
    for y in range(max(0, fy - 6), min(GRID, fy + 7)):
        for x in range(max(0, fx - 6), min(GRID, fx + 7)):
            rgb = out[y][x]
            if rgb is not None and lit(rgb):
                out[y][x] = blend(rgb, to, amount)
    return out


# A plus-shaped twinkle, drawn only over see-through pixels so it never covers the figure.
def spark(sprite, at, color, arm):
    x, y = at
    for dx, dy, c in [(0, 0, color), (1, 0, arm), (-1, 0, arm), (0, 1, arm), (0, -1, arm)]:
        if 0 <= x + dx < GRID and 0 <= y + dy < GRID and sprite[y + dy][x + dx] is None:
            sprite[y + dy][x + dx] = c
    return sprite


def grow(mask, reach, keep):
    # Each pixel takes any (keep=False: dilate) or all (keep=True: erode) of its square neighbourhood.
    pick = all if keep else any
    return [
        [
            pick(mask[y + dy][x + dx] for dy in range(-reach, reach + 1) for dx in range(-reach, reach + 1) if 0 <= x + dx < GRID and 0 <= y + dy < GRID)
            for x in range(GRID)
        ]
        for y in range(GRID)
    ]


# The figure's silhouette with gaps up to twice CLOSE wide filled, so an aura rings it and not every slit
# between a staff and a sleeve.
CLOSE = 2


def silhouette(sprite):
    mask = [[rgb is not None for rgb in row] for row in sprite]
    closed = grow(grow(mask, CLOSE, False), CLOSE, True)
    # Holes the figure encloses (between an arm and a staff) count as figure: only the outside is lit.
    outside = [[False] * GRID for _ in range(GRID)]
    todo = [(x, y) for x in range(GRID) for y in (0, GRID - 1)] + [(x, y) for y in range(GRID) for x in (0, GRID - 1)]
    while todo:
        x, y = todo.pop()
        if 0 <= x < GRID and 0 <= y < GRID and not closed[y][x] and not outside[y][x]:
            outside[y][x] = True
            todo += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return [[not cell for cell in row] for row in outside]


# A dotted outline just outside the silhouette, its dots marching with the phase.
def aura(sprite, phase, colors):
    out = copy(sprite)
    shape = silhouette(sprite)
    for y in range(GRID):
        for x in range(GRID):
            if shape[y][x] or sprite[y][x] is not None:
                continue
            near = any(0 <= x + dx < GRID and 0 <= y + dy < GRID and shape[y + dy][x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if near and (x + y + phase) % 3 != 2:
                out[y][x] = colors[(x + y + phase) % 3]
    return out


def ring(sprite, focus, radius, color, arm):
    fx, fy = focus
    for step in range(8):
        angle = step * math.pi / 4 + radius * 0.3
        spark(sprite, (round(fx + radius * math.cos(angle)), round(fy + radius * math.sin(angle))), color, arm)
    return sprite


# The whole figure moved, never reshaped.
def move(sprite, dx, dy):
    out = [[None] * GRID for _ in range(GRID)]
    for y in range(GRID):
        for x in range(GRID):
            if 0 <= x + dx < GRID and 0 <= y + dy < GRID:
                out[y + dy][x + dx] = sprite[y][x]
    return out


def tint(sprite, to, amount):
    return [[None if rgb is None else blend(rgb, to, amount) for rgb in row] for row in sprite]


def puff(sprite, at, radius, color):
    cx, cy = at
    for y in range(cy - radius, cy + radius + 1):
        for x in range(cx - radius, cx + radius + 1):
            if 0 <= x < GRID and 0 <= y < GRID and (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius:
                sprite[y][x] = color
    return sprite


def frames(base, spec):
    fx, fy = spec['focus']
    light, deep = spec['aura']
    lit = (lambda rgb: rgb in spec['glow']) if 'glow' in spec else is_cyan
    top = next(y for y in range(GRID) if any(base[y]))
    sx, sy = spec.get('smoke', (fx - 7, top + 7))
    up = move(base, 0, -LIFT)
    # The focus rides with the figure.
    high = (fx, fy - LIFT)

    idle = [
        base,
        spark(glow(up, high, WHITE, 0.5, lit), (fx - 4, fy - LIFT - 5), WHITE, light),
        spark(glow(up, high, WHITE, 0.25, lit), (fx + 4, fy - LIFT - 7), SPARK, light),
        spark(glow(base, (fx, fy), (20, 50, 120), 0.35, lit), (fx - 5, fy + 1), light, light),
    ]

    cast = []
    for n in range(4):
        sprite, at = (up, high) if n % 2 else (base, (fx, fy))
        cast.append(ring(aura(glow(sprite, at, WHITE, 0.7, lit), n, [light, deep, None]), at, 3 + 2 * n, WHITE if n % 2 else SPARK, light))

    hurt = [
        move(tint(base, WHITE, 0.6), -LIFT, 0),
        move(tint(base, RED, 0.45), LIFT, 0),
        puff(puff(puff(tint(base, RED, 0.2), (sx, sy), 3, SMOKE[0]), (sx + 4, sy - 4), 2, SMOKE[1]), (sx - 3, sy - 5), 2, SMOKE[1]),
    ]
    return {'idle': idle, 'cast': cast, 'hurt': hurt}


def to_image(sprite):
    im = Image.new('RGBA', (len(sprite[0]), len(sprite)))
    im.putdata([(0, 0, 0, 0) if rgb is None else (*rgb, 255) for row in sprite for rgb in row])
    return im


# Each block of source pixels keeps its commonest colour, the darkest on a tie so outlines survive;
# a block mostly see-through stays so.
def bust(sprite, crop, keep=(), ink=1, reink=False):
    left, top, side = crop
    span = lambda i: range(i * side // BUST, (i + 1) * side // BUST)
    out = []
    for y in range(BUST):
        row = []
        for x in range(BUST):
            block = [sprite[top + sy][left + sx] for sy in span(y) for sx in span(x)]
            solid = [rgb for rgb in block if rgb is not None]
            if len(solid) * 2 <= len(block):
                row.append(next((rgb for rgb in solid if rgb in keep), None))
                continue
            counts = Counter()
            for rgb in solid:
                counts[rgb] += ink if sum(rgb) < 60 else 1
            best = max(counts.values())
            row.append(min((c for c, n in counts.items() if n == best), key=sum))
        out.append(row)
    if reink:
        out = unink(out)
    out = despeck(despeck(out, keep), keep)
    if reink:
        out = rim(out)
    # The bottom row gives way to the outline, so the white edge runs under the figure too rather than
    # the figure ending cut off at the frame.
    out[-1] = [None] * BUST
    return outline(out)


def is_ink(rgb):
    return rgb is not None and sum(rgb) < 60


# Outline pixels inside the figure, mostly surrounded by colour, take the commonest colour around them.
def unink(sprite):
    size = len(sprite)
    out = copy(sprite)
    for y in range(size):
        for x in range(size):
            if not is_ink(sprite[y][x]):
                continue
            around = Counter(
                sprite[y + dy][x + dx]
                for dy in (-1, 0, 1)
                for dx in (-1, 0, 1)
                if (dx or dy) and 0 <= x + dx < size and 0 <= y + dy < size and sprite[y + dy][x + dx] is not None and not is_ink(sprite[y + dy][x + dx])
            )
            if sum(around.values()) >= 5:
                out[y][x] = around.most_common(1)[0][0]
    return out


# The figure's edge pixels, those touching see-through or the frame, inked as one line.
def rim(sprite):
    size = len(sprite)
    return [
        [
            INK if rgb is not None and any(not (0 <= x + dx < size and 0 <= y + dy < size) or sprite[y + dy][x + dx] is None for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))) else rgb
            for x, rgb in enumerate(row)
        ]
        for y, row in enumerate(sprite)
    ]


def neighbours(sprite, x, y):
    size = len(sprite)
    return sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + dx < size and 0 <= y + dy < size and sprite[y + dy][x + dx] is not None)


# Strays (a spark, a sliver of staff) with at most one neighbour go, so the outline traces the figure alone.
def despeck(sprite, keep=()):
    return [[None if rgb is not None and rgb not in keep and neighbours(sprite, x, y) <= 1 else rgb for x, rgb in enumerate(row)] for y, row in enumerate(sprite)]


# A white edge around the figure, which the shrink leaves dark-rimmed against a dark terminal.
def outline(sprite):
    return [[WHITE if rgb is None and neighbours(sprite, x, y) > 0 else rgb for x, rgb in enumerate(row)] for y, row in enumerate(sprite)]


# The bust's own trimmings, drawn after its outline on see-through pixels only, in bust pixels: each class
# has its own (`trim`), set in the corner its bust leaves empty and rising with the figure. orb: a charm orb
# with a twinkle hopping round it; shield: a little shield a glint sweeps across; leaf: leaves drifting down
# the side, an arrow streaking past when casting; shadow: purple wisps rising, a crescent when casting; cross:
# a little cross pulsing with holy light; gear: a gear turning, sparking when casting.
CHARM_AT = (BUST - 3, 2)
CORNER_SPARKS = [(18, 13), (1, 15), (19, 16), (0, 13)]

SILVER, STEEL, GOLD = (181, 188, 195), (76, 71, 85), (249, 170, 80)
LEAF, LEAF_DARK, WITHERED = (170, 220, 110), (90, 150, 60), (150, 110, 60)
WISP, WISP_DARK, MOON = (150, 110, 230), (90, 60, 150), (215, 180, 255)
HOLY = (253, 226, 78)
GEAR, GEAR_DARK = (167, 165, 161), (85, 82, 94)


def decorate(sprite, mood, n, spec):
    out = copy(sprite)

    def put(x, y, rgb):
        if 0 <= x < BUST and 0 <= y < BUST and out[y][x] is None:
            out[y][x] = rgb

    lifted = (mood == 'idle' and n in (1, 2)) or (mood == 'cast' and n % 2 == 1)
    up = 1 if lifted else 0
    hurt = [WHITE, RED, SMOKE[1]][n] if mood == 'hurt' else None
    {'orb': orb, 'shield': shield, 'leaf': leaf, 'shadow': shadow, 'cross': cross, 'gear': gear}[spec.get('trim', 'orb')](
        put, mood, n, up, hurt, spec
    )
    return out


def orb(put, mood, n, up, hurt, spec):
    charm, aura = spec['charm'], spec['aura']
    cx, cy = CHARM_AT
    cy -= up
    if mood == 'idle':
        core, rim = [aura[0], WHITE, aura[0], charm][n], charm
    elif mood == 'cast':
        core, rim = WHITE, aura[0]
    else:
        core, rim = [(WHITE, aura[1]), (RED, (150, 25, 25)), (SMOKE[1], SMOKE[1])][n]
    put(cx, cy, core)
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        put(cx + dx, cy + dy, rim)

    if mood == 'idle':
        # One twinkle beside the orb, hopping round it.
        dx, dy = [(-2, -2), (2, -1), (-2, 2), (2, 2)][n]
        put(cx + dx, cy + dy, SPARK if n % 2 else WHITE)
    elif mood == 'cast':
        # Sparks orbit the orb and flash in the corners.
        for k in range(2):
            dx, dy = [(0, -2), (2, 0), (0, 2), (-2, 0)][(n + 2 * k) % 4]
            put(cx + dx, cy + dy, SPARK if k else WHITE)
        for k, (x, y) in enumerate(CORNER_SPARKS):
            if (k + n) % 2 == 0:
                put(x, y, SPARK if k % 2 else WHITE)
    elif n == 2:
        # Smoke curls off the singed orb.
        for x, y in ((cx - 1, cy - 2), (cx, cy - 2), (cx + 1, cy - 3)):
            put(x, y, SMOKE[0])


# A 3x4 kite shield, top-left, its gold boss in the middle.
def shield(put, mood, n, up, hurt, spec):
    x0, y0 = 1, 1 - up
    face = [(0, 0), (1, 0), (2, 0), (0, 1), (2, 1), (0, 2), (1, 2), (2, 2), (1, 3)]
    boss = GOLD
    if mood == 'cast':
        boss = WHITE if n % 2 else GOLD
    if hurt is not None:
        boss = INK if n == 2 else hurt
    for dx, dy in face:
        put(x0 + dx, y0 + dy, SILVER if hurt is None or n == 2 else hurt)
    put(x0 + 1, y0 + 1, boss)
    if mood == 'idle' and n < 3:
        # A glint sweeps across the shield's top.
        put(x0 + n, y0, WHITE)
    elif mood == 'cast':
        # Rays flash off its corners, and a shine in the lower corner.
        for dx, dy in [((-1, -1), (3, -1)), ((-1, 4), (3, 4))][n % 2]:
            put(x0 + dx, y0 + dy, SPARK if n % 2 else WHITE)
        put(1, 10 + (n % 2) * 2, WHITE)
    elif n == 2:
        put(x0 - 1, y0 - 1, SMOKE[0])
        put(x0 + 3, y0 - 1, SMOKE[0])


# Two leaves drifting down the left side; casting, an arrow streaks across the top.
def leaf(put, mood, n, up, hurt, spec):
    green, dark = (WITHERED, SMOKE[1]) if hurt is not None else (LEAF, LEAF_DARK)
    paths = [[(1, 3), (2, 6), (1, 9), (0, 12)], [(0, 14), (1, 17), (2, 1), (1, 0)]]
    for path in paths:
        x, y = path[n % len(path)]
        put(x, y - up, green)
        put(x + 1, y + 1 - up, dark)
    if mood == 'cast':
        tail = 2 * n - 3
        for k, rgb in enumerate([LEAF, (167, 82, 54), (167, 82, 54), SILVER]):
            put(tail + k, 1, rgb)


# Purple wisps curling up the top-right corner; casting, a crescent moon and a dagger's glint below.
def shadow(put, mood, n, up, hurt, spec):
    wisps = [[(15, 2), (17, 4)], [(16, 1), (18, 3)], [(17, 0), (16, 3)], [(18, 2), (15, 1)]][n % 4]
    for k, (x, y) in enumerate(wisps):
        put(x, y - up, hurt if hurt is not None else (WISP if k == 0 else WISP_DARK))
    if mood == 'cast':
        for x, y in ((18, 0), (17, 1), (17, 2), (18, 3)):
            put(x + 1, y, MOON)
        put(1 + n % 2, 16 + 2 * (n % 2), WHITE)
    elif n == 2 and hurt is not None:
        for x, y in ((16, 2), (17, 1), (18, 2)):
            put(x, y, SMOKE[0])


# A little cross in the top-right corner, its heart pulsing; casting, motes of light rising beside the figure.
def cross(put, mood, n, up, hurt, spec):
    x0, y0 = 18, 0 - up
    heart = {'idle': [HOLY, WHITE, (255, 250, 210), HOLY][n % 4], 'cast': WHITE}.get(mood, hurt)
    for dx, dy in ((0, 0), (-1, 1), (1, 1), (0, 2), (0, 3)):
        put(x0 + dx, y0 + dy + up * 0, HOLY if hurt is None else (SMOKE[1] if n == 2 else hurt))
    put(x0, y0 + 1, heart)
    if mood == 'idle' and n % 2:
        put(19, 5, WHITE)
    elif mood == 'cast':
        for x, y in ((18, 18 - 2 * n), (19, 15 - 2 * n), (0, 14 - 2 * n)):
            put(x, y, HOLY if n % 2 else WHITE)


# A gear in the top-right corner, its teeth turning an eighth each frame; casting, sparks crackle top-left.
def gear(put, mood, n, up, hurt, spec):
    cx, cy = 17, 2 - up
    ring = [(dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy]
    straight, diagonal = [(0, -2), (-2, 0), (2, 0), (0, 2)], [(-2, -2), (2, -2), (-2, 2), (2, 2)]
    turning = hurt is None
    teeth = (straight if n % 2 == 0 or not turning else diagonal)
    body = GEAR if hurt is None else (SMOKE[1] if n == 2 else hurt)
    for dx, dy in ring:
        put(cx + dx, cy + dy, body)
    for dx, dy in teeth:
        put(cx + dx, cy + dy, GEAR_DARK if hurt is None else body)
    if mood == 'cast':
        put(cx, cy, (255, 240, 150))
        for x, y in [[(1, 3), (2, 4), (1, 5)], [(0, 2), (1, 3), (0, 4)], [(2, 2), (1, 3), (2, 4)], [(1, 4), (0, 5), (1, 6)]][n]:
            put(x, y, (255, 240, 150) if (x + y) % 2 else WHITE)
    elif n == 2 and hurt is not None:
        for x, y in ((cx - 1, cy - 3), (cx + 1, cy - 3)):
            put(x, y, SMOKE[0])


def encode(sprite):
    def color(rgb):
        return None if rgb is None else (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]

    words = []
    for row in range(BUST // 2):
        for col in range(BUST):
            top, bottom = color(sprite[2 * row][col]), color(sprite[2 * row + 1][col])
            if top is None and bottom is None:
                words += [SPACE, DEFAULT, DEFAULT]
            elif top is None:
                # A default foreground is the text colour, not see-through: draw the lower half instead.
                words += [LOWER_HALF, bottom, DEFAULT]
            elif bottom is None:
                words += [UPPER_HALF, top, DEFAULT]
            else:
                words += [UPPER_HALF, top, bottom]
    return base64.b64encode(struct.pack(f'<{len(words)}I', *words)).decode()


def main():
    built = {}
    for src in sorted((ROOT / 'tools' / 'portraits').glob('*.png')):
        name = src.stem
        if name not in CLASSES:
            raise SystemExit(f'{src}: add {name} to CLASSES')
        spec = {**DEFAULTS, **CLASSES[name]}
        base = load(src)
        if 'mirror' in spec:
            base = mirror(base, spec['mirror'])
        for x, y, rgb in spec.get('patch', []):
            base[y][x] = rgb
        # The bust's own source: every bust-only edit is made here, before the frames move the figure, so a
        # lift or a shake carries the edits along instead of sliding the figure under edits fixed in place.
        painted = copy(base)
        for x0, y0, x1, y1, colours, to in spec.get('bust_paint', []):
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    if painted[y][x] in colours:
                        painted[y][x] = to
        for x0, y0, x1, y1 in spec.get('clear', []):
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    painted[y][x] = None
        left, top, side = spec['crop']
        scale = side // BUST

        def block(bx, by):
            return [(left + bx * scale + dx, top + by * scale + dy) for dy in range(scale) for dx in range(scale)]

        if 'bust_mirror' in spec:
            axis, bx0, by0, bx1, by1 = spec['bust_mirror']
            source = copy(painted)
            for by in range(by0, by1 + 1):
                for bx in range(bx0, bx1 + 1):
                    for (sx, sy), (tx, ty) in zip(block(bx, by), block(axis - bx, by)):
                        painted[ty][tx] = source[sy][sx]
        rows = [(x + k, y, spec['bust_palette'][ch]) for y, x, text in spec.get('bust_rows', []) for k, ch in enumerate(text)]
        for bx, by, rgb in spec.get('bust_patch', []) + rows:
            for x, y in block(bx, by):
                painted[y][x] = rgb
        if spec.get('smooth'):
            held = {(bx, by) for bx, by, _ in spec.get('bust_patch', []) + rows}
            held |= {(x, y) for x0, y0, x1, y1 in spec.get('bust_hold', []) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}
            shown = bust(painted, spec['crop'], keep=spec.get('keep', ()), ink=spec.get('ink', 1), reink=spec.get('reink', False))
            for by in range(BUST):
                for bx in range(BUST):
                    rgb = shown[by][bx]
                    if rgb in (None, WHITE) or rgb in spec.get('keep', ()) or (bx, by) in held:
                        continue
                    around = [
                        shown[by + dy][bx + dx]
                        for dy in (-1, 0, 1)
                        for dx in (-1, 0, 1)
                        if (dx or dy) and 0 <= bx + dx < BUST and 0 <= by + dy < BUST and shown[by + dy][bx + dx] not in (None, WHITE)
                    ]
                    if len(around) >= 3 and rgb not in around:
                        fill = Counter(around).most_common(1)[0][0]
                        for x, y in block(bx, by):
                            painted[y][x] = fill
        # The bust's frames come from that source, through the same moves, tints and trimmings.
        built[name] = (frames(base, spec), frames(painted, spec))

    counts = {mood: len(sprites) for mood, sprites in next(iter(built.values()))[0].items()}
    lines = [
        '// Generated by tools/make-portraits.py from tools/portraits/*.png; do not edit by hand.',
        "import type { Mood } from './anim'",
        "import type { HeroClassId } from './hero-cells'",
        '',
        '// Frames per mood of every portrait: assets/portraits/<class>/<mood>-<n>.png.',
        f"export const PORTRAIT_FRAMES: Record<Mood, number> = {{ {', '.join(f'{m}: {n}' for m, n in counts.items())} }}",
        '',
        '// The classes with a portrait, and the same frames as busts in Raster cells.',
        'export const PORTRAIT_BUSTS: Partial<Record<HeroClassId, Record<Mood, readonly string[]>>> = {',
    ]
    previews = []
    for name, (moods, bust_moods) in built.items():
        out_dir = ROOT / 'assets' / 'portraits' / name
        scene = backdrop(name, CLASSES[name].get('scene_dim', 0))
        out_dir.mkdir(parents=True, exist_ok=True)
        for stale in [*out_dir.glob('*.png'), *out_dir.glob('*.svg')]:
            stale.unlink()
        lines.append(f'  {name}: {{')
        for mood, sprites in moods.items():
            if len(sprites) != counts[mood]:
                raise SystemExit(f'{name} {mood}: {len(sprites)} frames, not {counts[mood]}')
            lines.append(f'    {mood}: [')
            for n, sprite in enumerate(sprites):
                shown = picture(sprite, scene)
                shown.resize((GRID * SCALE, GRID * SCALE), Image.NEAREST).save(out_dir / f'{mood}-{n}.png', optimize=True)
                spec = {**DEFAULTS, **CLASSES[name]}
                small = bust(bust_moods[mood][n], spec['crop'], keep=spec.get('keep', ()), ink=spec.get('ink', 1), reink=spec.get('reink', False))
                if 'charm' in spec:
                    small = decorate(small, mood, n, spec)
                lines.append(f"      '{encode(small)}',")
                previews.append((shown, small))
            lines.append('    ],')
        lines.append('  },')
    lines += ['}', '']
    (ROOT / 'hooks' / 'portrait-cells.ts').write_text('\n'.join(lines))

    tile, gap = 192, 12
    sheet = Image.new('RGBA', (len(previews) * (tile + gap), tile * 2 + gap), (30, 30, 30, 255))
    for n, (shown, small) in enumerate(previews):
        x = n * (tile + gap)
        sheet.alpha_composite(shown.resize((tile, tile), Image.NEAREST), (x, 0))
        sheet.alpha_composite(to_image(small).resize((tile, tile), Image.NEAREST), (x, tile + gap))
    sheet.save(ROOT / 'tools' / 'portraits-preview.png')
    print(f'{len(built)} portraits ({", ".join(built)}), frames {counts}')


if __name__ == '__main__':
    main()
