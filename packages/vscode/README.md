# DeV Code for VS Code

Run [DeV Code](https://trydev.work), the open-source coding agent, beside your code. You bring the model: a free tier, a model on your own machine, or your own key.

- **Open DeV Code** (`Ctrl+Esc`, `Cmd+Esc` on macOS, or the DeV button above the editor) opens DeV in a terminal next to your file.
- Your selection goes to DeV as you move, so you can ask about "this function" without copying it.
- **Mention the selection** (`Ctrl+Alt+K`, `Cmd+Alt+K` on macOS) adds the selected lines to what you're writing to DeV.

The extension needs DeV Code installed: `curl -fsSL https://trydev.work/install | sh`, or see [all install options](https://trydev.work/docs.html#install). Set `devcode.command` if `devcode` isn't on your PATH. Everything stays on your machine: the extension talks to DeV over a local connection that only the terminal it opened can use.

MIT licensed.
