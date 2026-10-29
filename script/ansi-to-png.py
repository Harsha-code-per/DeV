"""Render a `tmux capture-pane -e -p` dump (ANSI, 24-bit colour) to a PNG, to look at the TUI.

Run the TUI from packages/devcode (its bunfig preload is needed) inside tmux, then:
  tmux capture-pane -e -p -t <session> > screen.txt && python3 -I script/ansi-to-png.py screen.txt screen.png
"""
import re
import sys

from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
default_bg = tuple(int(sys.argv[3][i : i + 2], 16) for i in (0, 2, 4)) if len(sys.argv) > 3 else (12, 11, 9)
default_fg = (230, 230, 230)

regular = ImageFont.truetype("/usr/share/fonts/TTF/DejaVuSansMono.ttf", 15)
bold = ImageFont.truetype("/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf", 15)
cw, ch = 9, 19

base16 = [
    (0, 0, 0), (205, 49, 49), (13, 188, 121), (229, 229, 16), (36, 114, 200), (188, 63, 188), (17, 168, 205), (229, 229, 229),
    (102, 102, 102), (241, 76, 76), (35, 209, 139), (245, 245, 67), (59, 142, 234), (214, 112, 214), (41, 184, 219), (255, 255, 255),
]


def xterm256(n):
    if n < 16:
        return base16[n]
    if n < 232:
        n -= 16
        steps = [0, 95, 135, 175, 215, 255]
        return (steps[n // 36], steps[(n // 6) % 6], steps[n % 6])
    v = 8 + (n - 232) * 10
    return (v, v, v)


lines = open(src, encoding="utf-8", errors="replace").read().split("\n")
cells = []
for line in lines:
    fg, bg, is_bold, row = default_fg, None, False, []
    for token in re.split(r"(\x1b\[[0-9;:]*m)", line):
        if token.startswith("\x1b["):
            codes = [int(c) if c else 0 for c in re.split("[;:]", token[2:-1])] or [0]
            i = 0
            while i < len(codes):
                c = codes[i]
                if c == 0:
                    fg, bg, is_bold = default_fg, None, False
                elif c == 1:
                    is_bold = True
                elif c == 22:
                    is_bold = False
                elif c == 39:
                    fg = default_fg
                elif c == 49:
                    bg = None
                elif c in (38, 48) and i + 1 < len(codes):
                    if codes[i + 1] == 2 and i + 4 < len(codes):
                        color = tuple(codes[i + 2 : i + 5])
                        i += 4
                    else:
                        color = xterm256(codes[i + 2])
                        i += 2
                    if c == 38:
                        fg = color
                    else:
                        bg = color
                elif 30 <= c <= 37:
                    fg = base16[c - 30]
                elif 90 <= c <= 97:
                    fg = base16[c - 90 + 8]
                elif 40 <= c <= 47:
                    bg = base16[c - 40]
                i += 1
            continue
        for char in token:
            row.append((char, fg, bg, is_bold))
    cells.append(row)

width = max((len(r) for r in cells), default=1)
img = Image.new("RGB", (width * cw + 16, len(cells) * ch + 16), default_bg)
draw = ImageDraw.Draw(img)
for y, row in enumerate(cells):
    for x, (char, fg, bg, is_bold) in enumerate(row):
        px, py = 8 + x * cw, 8 + y * ch
        if bg:
            draw.rectangle([px, py, px + cw - 1, py + ch - 1], fill=bg)
        if char.strip():
            draw.text((px, py), char, font=bold if is_bold else regular, fill=fg)
img.save(out)
