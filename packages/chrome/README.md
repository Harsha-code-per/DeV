# DeV for Chrome

A side-panel chat with DeV for Chrome, Chromium, Edge and Brave. Tick **Use this page** to send the
current tab's title, URL and text along with your message.

The extension talks to DeV through native messaging only: Chrome starts `devcode native-host`, which
answers in-process from DeV's server. No network port is opened.

## Install

1. Install DeV Code and set up a model (`devcode providers login`). Chrome starts the host without
   your shell profile, so API keys exported in `~/.bashrc` and the like are not visible to it; log in
   through `devcode providers login` instead.
2. Build the extension (from this directory): `bun run build`. The unpacked extension is in `dist/`.
3. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick `dist/`.
4. Copy the extension's ID from its card (32 letters, `a` to `p`).
5. Register the host: `devcode native-host --install --extension-id <ID>`
   - Linux and macOS: writes `dev.devcode.json` into `NativeMessagingHosts/` for each of Chrome,
     Chromium, Edge and Brave that has a profile, pointing at a launcher in DeV's data directory.
   - Windows: writes the manifest and prints the `reg add` command for each browser; run the one for
     yours.
6. Click the DeV icon in the toolbar to open the side panel.

An unpacked extension's ID comes from the folder path, so loading `dist/` from somewhere else gives a
new ID: run step 5 again with it. Rerun step 5 after moving or reinstalling DeV Code, since the
launcher points at the current `devcode` binary.

## Security

- The host forwards only these calls, rebuilt from validated fields, and refuses everything else:
  create a session, send a text prompt, read the last 20 messages, abort. Reads, prompts and aborts
  are allowed only for sessions this host process created, so a compromised extension can't reach
  your other sessions, config, files or shell.
- Every session it creates has all tools denied: the extension is a chat, page text is untrusted,
  and nobody is at a terminal to answer permission prompts. Prompts can't override this (`tools`,
  `agent` and `system` fields are dropped).
- Page text is wrapped in `<untrusted_content source="URL">` blocks, which DeV's system prompt tells
  the model to treat as data; closing tags inside the page are neutralised.
- Reading a page needs that site's permission; Chrome asks the first time per site.
- Sessions run in an empty directory, `<DeV data>/chrome/workspace`.

## Development

From this directory: `bun run build`, `bun typecheck`, `bun test`. The host lives in
`packages/devcode/src/cli/cmd/native-host.ts`.
