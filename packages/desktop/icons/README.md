# Desktop icons

Every file here is rendered from DeV's mark (`packages/identity/mark.svg`) by `scripts/icons.sh`
(needs `rsvg-convert`, ImageMagick 7's `magick`, and `bun`). Edit the mark, then run:

```bash
./scripts/icons.sh
```

`prod/` is the source set; `beta/` and `dev/` are copies. `icon.icns` and `dock.png` place the mark on
macOS's icon grid (824 of 1024 px with a transparent margin) so the Dock icon is not oversized.
