#!/usr/bin/env python3
"""Generate the app icons (PNG + SVG) with only the standard library.

    python3 scripts/make_icons.py

Design: a hue ring around a coral centre on a dark tile. The "maskable" icon is
full-bleed with the artwork inside the central safe zone; the "any" icons have
rounded transparent corners.
"""
import colorsys
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
BG = (22, 22, 26)
CENTRE = (231, 111, 81)


def smooth(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def render(size, maskable):
    """Return RGBA bytes. Coordinates are normalised to 0..1 across the tile."""
    px = 1.0 / size  # one pixel in normalised units
    scale = 0.86 if maskable else 1.0  # keep art inside the maskable safe zone
    r_out, r_in, r_dot = 0.36 * scale, 0.235 * scale, 0.17 * scale
    corner = 0.0 if maskable else 0.22
    rows = bytearray()
    for y in range(size):
        rows.append(0)  # PNG filter: none
        for x in range(size):
            u, v = (x + 0.5) * px - 0.5, (y + 0.5) * px - 0.5
            # tile shape (rounded square SDF)
            q = (abs(u) - (0.5 - corner), abs(v) - (0.5 - corner))
            d_tile = math.hypot(max(q[0], 0), max(q[1], 0)) + min(max(q[0], q[1]), 0) - corner
            a_tile = 1 - smooth(-px, px, d_tile) if corner else 1.0
            col = BG
            r = math.hypot(u, v)
            # hue ring (0° at the top, clockwise)
            a_ring = smooth(-px, px, r_out - r) * smooth(-px, px, r - r_in)
            if a_ring > 0:
                hue = (math.degrees(math.atan2(u, -v)) % 360) / 360
                rgb = [round(c * 255) for c in colorsys.hls_to_rgb(hue, 0.58, 0.85)]
                col = tuple(round(col[i] * (1 - a_ring) + rgb[i] * a_ring) for i in range(3))
            # centre disc
            a_dot = smooth(-px, px, r_dot - r)
            if a_dot > 0:
                col = tuple(round(col[i] * (1 - a_dot) + CENTRE[i] * a_dot) for i in range(3))
            rows += bytes((*col, round(255 * a_tile)))
    return bytes(rows)


def write_png(path, size, maskable):
    raw = render(size, maskable)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", os.path.relpath(path), len(png), "bytes")


def write_svg(path):
    """Same artwork as vector: 24 wedge arcs forming the ring."""
    cx = cy = 256
    r_mid, width = 0.2975 * 512, (0.36 - 0.235) * 512
    parts = []
    n = 24
    for i in range(n):
        a0, a1 = 360 * i / n - 0.4, 360 * (i + 1) / n + 0.4
        hue = (i + 0.5) / n
        rgb = tuple(round(c * 255) for c in colorsys.hls_to_rgb(hue, 0.58, 0.85))

        def pt(a):
            t = math.radians(a)
            return cx + r_mid * math.sin(t), cy - r_mid * math.cos(t)

        (x0, y0), (x1, y1) = pt(a0), pt(a1)
        parts.append(
            f'<path d="M{x0:.2f} {y0:.2f}A{r_mid:.2f} {r_mid:.2f} 0 0 1 {x1:.2f} {y1:.2f}" '
            f'stroke="#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"/>'
        )
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
        '<rect width="512" height="512" rx="113" fill="#16161a"/>'
        f'<g fill="none" stroke-width="{width:.1f}">' + "".join(parts) + "</g>"
        f'<circle cx="256" cy="256" r="{0.17 * 512:.1f}" fill="#e76f51"/>'
        "</svg>\n"
    )
    with open(path, "w") as f:
        f.write(svg)
    print("wrote", os.path.relpath(path), len(svg), "bytes")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    write_png(os.path.join(OUT, "icon-192.png"), 192, False)
    write_png(os.path.join(OUT, "icon-512.png"), 512, False)
    write_png(os.path.join(OUT, "icon-maskable-512.png"), 512, True)
    write_png(os.path.join(OUT, "apple-touch-icon.png"), 180, True)
    write_svg(os.path.join(OUT, "icon.svg"))
