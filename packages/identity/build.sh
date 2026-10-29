#!/bin/sh
# Renders DeV's mark (mark.svg) to every PNG and ICO the identity and web app use.
set -e
cd "$(dirname "$0")"
for size in 96 192 512; do rsvg-convert -w $size -h $size mark.svg -o mark-${size}x${size}.png; done
cp mark-512x512.png mark-512x512-light.png
app=../ui/src/assets/favicon  # packages/app/public links here
rsvg-convert -w 96 -h 96 mark.svg -o $app/favicon-96x96.png
rsvg-convert -w 180 -h 180 mark.svg -o $app/apple-touch-icon.png
cp mark.svg $app/favicon.svg
for size in 16 32 48; do rsvg-convert -w $size -h $size mark.svg -o /tmp/dev-mark-$size.png; done
magick /tmp/dev-mark-16.png /tmp/dev-mark-32.png /tmp/dev-mark-48.png $app/favicon.ico
rm -f /tmp/dev-mark-16.png /tmp/dev-mark-32.png /tmp/dev-mark-48.png
# The -v3 copies are cache-busting names the app references.
cp $app/favicon.svg $app/favicon-v3.svg
cp $app/favicon.ico $app/favicon-v3.ico
cp $app/favicon-96x96.png $app/favicon-96x96-v3.png
cp $app/apple-touch-icon.png $app/apple-touch-icon-v3.png
