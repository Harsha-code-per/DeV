import { afterAll, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const dirs: string[] = []
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

function fixture(files: Record<string, string | Uint8Array>) {
  const dir = mkdtempSync(path.join(tmpdir(), "bench-5xx-"))
  dirs.push(dir)
  Object.entries(files).forEach(([name, data]) => {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    writeFileSync(path.join(dir, name), data)
  })
  return dir
}

const line = (ip: string, status: number, request = "GET / HTTP/1.1", agent = "curl/8.0") =>
  `${ip} - - [29/Oct/2026:10:00:00 +0000] "${request}" ${status} 10 "-" "${agent}"\n`
const lines = (ip: string, status: number, n: number) => line(ip, status).repeat(n)

function run(...args: string[]) {
  const proc = Bun.spawnSync(["bash", "top5xx.sh", ...args])
  return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() }
}

test("sample logs", () => {
  expect(run("logs")).toEqual({ code: 0, out: "2 203.0.113.5\n1 198.51.100.7\n", err: "" })
})

test("plain, rotated and gzipped files; other files ignored", () => {
  const dir = fixture({
    "access.log": lines("10.0.0.1", 500, 2) + lines("10.0.0.2", 200, 9),
    "access.log.1": lines("10.0.0.2", 599, 1),
    "access.log.2.gz": Bun.gzipSync(Buffer.from(lines("10.0.0.2", 503, 3) + lines("10.0.0.3", 499, 5))),
    "access.log.3.gz": Bun.gzipSync(Buffer.from(lines("10.0.0.1", 504, 1))),
    "error.log": lines("10.0.0.9", 500, 50),
    "old-access.log": lines("10.0.0.9", 500, 50),
    "nested/access.log": lines("10.0.0.9", 500, 50),
  })
  expect(run(dir)).toEqual({ code: 0, out: "4 10.0.0.2\n3 10.0.0.1\n", err: "" })
})

test("status is the field after the quoted request", () => {
  const dir = fixture({
    "access.log":
      line("1.1.1.1", 200, "GET /a 500 b HTTP/1.1", "agent 503 x") +
      line("2.2.2.2", 501, "GET /x?y=1 2 HTTP/1.1", "Mozilla/5.0 (X11) 200") +
      line("3.3.3.3", 600) +
      line("4.4.4.4", 5000),
  })
  expect(run(dir)).toEqual({ code: 0, out: "1 2.2.2.2\n", err: "" })
})

test("-n limits output and ties sort by IP bytes", () => {
  const dir = fixture({
    "access.log": lines("10.0.0.10", 500, 2) + lines("10.0.0.9", 500, 2) + lines("9.0.0.1", 500, 2) + lines("8.8.8.8", 500, 3),
  })
  expect(run(dir).out).toBe("3 8.8.8.8\n2 10.0.0.10\n2 10.0.0.9\n2 9.0.0.1\n")
  expect(run("-n", "2", dir).out).toBe("3 8.8.8.8\n2 10.0.0.10\n")
})

test("default top 10", () => {
  const files = { "access.log": Array.from({ length: 12 }, (_, i) => lines(`10.1.0.${i}`, 500, i + 1)).join("") }
  const out = run(fixture(files)).out.trim().split("\n")
  expect(out).toHaveLength(10)
  expect(out[0]).toBe("12 10.1.0.11")
})

test("no errors prints nothing", () => {
  expect(run(fixture({ "access.log": lines("1.2.3.4", 200, 3) }))).toEqual({ code: 0, out: "", err: "" })
})

test("bad arguments exit 2", () => {
  for (const args of [[], ["/definitely/not/here"], ["-n", "0", "logs"], ["-n", "abc", "logs"], ["-n", "-3", "logs"]]) {
    const r = run(...args)
    expect({ args, code: r.code, out: r.out }).toEqual({ args, code: 2, out: "" })
    expect(r.err).not.toBe("")
  }
})
