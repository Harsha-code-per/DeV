// Voice dictation: record the microphone, then turn speech into text, either on this computer
// with sherpa-onnx (free, private, offline) or with a connected provider's speech-to-text.
import fs from "fs/promises"
import path from "path"
import { Global } from "@dev-ai/core/global"

export type Engine = "local" | "cloud"

const ENGINE_VERSION = "2.0.1"
// sherpa-onnx release archives (Apache-2.0, https://github.com/k2-fsa/sherpa-onnx), pinned by checksum.
const ENGINES: Record<string, { asset: string; sha256: string }> = {
  "linux-x64": {
    asset: "linux-x64-shared",
    sha256: "2e823376987c3b6960d50726b6560155e2ad92da0b8b3886325773225ec6bdec",
  },
  "linux-arm64": {
    asset: "linux-aarch64-shared-cpu",
    sha256: "a8fc9fb3940d1aa3f83136767742b05068f00253f560d53c4f5aeb75ab4cb350",
  },
  "darwin-arm64": {
    asset: "osx-arm64-shared",
    sha256: "5e874d3c9b3d6b8c71f7c09e3a9fb9ae846c3009129d302b398d1f7aedb69f84",
  },
  "darwin-x64": {
    asset: "osx-x64-shared",
    sha256: "100315fbb174de2d7fec92b67d28c4128499daf3a6f47b4da6350252680d178f",
  },
  "win32-x64": {
    asset: "win-x64-shared-MT-Release",
    sha256: "dc703575a68594435f53dec93df775ff4913af851a196c0537163f21d8d2364e",
  },
  "win32-arm64": {
    asset: "win-arm64-shared-MT-Release",
    sha256: "d6faf59919314d4728a2701e715ea748a8a5d846fde1f1d58a38ecd91c848011",
  },
}
// NVIDIA Parakeet TDT-CTC 110M, English, int8: accurate, punctuated, about 0.1 s per sentence.
const MODEL = {
  name: "sherpa-onnx-nemo-parakeet_tdt_ctc_110m-en-36000-int8",
  sha256: "17f945007b52ccd8b7200ffc7c5652e9e8e961dfdf479cefcabd06cf5703630b",
}
const RATE = 16000

const root = path.join(Global.Path.cache, "voice")
const engineDir = path.join(root, `sherpa-onnx-${ENGINE_VERSION}`)
const modelDir = path.join(root, MODEL.name)
const exe = path.join(engineDir, "bin", process.platform === "win32" ? "sherpa-onnx-offline.exe" : "sherpa-onnx-offline")

/** The local engine's build for this computer, if sherpa-onnx publishes one. */
export function localSupported() {
  return Boolean(ENGINES[`${process.platform}-${process.arch}`])
}

export async function localInstalled() {
  return (await Bun.file(path.join(engineDir, ".ready")).exists()) && Bun.file(path.join(modelDir, ".ready")).exists()
}

/** Downloads the engine (~25 MB) and the English model (~100 MB) once, checking each archive's SHA-256. */
export async function installLocal(progress: (text: string) => void) {
  const engine = ENGINES[`${process.platform}-${process.arch}`]
  if (!engine) throw new Error("The local voice engine has no build for this computer. Use cloud voice instead.")
  if (!(await Bun.file(path.join(engineDir, ".ready")).exists())) {
    const name = `sherpa-onnx-v${ENGINE_VERSION}-${engine.asset}`
    await installArchive({
      url: `https://github.com/k2-fsa/sherpa-onnx/releases/download/v${ENGINE_VERSION}/${name}.tar.bz2`,
      sha256: engine.sha256,
      label: "voice engine",
      progress,
      // Only the transcriber and the libraries it loads; the archive holds dozens of other tools.
      keep: async (extracted, target) => {
        const bin = path.join(extracted, name, "bin")
        await fs.mkdir(path.join(target, "bin"), { recursive: true })
        const files = await fs.readdir(bin)
        await Promise.all(
          files
            .filter((file) => file === path.basename(exe) || file.endsWith(".dll"))
            .map((file) => fs.copyFile(path.join(bin, file), path.join(target, "bin", file))),
        )
        if (process.platform !== "win32") {
          await fs.cp(path.join(extracted, name, "lib"), path.join(target, "lib"), { recursive: true })
          await fs.chmod(path.join(target, "bin", path.basename(exe)), 0o755)
        }
      },
      target: engineDir,
    })
  }
  if (!(await Bun.file(path.join(modelDir, ".ready")).exists())) {
    await installArchive({
      url: `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${MODEL.name}.tar.bz2`,
      sha256: MODEL.sha256,
      label: "English speech model",
      progress,
      keep: async (extracted, target) => {
        await fs.mkdir(target, { recursive: true })
        await Promise.all(
          ["model.int8.onnx", "tokens.txt"].map((file) =>
            fs.copyFile(path.join(extracted, MODEL.name, file), path.join(target, file)),
          ),
        )
      },
      target: modelDir,
    })
  }
}

async function installArchive(input: {
  url: string
  sha256: string
  label: string
  target: string
  progress: (text: string) => void
  keep: (extracted: string, target: string) => Promise<void>
}) {
  await fs.mkdir(root, { recursive: true })
  const work = await fs.mkdtemp(path.join(root, ".download-"))
  try {
    const response = await fetch(input.url)
    if (!response.ok || !response.body) throw new Error(`Could not download the ${input.label} (${response.status})`)
    const total = Number(response.headers.get("content-length")) || 0
    const archive = path.join(work, "archive.tar.bz2")
    const writer = Bun.file(archive).writer()
    const hasher = new Bun.CryptoHasher("sha256")
    let received = 0
    let shown = -1
    const reader = response.body.getReader()
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      const chunk = next.value
      writer.write(chunk)
      hasher.update(chunk)
      received += chunk.byteLength
      const percent = total ? Math.floor((received / total) * 100) : 0
      if (percent !== shown) {
        shown = percent
        input.progress(`Downloading the ${input.label}… ${total ? `${percent}%` : `${(received / 1e6).toFixed(0)} MB`}`)
      }
    }
    await writer.end()
    if (hasher.digest("hex") !== input.sha256) throw new Error(`The ${input.label} download failed its checksum`)
    input.progress(`Unpacking the ${input.label}…`)
    const extracted = path.join(work, "files")
    await fs.mkdir(extracted)
    const tar = Bun.spawn(["tar", "-xjf", archive, "-C", extracted], { stdout: "ignore", stderr: "pipe" })
    if ((await tar.exited) !== 0) throw new Error(`Could not unpack the ${input.label}: ${await new Response(tar.stderr).text()}`)
    await fs.rm(input.target, { recursive: true, force: true })
    await input.keep(extracted, input.target)
    await Bun.write(path.join(input.target, ".ready"), "")
  } finally {
    await fs.rm(work, { recursive: true, force: true })
  }
}

export type Recording = {
  /** Loudness of the latest audio, 0 to 1, for the level meter. */
  level(): number
  /** Stops and returns 16 kHz mono 16-bit samples. */
  stop(): Promise<Int16Array>
  cancel(): void
}

/** Starts the microphone. Linux and Windows stream raw audio; macOS records to a file. */
export function record(): Recording {
  if (process.platform === "darwin") return recordMac()
  const command = process.platform === "win32" ? windowsRecorder() : linuxRecorder()
  const proc = Bun.spawn(command, { stdout: "pipe", stderr: "pipe", stdin: "ignore" })
  const chunks: Uint8Array[] = []
  let level = 0
  const reading = (async () => {
    const reader = proc.stdout.getReader()
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      chunks.push(next.value)
      level = loudness(next.value)
    }
  })()
  return {
    level: () => level,
    async stop() {
      proc.kill("SIGTERM")
      const code = await proc.exited
      await reading
      const bytes = Buffer.concat(chunks)
      if (bytes.byteLength === 0) {
        const error = (await new Response(proc.stderr).text()).trim()
        throw new Error(microphoneError(error || `the recorder exited with code ${code}`))
      }
      return new Int16Array(bytes.subarray(0, bytes.byteLength & ~1).slice().buffer)
    },
    cancel: () => proc.kill("SIGTERM"),
  }
}

function linuxRecorder() {
  const recorders = [
    ["pw-record", "--raw", "--rate", String(RATE), "--channels", "1", "--format", "s16", "-"],
    ["parecord", "--raw", "--format=s16le", `--rate=${RATE}`, "--channels=1", "--latency-msec=50"],
    ["arecord", "-q", "-f", "S16_LE", "-r", String(RATE), "-c", "1", "-t", "raw"],
  ]
  const found = recorders.find((command) => Bun.which(command[0]))
  if (!found)
    throw new Error(
      "Voice needs a recorder: install PipeWire, PulseAudio or ALSA tools (for example: sudo apt install alsa-utils).",
    )
  return found
}

// Windows has no command-line recorder, so a few lines of C# read the default microphone through
// winmm and write raw audio to stdout. PowerShell compiles it once into the voice folder.
const WINDOWS_MIC = `using System; using System.Runtime.InteropServices; using System.Threading;
public static class DevMic {
  [StructLayout(LayoutKind.Sequential)] public struct Fmt { public ushort tag, channels; public uint rate, bytesPerSec; public ushort align, bits, size; }
  [StructLayout(LayoutKind.Sequential)] public struct Hdr { public IntPtr data; public uint length, recorded; public IntPtr user; public uint flags, loops; public IntPtr next, reserved; }
  [DllImport("winmm.dll")] static extern int waveInOpen(out IntPtr h, int device, ref Fmt fmt, IntPtr cb, IntPtr inst, int flags);
  [DllImport("winmm.dll")] static extern int waveInPrepareHeader(IntPtr h, IntPtr hdr, int size);
  [DllImport("winmm.dll")] static extern int waveInAddBuffer(IntPtr h, IntPtr hdr, int size);
  [DllImport("winmm.dll")] static extern int waveInStart(IntPtr h);
  public static int Run() {
    var fmt = new Fmt { tag = 1, channels = 1, rate = ${RATE}, bytesPerSec = ${RATE * 2}, align = 2, bits = 16, size = 0 };
    IntPtr h;
    int result = waveInOpen(out h, -1, ref fmt, IntPtr.Zero, IntPtr.Zero, 0);
    if (result != 0) { Console.Error.WriteLine("Could not open the microphone (winmm error " + result + ")"); return 1; }
    int size = Marshal.SizeOf(typeof(Hdr));
    var hdrs = new IntPtr[8];
    for (int i = 0; i < hdrs.Length; i++) {
      var hdr = new Hdr { data = Marshal.AllocHGlobal(3200), length = 3200 };
      hdrs[i] = Marshal.AllocHGlobal(size);
      Marshal.StructureToPtr(hdr, hdrs[i], false);
      waveInPrepareHeader(h, hdrs[i], size);
      waveInAddBuffer(h, hdrs[i], size);
    }
    waveInStart(h);
    var output = Console.OpenStandardOutput();
    var buffer = new byte[3200];
    for (int next = 0; ; next = (next + 1) % hdrs.Length) {
      var hdr = (Hdr)Marshal.PtrToStructure(hdrs[next], typeof(Hdr));
      while ((hdr.flags & 1) == 0) { Thread.Sleep(10); hdr = (Hdr)Marshal.PtrToStructure(hdrs[next], typeof(Hdr)); }
      Marshal.Copy(hdr.data, buffer, 0, (int)hdr.recorded);
      output.Write(buffer, 0, (int)hdr.recorded);
      output.Flush();
      waveInAddBuffer(h, hdrs[next], size);
    }
  }
}`

function windowsRecorder() {
  const dll = path.join(root, "devmic-1.dll")
  const script = [
    `$dll = '${dll.replaceAll("'", "''")}'`,
    `if (-not (Test-Path $dll)) { New-Item -ItemType Directory -Force -Path (Split-Path $dll) | Out-Null; Add-Type -TypeDefinition @'\n${WINDOWS_MIC}\n'@ -OutputAssembly $dll }`,
    `Add-Type -Path $dll`,
    `exit [DevMic]::Run()`,
  ].join("\n")
  const shell = Bun.which("powershell.exe") ?? Bun.which("pwsh.exe") ?? "powershell.exe"
  return [shell, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")]
}

// macOS has no command-line recorder either; JavaScript for Automation drives AVAudioRecorder. It
// records to a WAV file and finishes it cleanly when a stop file appears.
const MAC_MIC = `ObjC.import('AVFoundation')
function run(argv) {
  const out = argv[0]
  const settings = $({ AVFormatIDKey: 1819304813, AVSampleRateKey: ${RATE}, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false })
  const recorder = $.AVAudioRecorder.alloc.initWithURLSettingsError($.NSURL.fileURLWithPath(out), settings, null)
  if (!recorder || !recorder.record) throw new Error('Could not start the microphone. Allow your terminal in System Settings, Privacy & Security, Microphone.')
  const files = $.NSFileManager.defaultManager
  while (!files.fileExistsAtPath(out + '.stop')) delay(0.03)
  recorder.stop
}`

function recordMac(): Recording {
  const out = path.join(Global.Path.tmp, `voice-${process.pid}-${Date.now()}.wav`)
  const proc = Bun.spawn(["osascript", "-l", "JavaScript", "-e", MAC_MIC, out], { stdout: "ignore", stderr: "pipe" })
  const started = Date.now()
  return {
    // No live samples here, so the meter breathes while recording instead.
    level: () => 0.3 + 0.2 * Math.sin((Date.now() - started) / 150),
    async stop() {
      await Bun.write(`${out}.stop`, "")
      const code = await proc.exited
      const file = Bun.file(out)
      if (code !== 0 || !(await file.exists())) {
        await fs.rm(`${out}.stop`, { force: true })
        throw new Error(microphoneError((await new Response(proc.stderr).text()).trim()))
      }
      const samples = pcm(new Uint8Array(await file.arrayBuffer()))
      await Promise.all([fs.rm(out, { force: true }), fs.rm(`${out}.stop`, { force: true })])
      return samples
    },
    cancel() {
      proc.kill()
      void fs.rm(out, { force: true })
      void fs.rm(`${out}.stop`, { force: true })
    },
  }
}

function microphoneError(detail: string) {
  if (/denied|permission|not authori[sz]ed/i.test(detail))
    return "Microphone access is denied. Allow your terminal to use the microphone in your system settings."
  return `Could not record from the microphone: ${detail}`
}

/** Speech to text. Local runs sherpa-onnx here; cloud uses a connected provider. */
export async function transcribe(samples: Int16Array, engine: Engine, hints: string[]) {
  if (samples.length < RATE / 4) return ""
  return engine === "cloud" ? transcribeCloud(samples, hints) : transcribeLocal(samples)
}

async function transcribeLocal(samples: Int16Array) {
  const file = path.join(Global.Path.tmp, `voice-${process.pid}-${Date.now()}.wav`)
  await Bun.write(file, wav(samples))
  try {
    const proc = Bun.spawn(
      [
        exe,
        `--nemo-ctc-model=${path.join(modelDir, "model.int8.onnx")}`,
        `--tokens=${path.join(modelDir, "tokens.txt")}`,
        "--num-threads=2",
        file,
      ],
      { stdout: "pipe", stderr: "pipe" },
    )
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    // The result is a JSON line, written to stdout or stderr depending on the build.
    const line = (stdout + "\n" + stderr).split("\n").findLast((item) => item.startsWith("{") && item.includes('"text"'))
    if (code !== 0 || !line) throw new Error(`The voice engine failed: ${stderr.trim().split("\n").at(-1) ?? code}`)
    return String(JSON.parse(line).text ?? "").trim()
  } finally {
    await fs.rm(file, { force: true })
  }
}

// Providers whose free or paid plans include speech-to-text, in order of preference.
const CLOUD = [
  { id: "groq", name: "Groq", url: "https://api.groq.com/openai/v1/audio/transcriptions", model: "whisper-large-v3-turbo" },
  { id: "openai", name: "OpenAI", url: "https://api.openai.com/v1/audio/transcriptions", model: "gpt-4o-mini-transcribe" },
]

/** The connected provider cloud voice would use, if any. */
export async function cloudProvider() {
  const auth: Record<string, { type?: string; key?: string }> = await Bun.file(path.join(Global.Path.data, "auth.json"))
    .json()
    .catch(() => ({}))
  const found = CLOUD.find((item) => auth[item.id]?.type === "api" && auth[item.id]?.key)
  return found ? { ...found, key: auth[found.id].key! } : undefined
}

async function transcribeCloud(samples: Int16Array, hints: string[]) {
  const provider = await cloudProvider()
  if (!provider) throw new Error("Cloud voice needs Groq or OpenAI connected. Run /connect, or switch to local voice.")
  const form = new FormData()
  form.append("file", new Blob([wav(samples)], { type: "audio/wav" }), "speech.wav")
  form.append("model", provider.model)
  // Whisper takes a short prompt as spelling hints, which keeps coding words and names right.
  form.append("prompt", ["OAuth, JSON, regex, localhost, TypeScript, API", ...hints].join(", "))
  const response = await fetch(provider.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.key}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`${provider.name} speech-to-text failed (${response.status}): ${(await response.text()).slice(0, 200)}`)
  const body = (await response.json()) as { text?: string }
  return (body.text ?? "").trim()
}

/** 16-bit mono samples as a WAV file. */
export function wav(samples: Int16Array) {
  const out = new DataView(new ArrayBuffer(44 + samples.byteLength))
  const text = (offset: number, value: string) => [...value].forEach((char, i) => out.setUint8(offset + i, char.charCodeAt(0)))
  text(0, "RIFF")
  out.setUint32(4, 36 + samples.byteLength, true)
  text(8, "WAVE")
  text(12, "fmt ")
  out.setUint32(16, 16, true)
  out.setUint16(20, 1, true)
  out.setUint16(22, 1, true)
  out.setUint32(24, RATE, true)
  out.setUint32(28, RATE * 2, true)
  out.setUint16(32, 2, true)
  out.setUint16(34, 16, true)
  text(36, "data")
  out.setUint32(40, samples.byteLength, true)
  new Int16Array(out.buffer, 44).set(samples)
  return new Uint8Array(out.buffer)
}

/** The samples in a 16-bit WAV file, skipping any chunks before "data". */
export function pcm(file: Uint8Array) {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  let offset = 12
  while (offset + 8 <= file.byteLength) {
    const id = String.fromCharCode(...file.subarray(offset, offset + 4))
    const size = view.getUint32(offset + 4, true)
    if (id === "data") {
      // A recording stopped early can leave the size unset; read to the end then.
      const end = size && offset + 8 + size <= file.byteLength ? offset + 8 + size : file.byteLength
      const bytes = file.slice(offset + 8, end - ((end - offset - 8) % 2))
      return new Int16Array(bytes.buffer)
    }
    offset += 8 + size + (size % 2)
  }
  return new Int16Array()
}

function loudness(chunk: Uint8Array) {
  const samples = new Int16Array(chunk.slice(0, chunk.byteLength & ~1).buffer)
  if (samples.length === 0) return 0
  const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length) / 32768
  return Math.min(1, rms * 8)
}
export * as Voice from "./voice"
