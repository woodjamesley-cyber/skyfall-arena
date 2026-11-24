#!/usr/bin/env python3
"""Generate Skyfall Arena launcher icons and splash screens with no dependencies."""
import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')

CYAN = (92, 225, 255)
CYAN_LIGHT = (155, 255, 214)
ORANGE = (255, 154, 92)
DARK = (7, 11, 18)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def in_poly(px, py, points):
    inside = False
    j = len(points) - 1
    for i in range(len(points)):
        xi, yi = points[i]
        xj, yj = points[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi):
            inside = not inside
        j = i
    return inside


def hex_points(cx, cy, r):
    return [(cx + r * math.cos(math.pi / 6 + i * math.pi / 3), cy + r * math.sin(math.pi / 6 + i * math.pi / 3)) for i in range(6)]


BOLT = [(0.55, 0.18), (0.33, 0.55), (0.48, 0.55), (0.43, 0.84), (0.68, 0.45), (0.52, 0.45), (0.60, 0.18)]


def sample(px, py, mode):
    """Return RGBA 0-255 for a normalised point."""
    if mode == 'fg':
        cx, cy = 0.5, 0.5
        scale = 0.72
    else:
        cx, cy = 0.5, 0.5
        scale = 1.0
    # rounded-square background
    if mode != 'fg':
        if mode == 'round':
            inside_bg = (px - 0.5) ** 2 + (py - 0.5) ** 2 <= 0.25
        else:
            r = 0.22
            qx = min(max(px, r), 1 - r)
            qy = min(max(py, r), 1 - r)
            inside_bg = (px - qx) ** 2 + (py - qy) ** 2 <= r * r
        if not inside_bg:
            return (0, 0, 0, 0)
        t = (px + py) / 2
        base = lerp((18, 42, 68), (5, 10, 18), t)
        # subtle glow in top-right
        g = max(0.0, 1 - math.hypot(px - 0.78, py - 0.2) / 0.65)
        base = lerp(base, (24, 70, 100), g * 0.55)
    else:
        base = (0, 0, 0, 0)

    hx, hy = (px - cx) / scale + 0.5, (py - cy) / scale + 0.5
    # hexagon ring
    outer = hex_points(0.5, 0.5, 0.345)
    inner = hex_points(0.5, 0.5, 0.305)
    if in_poly(hx, hy, outer) and not in_poly(hx, hy, inner):
        t = hy
        col = lerp(CYAN, CYAN_LIGHT, t)
        return (col[0], col[1], col[2], 255)
    # lightning bolt
    if in_poly(hx, hy, BOLT):
        t = (hy - 0.18) / 0.66
        col = lerp(CYAN_LIGHT, CYAN, min(1, max(0, t)))
        return (col[0], col[1], col[2], 255)
    if mode != 'fg' and base[3] if len(base) == 4 else False:
        return (0, 0, 0, 0)
    if mode == 'fg':
        return (0, 0, 0, 0)
    return (base[0], base[1], base[2], 255)


def draw(size, mode):
    ss = 2
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            r = g = b = a = 0
            for sy in range(ss):
                for sx in range(ss):
                    px = (x + (sx + 0.5) / ss) / size
                    py = (y + (sy + 0.5) / ss) / size
                    c = sample(px, py, mode)
                    r += c[0] * c[3]
                    g += c[1] * c[3]
                    b += c[2] * c[3]
                    a += c[3]
            n = ss * ss
            if a > 0:
                row += bytes((int(r / a), int(g / a), int(b / a), int(a / n)))
            else:
                row += b'\x00\x00\x00\x00'
        rows.append(bytes(row))
    return rows


def write_png(path, width, height, rows):
    raw = b''.join(b'\x00' + row for row in rows)
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(png)


def solid_splash(width, height):
    """Small dark splash bitmap; Android stretches it to fill the window."""
    rows = []
    for y in range(height):
        row = bytearray()
        for x in range(width):
            t = (x / max(1, width - 1) + y / max(1, height - 1)) / 2
            bg = lerp((13, 26, 42), (5, 8, 14), t)
            row += bytes((bg[0], bg[1], bg[2], 255))
        rows.append(bytes(row))
    return rows


def main():
    launcher = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    for density, size in launcher.items():
        d = os.path.join(RES, 'mipmap-' + density)
        write_png(os.path.join(d, 'ic_launcher.png'), size, size, draw(size, 'full'))
        write_png(os.path.join(d, 'ic_launcher_round.png'), size, size, draw(size, 'round'))
        fg = int(size * 108 / 48)
        write_png(os.path.join(d, 'ic_launcher_foreground.png'), fg, fg, draw(fg, 'fg'))
    write_png(os.path.join(ROOT, 'assets', 'icon-512.png'), 512, 512, draw(512, 'full'))

    for folder in os.listdir(RES):
        if not folder.startswith('drawable'):
            continue
        path = os.path.join(RES, folder, 'splash.png')
        if not os.path.exists(path):
            continue
        # tiny scalable bitmap keeps generation instant across all densities
        write_png(path, 96, 54, solid_splash(96, 54))
    print('icons and splashes generated')


if __name__ == '__main__':
    main()
