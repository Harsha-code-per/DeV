// DeV Code for VS Code: runs DeV in a terminal beside your code and tells it what you're looking at.
// Your selection goes to DeV as you move (shown above its prompt), and "Mention the selection" adds the
// selected lines to what you're writing. Everything stays on this machine.
const vscode = require("vscode")
const crypto = require("node:crypto")
const { start } = require("./server")

async function activate(context) {
  const token = crypto.randomUUID()
  const server = await start({ token, name: "DeV Code for VS Code", version: context.extension.packageJSON.version })
  context.subscriptions.push({ dispose: () => server.close() })
  const state = { terminal: undefined, timer: undefined }

  const share = (editor) => {
    clearTimeout(state.timer)
    state.timer = setTimeout(() => {
      if (!editor || editor.document.uri.scheme !== "file") return
      const { start, end } = editor.selection
      // DeV counts lines and columns from 1.
      server.notify("selection_changed", {
        text: editor.document.getText(editor.selection),
        filePath: editor.document.uri.fsPath,
        selection: {
          start: { line: start.line + 1, character: start.character + 1 },
          end: { line: end.line + 1, character: end.character + 1 },
        },
      })
    }, 120)
  }

  const open = () => {
    if (!state.terminal) {
      const command = vscode.workspace.getConfiguration("devcode").get("command") || "devcode"
      state.terminal = vscode.window.createTerminal({
        name: "DeV",
        iconPath: vscode.Uri.joinPath(context.extensionUri, "mark.svg"),
        location: { viewColumn: vscode.ViewColumn.Beside },
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri,
        env: { DEV_EDITOR_SSE_PORT: String(server.port), DEV_EDITOR_AUTH: token },
      })
      state.terminal.sendText(command)
    }
    state.terminal.show()
  }

  const mention = () => {
    const editor = vscode.window.activeTextEditor
    if (!editor || editor.document.uri.scheme !== "file") return
    const { start, end } = editor.selection
    // A selection that ends at the start of a line doesn't include that line.
    const last = end.line > start.line && end.character === 0 ? end.line - 1 : end.line
    server.notify("at_mentioned", { filePath: editor.document.uri.fsPath, lineStart: start.line + 1, lineEnd: last + 1 })
    open()
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("devcode.open", open),
    vscode.commands.registerCommand("devcode.mention", mention),
    vscode.window.onDidChangeTextEditorSelection((event) => share(event.textEditor)),
    vscode.window.onDidChangeActiveTextEditor(share),
    vscode.window.onDidCloseTerminal((terminal) => {
      if (terminal === state.terminal) state.terminal = undefined
    }),
  )
  share(vscode.window.activeTextEditor)
}

function deactivate() {}

module.exports = { activate, deactivate }
