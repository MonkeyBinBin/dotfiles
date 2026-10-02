import sys
from PIL import Image
PAL = {
 '.': None,
 'B': (30,144,255), 'b': (120,200,255),
 'S': (247,196,140), 's': (232,150,60),
 'K': (20,20,20), 'W': (255,255,255), 'P': (255,105,160),
 'R': (229,57,53), 'r': (150,25,25),
 'U': (40,120,235), 'Y': (255,210,60),
 'L': (240,240,240), 'G': (170,170,170),
 'N': (150,85,35), 'n': (95,50,20),
 'H': (217,119,87), 'h': (160,78,55), 'V': (98,78,190), 'v': (64,48,135),
 'C': (150,240,255), 'c': (60,170,225), 'E': (238,238,248), 'e': (185,185,210),
 'O': (40,32,64), 'l': (255,232,190), 'u': (25,80,170),
}
GRID = open(sys.argv[1]).read().split('\n')
GRID = [row for row in GRID if row.strip()]
assert len(GRID) == 20, len(GRID)
im = Image.new('RGBA', (20, 20), (0,0,0,0))
for y,row in enumerate(GRID):
    assert len(row) == 20, (y, len(row), row)
    for x,ch in enumerate(row):
        c = PAL[ch]
        if c: im.putpixel((x,y), c + (255,))
im.save(sys.argv[2])
bg = Image.new('RGBA', (240,240), (30,30,40,255)); bg.alpha_composite(im.resize((240,240), Image.NEAREST))
ref = Image.open(sys.argv[3]).convert('RGBA').resize((240,240))
light = Image.new('RGBA', (240,240), (245,245,245,255)); light.alpha_composite(im.resize((240,240), Image.NEAREST)); ref = light
out = Image.new('RGBA', (490,240), (255,255,255,255)); out.paste(bg,(0,0)); out.paste(ref,(250,0), ref)
out.save(sys.argv[4])
