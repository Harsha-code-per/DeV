// Imported first: libraries read the working directory while they load, and without one they crash
// with pages of minified code.
try {
  process.cwd()
} catch {
  console.error("error: this folder no longer exists. Move to another folder and run DeV Code again.")
  process.exit(1)
}
