#!/bin/sh
# Renders DeV's mark (packages/identity/mark.svg) to every desktop icon, for all channels.
# Needs rsvg-convert, magick (ImageMagick 7) and bun.
set -e
cd "$(dirname "$0")/.."
mark=../identity/mark.svg
out=icons/prod
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

png() { rsvg-convert -w "$1" -h "$1" "$mark" -o "$2"; }

for size in 32 64 128; do png $size $out/${size}x${size}.png; done
png 256 $out/128x128@2x.png
png 512 $out/icon.png
png 50 $out/StoreLogo.png
for size in 30 44 71 89 107 142 150 284 310; do png $size $out/Square${size}x${size}Logo.png; done

for size in 16 24 32 48 64 256; do png $size "$tmp/ico-$size.png"; done
magick "$tmp/ico-16.png" "$tmp/ico-24.png" "$tmp/ico-32.png" "$tmp/ico-48.png" "$tmp/ico-64.png" "$tmp/ico-256.png" $out/icon.ico

# macOS draws app icons inside a margin (the Big Sur grid: 824 of 1024), so the .icns and the
# dev Dock icon use the mark inset on a transparent canvas instead of edge to edge.
for size in 32 64 128 256 512 1024; do
  inner=$((size * 824 / 1024))
  rsvg-convert -w $inner -h $inner "$mark" -o "$tmp/inner.png"
  magick "$tmp/inner.png" -background none -gravity center -extent ${size}x${size} "$tmp/mac-$size.png"
done
cp "$tmp/mac-256.png" $out/dock.png

# ImageMagick cannot write .icns and iconutil is macOS-only, so write the container directly:
# "icns" + total length, then one PNG entry per OSType (all big-endian).
bun -e '
const [dir, out] = process.argv.slice(1)
const types = { ic11: 32, ic12: 64, ic07: 128, ic13: 256, ic08: 256, ic14: 512, ic09: 512, ic10: 1024 }
const entries = await Promise.all(Object.entries(types).map(async ([type, size]) => {
  const data = Buffer.from(await Bun.file(`${dir}/mac-${size}.png`).arrayBuffer())
  const head = Buffer.alloc(8)
  head.write(type, 0, "ascii")
  head.writeUInt32BE(data.length + 8, 4)
  return Buffer.concat([head, data])
}))
const head = Buffer.alloc(8)
head.write("icns", 0, "ascii")
head.writeUInt32BE(8 + entries.reduce((sum, entry) => sum + entry.length, 0), 4)
await Bun.write(out, Buffer.concat([head, ...entries]))
' "$tmp" $out/icon.icns

# Beta and dev builds use the same mark.
for channel in beta dev; do cp $out/*.png $out/icon.ico $out/icon.icns icons/$channel/; done
