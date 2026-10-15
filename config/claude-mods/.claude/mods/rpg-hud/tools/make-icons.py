"""Build the menu icons' pictures from tools/icons/menu.png into assets/icons/.

Usage: python3 tools/make-icons.py
The source is a row of five 24x18 pixel-art icons (any whole-number upscale) over a solid magenta background,
in MENU's order. Per icon it writes assets/icons/<tab>.png and <tab>-dim.png, upscaled 8x, which a terminal
that draws pictures shows on the selected and the other cards. Everywhere else (a terminal without pictures,
the desktop, which scrubs pictures out of SVG) the cards draw MENU's own 9x8 icons, drawn by hand: a shrink of
these loses them. tools/icons-preview.png shows both pictures of each.
"""
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
TABS = ['spells', 'pets', 'map', 'skills', 'jobs']
WIDTH, HEIGHT = 24, 18
SCALE = 8
# The terminal's unselected cards show their icon at this share of its brightness, as the text icons do.
DIM = 0.4


def load(path):
    im = Image.open(path).convert('RGBA').resize((WIDTH * len(TABS), HEIGHT), Image.NEAREST)
    px = im.load()

    def pixel(p):
        r, g, b, a = p
        return None if a < 128 or (r > 200 and g < 60 and b > 200) else (r, g, b)

    return [[pixel(px[x, y]) for x in range(im.width)] for y in range(im.height)]


def to_image(art, scale=1, dim=1.0):
    im = Image.new('RGBA', (len(art[0]), len(art)))
    im.putdata([(0, 0, 0, 0) if rgb is None else (*(round(c * dim) for c in rgb), 255) for row in art for rgb in row])
    return im.resize((im.width * scale, im.height * scale), Image.NEAREST)


def main():
    sheet = load(ROOT / 'tools' / 'icons' / 'menu.png')
    out_dir = ROOT / 'assets' / 'icons'
    out_dir.mkdir(parents=True, exist_ok=True)
    tile, gap = 144, 12
    preview = Image.new('RGBA', (len(TABS) * (tile + gap), tile * 2 + gap), (30, 30, 30, 255))
    for i, tab in enumerate(TABS):
        art = [row[i * WIDTH:(i + 1) * WIDTH] for row in sheet]
        to_image(art, SCALE).save(out_dir / f'{tab}.png', optimize=True)
        to_image(art, SCALE, DIM).save(out_dir / f'{tab}-dim.png', optimize=True)
        x = i * (tile + gap)
        preview.alpha_composite(to_image(art).resize((tile, tile * HEIGHT // WIDTH), Image.NEAREST), (x, 0))
        preview.alpha_composite(to_image(art, 1, DIM).resize((tile, tile * HEIGHT // WIDTH), Image.NEAREST), (x, tile + gap))
    preview.save(ROOT / 'tools' / 'icons-preview.png')
    print(f'{len(TABS)} icons: {", ".join(TABS)}')


if __name__ == '__main__':
    main()
