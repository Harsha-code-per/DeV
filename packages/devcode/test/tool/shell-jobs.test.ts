import { expect, test } from "bun:test"
import { ShellJobs } from "../../src/tool/shell/jobs"

const shell = process.platform === "win32" ? "cmd" : "/bin/sh"

test.skipIf(process.platform === "win32")("background jobs report new output, then stop with everything they started", async () => {
  const marker = `devcode-job-test-${process.pid}`
  const job = ShellJobs.start({
    shell,
    command: `echo first; sh -c 'sleep 300; echo ${marker}' & echo second; sleep 300`,
    label: "test job",
    cwd: process.cwd(),
    env: process.env,
  })
  await Bun.sleep(500)
  const first = ShellJobs.output(job.id)!
  expect(first.running).toBe(true)
  expect(first.text).toContain("first")
  expect(first.text).toContain("second")
  // Only what is new since the last read.
  expect(ShellJobs.output(job.id)!.text).toBe("")

  const stopped = await ShellJobs.stop(job.id)
  expect(stopped?.running).toBe(false)
  // The grandchild in the same process group is gone too.
  await Bun.sleep(200)
  const left = Bun.spawnSync(["pgrep", "-f", `sleep 300; echo ${marker}`]).stdout.toString().trim()
  expect(left).toBe("")
  expect(ShellJobs.output("nope")).toBeUndefined()
})
