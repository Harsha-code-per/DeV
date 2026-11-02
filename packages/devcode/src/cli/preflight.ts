// Imported first: libraries read the working directory while they load, and without one they crash
// with pages of minified code.
try {
  process.cwd()
} catch {
  console.error("error: this folder no longer exists. Move to another folder and run DeV Code again.")
  process.exit(1)
}

// Deprecation notices from bundled libraries (such as url.parse while installing a plugin from git)
// are for their developers, not for people using DeV Code.
process.noDeprecation = true
