#!/usr/bin/env python3
"""Builds the game's pixel sprite atlas from two CC0 packs by Kenney (www.kenney.nl).

    python3 scripts/build-pixel-atlas.py <rpg-urban-pack dir> <roguelike-indoor-pack dir>

Downloads (both CC0, also mirrored on opengameart.org):
  RPG Urban Pack        https://opengameart.org/content/rpg-urban-pack
  Roguelike Indoor pack https://opengameart.org/content/roguelike-indoor-pack

Writes frontend/public/assets/pixel-museum.png and frontend/src/pixel-atlas.ts (frame rectangles).
No dependencies: PNG decoding and encoding are done here with zlib.

What it makes, beyond copying tiles:
  * cop: the hard-hat worker recoloured into a navy uniform and helmet.
  * thief: the dark-haired character with a black burglar mask over the eyes. The striped shirt is
    split into its own greyscale layer (thief-shirt-*) so the game can tint it with each player's colour.
  * statue: a character turned to stone and stood on a plinth (neither pack has a statue).
  * loot: trinkets from the indoor pack set on small plinths.
"""
import os, struct, sys, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = 16


def read_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', path
    pos, idat, plte, trns = 8, b'', None, None
    while pos < len(data):
        n, kind = struct.unpack('>I4s', data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        pos += 12 + n
        if kind == b'IHDR':
            w, h, depth, ctype, _, _, interlace = struct.unpack('>IIBBBBB', body)
        elif kind == b'PLTE':
            plte = [tuple(body[i:i + 3]) for i in range(0, len(body), 3)]
        elif kind == b'tRNS':
            trns = body
        elif kind == b'IDAT':
            idat += body
    assert interlace == 0 and depth == 8, 'only 8-bit, non-interlaced PNGs'
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    stride, raw, rows, prev, i = w * channels, zlib.decompress(idat), [], bytearray(w * channels), 0
    for _ in range(h):
        f, line = raw[i], bytearray(raw[i + 1:i + 1 + stride])
        i += 1 + stride
        for x in range(stride):
            a = line[x - channels] if x >= channels else 0
            b = prev[x]
            c = prev[x - channels] if x >= channels else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line)
        prev = line
    px = []
    for line in rows:
        out = []
        for x in range(w):
            s = line[x * channels:(x + 1) * channels]
            if ctype == 6: out.append(tuple(s))
            elif ctype == 2: out.append((*s, 255))
            elif ctype == 0: out.append((s[0], s[0], s[0], 255))
            elif ctype == 4: out.append((s[0], s[0], s[0], s[1]))
            else: out.append((*plte[s[0]], trns[s[0]] if trns and s[0] < len(trns) else 255))
        px.append(out)
    return px


def write_png(path, px):
    h, w = len(px), len(px[0])
    raw = b''.join(b'\x00' + bytes(c for p in row for c in p) for row in px)

    def chunk(kind, body):
        return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def hexc(s, a=255):
    return (int(s[1:3], 16), int(s[3:5], 16), int(s[5:7], 16), a)


CLEAR = (0, 0, 0, 0)


def blank(w, h):
    return [[CLEAR] * w for _ in range(h)]


def tile(sheet, c, r, spacing=0):
    s = T + spacing
    return [row[c * s:c * s + T] for row in sheet[r * s:r * s + T]]


def stack(*parts):
    """Stacks equal-width images vertically."""
    return [list(row) for part in parts for row in part]


def paste(dst, src, dx, dy):
    for y, row in enumerate(src):
        for x, p in enumerate(row):
            if p[3] and 0 <= y + dy < len(dst) and 0 <= x + dx < len(dst[0]):
                dst[y + dy][x + dx] = p
    return dst


def recolour(img, mapping):
    return [[mapping.get('#%02x%02x%02x' % p[:3], p) if p[3] else p for p in row] for row in img]


def bottom(img):
    return max(y for y, row in enumerate(img) if any(p[3] for p in row))


def art(rows, palette):
    return [[palette[ch] if ch in palette else CLEAR for ch in row] for row in rows]


# --- characters ------------------------------------------------------------------------------
DIRS = ['left', 'down', 'up', 'right']   # source columns 23..26
COP_ROWS, THIEF_ROWS, STATUE_ROW = 9, 15, 12

COP = {k: hexc(v) for k, v in {
    '#874d27': '#141c30',                                            # helmet outline
    '#f5a94c': '#46609a', '#da923e': '#34497a', '#bc7d36': '#26375e',  # helmet
    '#c5b993': '#9fb8d9', '#d6d4aa': '#c9d8ec',                      # shirt and collar
    '#a19dcc': '#3c5080', '#918eb9': '#2e3f69', '#7a77a4': '#222f50',  # uniform
    '#dc8652': '#24242a',                                            # shoes
}.items()}
THIEF = {k: hexc(v) for k, v in {
    '#ff7143': '#151517',                     # headband becomes the mask strap
    '#aaa8bd': '#30323e', '#898ca6': '#25262f',  # dark trousers
}.items()}
SHIRT = {'#c77b47': 0, '#a9673b': 1}      # main, shadow
SKIN = {'#ffc999', '#f1b089', '#ffc8a1'}
EYE = '#654140'


def thief_frame(src):
    body = recolour(src, THIEF)
    shirt = blank(T, T)
    for y in range(T):
        for x in range(T):
            p = src[y][x]
            k = '#%02x%02x%02x' % p[:3]
            if p[3] and k in SHIRT:
                # Burglar stripes: alternate light and dark rows, kept as grey so the game can tint them.
                level = (238, 118)[y % 2] if SHIRT[k] == 0 else (178, 92)[y % 2]
                shirt[y][x] = (level, level, level, 255)
                body[y][x] = CLEAR
    # The mask: on rows with an eye in them, skin turns black and the eyes show through as whites.
    for y in range(4, 11):
        keys = ['#%02x%02x%02x' % p[:3] for p in src[y]]
        if EYE not in keys:
            continue
        for x, k in enumerate(keys):
            if not src[y][x][3]:
                continue
            if k in SKIN:
                body[y][x] = hexc('#151517')
            elif k == EYE:
                body[y][x] = hexc('#efe6cf')
    return body, shirt


STONE = ['#56534d', '#7d796f', '#a39d90', '#c8c1b1', '#e6e0d1']


def stone(img):
    out = blank(len(img[0]), len(img))
    for y, row in enumerate(img):
        for x, p in enumerate(row):
            if not p[3]:
                continue
            k = '#%02x%02x%02x' % p[:3]
            if k == '#8d5243':
                out[y][x] = hexc('#3b3934')
                continue
            lum = .299 * p[0] + .587 * p[1] + .114 * p[2]
            out[y][x] = hexc(STONE[0 if lum < 90 else 1 if lum < 130 else 2 if lum < 170 else 3 if lum < 205 else 4])
    return out


PLINTH = art([
    '..KKKKKKKKKKKK..',
    '.KTTTTTTTTTTTTK.',
    '.KMMMMMMMMMMMMK.',
    '..KDDDDDDDDDDK..',
    '..KMMMMMMMMMMK..',
    '..KMMMLMMMMMMK..',
    '.KDDDDDDDDDDDDK.',
    '.KKKKKKKKKKKKKK.',
], {'K': hexc('#3b3934'), 'T': hexc('#ddd6c6'), 'M': hexc('#b0a999'), 'D': hexc('#8a8478'), 'L': hexc('#c8c1b1')})

LOW_PLINTH = art([
    '...KKKKKKKKKK...',
    '..KTTTTTTTTTTK..',
    '..KMMMMMMMMMMK..',
    '..KDDDDDDDDDDK..',
    '..KMMMMMMMMMMK..',
    '..KKKKKKKKKKKK..',
], {'K': hexc('#2a2723'), 'T': hexc('#6d5a49'), 'M': hexc('#4f4034'), 'D': hexc('#3a2f27')})

SHADOW = art([
    '...xxxxxxxxxx...',
    '.xxxxxxxxxxxxxx.',
    '.xxxxxxxxxxxxxx.',
    '...xxxxxxxxxx...',
], {'x': (5, 6, 5, 105)})

SPARKLE = art([
    '..a..',
    '..a..',
    'aabaa',
    '..a..',
    '..a..',
], {'a': hexc('#f1c46a'), 'b': hexc('#fff6d8')})


def on_plinth(item, plinth, overlap=1):
    """Sets an item on a plinth: the item's lowest opaque row rests on the plinth's top edge."""
    b = bottom(item)
    h = b + 1 + len(plinth) - overlap
    out = blank(T, h)
    paste(out, plinth, 0, b + 1 - overlap)
    paste(out, [row for row in item[:b + 1]], 0, 0)
    return out


def main(urban_dir, indoor_dir):
    U = read_png(os.path.join(urban_dir, 'Tilemap', 'tilemap_packed.png'))
    I = read_png(os.path.join(indoor_dir, 'Spritesheet', 'roguelikeIndoor_transparent.png'))
    ui = lambda c, r: tile(U, c, r)
    ii = lambda c, r: tile(I, c, r, 1)
    frames = {}
    for d, direction in enumerate(DIRS):
        for f in range(3):
            frames[f'cop-{direction}-{f}'] = recolour(ui(23 + d, COP_ROWS + f), COP)
            body, shirt = thief_frame(ui(23 + d, THIEF_ROWS + f))
            frames[f'thief-{direction}-{f}'] = body
            frames[f'thief-shirt-{direction}-{f}'] = shirt
    frames['plant'] = ii(16, 0)
    # The indoor pack's two-tile bench, shortened by trimming its repeating middle.
    frames['bench'] = [a[:12] + b[4:] for a, b in zip(ii(10, 4), ii(11, 4))]
    frames['bin'] = ui(9, 10)
    frames['statue'] = on_plinth(stone(ui(24, STATUE_ROW)), PLINTH)
    for n, (c, r) in enumerate([(20, 1), (22, 10), (19, 1), (22, 9)]):
        frames[f'loot-{n}'] = on_plinth(ii(c, r), LOW_PLINTH)
    for n, c in enumerate([19, 20, 21]):
        frames[f'painting-{n}'] = stack(ii(c, 15), ii(c, 16))
        frames[f'wall-art-{n}'] = ii(19, 12 + n)
    frames['van'] = [a + b for a, b in zip(ui(21, 16), ui(22, 16))]
    frames['shadow'] = SHADOW
    frames['sparkle'] = SPARKLE

    # Shelf-pack with a 1px gutter so nearest-neighbour sampling never bleeds between frames.
    W, x, y, shelf, rects = 256, 1, 1, 0, {}
    for name, img in frames.items():
        w, h = len(img[0]), len(img)
        if x + w + 1 > W:
            x, y, shelf = 1, y + shelf + 1, 0
        rects[name] = (x, y, w, h)
        x += w + 1
        shelf = max(shelf, h)
    H = y + shelf + 1
    sheet = blank(W, H)
    for name, (fx, fy, _, _) in rects.items():
        paste(sheet, frames[name], fx, fy)
    png_path = os.path.join(ROOT, 'frontend', 'public', 'assets', 'pixel-museum.png')
    write_png(png_path, sheet)
    ts = ['// Generated by scripts/build-pixel-atlas.py. Do not edit by hand.',
          '// Sprites from Kenney\'s RPG Urban Pack and Roguelike Indoor pack (CC0, www.kenney.nl).',
          'export const PIXEL_ATLAS = \'/assets/pixel-museum.png\';',
          'export const PIXEL_FRAMES: Record<string, [x: number, y: number, w: number, h: number]> = {']
    ts += [f"    '{name}': [{fx}, {fy}, {fw}, {fh}]," for name, (fx, fy, fw, fh) in rects.items()]
    ts.append('};')
    with open(os.path.join(ROOT, 'frontend', 'src', 'pixel-atlas.ts'), 'w') as f:
        f.write('\n'.join(ts) + '\n')
    print(f'{len(rects)} frames, {W}x{H} -> {png_path}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
