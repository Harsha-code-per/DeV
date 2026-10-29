# DeV desktop

The DeV desktop app for Windows, macOS and Linux, built with Electron.

## Development

```bash
bun install
bun dev
```

## Build

Run `build` to build the app's JS assets, then `package` to bundle them as an application in `dist/`.
`DEV_CHANNEL` picks the channel (`dev` by default, `beta` or `prod`).

```bash
bun run build && bun run package
```

Only prod builds check for updates, from this repository's GitHub Releases.

## Unsigned builds

DeV's builds are not code signed yet, so the OS warns on first launch.

- **macOS**: right-click DeV in Applications and choose **Open**, then **Open** again. Or clear the
  quarantine flag: `xattr -dr com.apple.quarantine /Applications/DeV.app`
- **Windows**: when SmartScreen says "Windows protected your PC", choose **More info**, then **Run anyway**.
- **Linux**: no extra step; for the AppImage, `chmod +x` it first.
