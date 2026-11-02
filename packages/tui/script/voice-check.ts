// Checks voice on this machine: the local engine installs and transcribes, and the recorder starts.
// CI machines have no microphone, so there the recorder must fail with DeV's own message, which
// still proves the platform recorder (C# on Windows, JavaScript for Automation on macOS) runs.
//   bun script/voice-check.ts
import { Voice } from "../src/voice"

const roundtrip = Voice.pcm(Voice.wav(Int16Array.from([0, 1000, -1000, 32767])))
if (roundtrip.join() !== "0,1000,-1000,32767") throw new Error(`WAV round trip failed: ${roundtrip.join()}`)

await Voice.installLocal((text) => console.log(text.replace(/… \d+%$/, "…")))
if (!(await Voice.localInstalled())) throw new Error("The local engine did not install")
// A second of a quiet tone: the engine must run and answer, even if it hears no words.
const tone = Int16Array.from({ length: 16000 }, (_, i) => Math.round(Math.sin(i / 8) * 3000))
console.log("engine ran, heard:", JSON.stringify(await Voice.transcribe(tone, "local", [])))

const result = await (async () => {
  const recording = Voice.record()
  await Bun.sleep(1500)
  return `recorded ${(await recording.stop()).length} samples`
})().catch((error: Error) => error.message)
console.log("recorder:", result)
const expected = /^recorded \d+|winmm error|Could not start the microphone|Microphone access is denied|Voice needs a recorder|Could not record from the microphone: (arecord|pw-record|parecord|.*(device|connection|no such|Connection))/i
if (!expected.test(result) || /error CS\d|SyntaxError|-2700/.test(result)) throw new Error(`Unexpected recorder result: ${result}`)
console.log("voice check passed")
