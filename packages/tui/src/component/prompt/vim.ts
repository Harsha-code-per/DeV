export * as Vim from "./vim"

// Vim keys for the prompt. A pure engine: it takes the prompt as an array of
// graphemes plus a cursor index, one key, and returns the new text, cursor and
// state. The prompt applies the difference to the textarea, so prompt parts
// (pasted text, @files) outside the edited range survive.

export type Mode = "insert" | "normal" | "visual" | "visual-line"

export type State = {
  mode: Mode
  pending: string
  anchor: number
  register: { text: string; linewise: boolean }
  find?: { key: string; char: string }
  last?: { keys: string; insert: string }
  recording?: { keys: string; start: number; length: number }
}

export type Result = {
  chars: string[]
  cursor: number
  state: State
  undo?: boolean
  redo?: boolean
}

export function initial(): State {
  return { mode: "insert", pending: "", anchor: 0, register: { text: "", linewise: false } }
}

const MAX_COUNT = 10_000

export function key(chars: string[], cursor: number, state: State, k: string): Result {
  if (k === "escape") return escape(chars, cursor, state)
  if (state.mode === "insert") return { chars, cursor, state }
  const keys = state.pending + k
  if (state.mode === "visual" || state.mode === "visual-line") return visual(chars, cursor, state, keys)
  if (keys === ".") return repeat(chars, cursor, state)
  const result = normal(chars, cursor, { ...state, pending: "" }, keys)
  if (result === "pending") return { chars, cursor, state: { ...state, pending: keys } }
  if (!result) return { chars, cursor, state: { ...state, pending: "" } }
  return remember(result, keys, chars)
}

function escape(chars: string[], cursor: number, state: State): Result {
  if (state.mode === "insert") {
    const recording = state.recording
    const inserted =
      recording && chars.length - recording.length === cursor - recording.start && cursor >= recording.start
        ? chars.slice(recording.start, cursor).join("")
        : ""
    return {
      chars,
      cursor: Math.max(lineStart(chars, cursor), cursor - 1),
      state: {
        ...state,
        mode: "normal",
        pending: "",
        recording: undefined,
        last: recording ? { keys: recording.keys, insert: inserted } : state.last,
      },
    }
  }
  return { chars, cursor: clamp(chars, cursor), state: { ...state, mode: "normal", pending: "" } }
}

// Record what a change did, so `.` can do it again.
function remember(result: Result, keys: string, before: string[]): Result {
  const changed = result.chars !== before
  if (result.state.mode === "insert")
    return {
      ...result,
      state: { ...result.state, recording: { keys, start: result.cursor, length: result.chars.length } },
    }
  if (!changed) return result
  return { ...result, state: { ...result.state, last: { keys, insert: "" } } }
}

function repeat(chars: string[], cursor: number, state: State): Result {
  const last = state.last
  if (!last) return { chars, cursor, state: { ...state, pending: "" } }
  const done = normal(chars, cursor, { ...state, pending: "" }, last.keys)
  if (!done || done === "pending") return { chars, cursor, state: { ...state, pending: "" } }
  if (done.state.mode !== "insert") return done
  const typed = [...segment(last.insert)]
  const next = [...done.chars.slice(0, done.cursor), ...typed, ...done.chars.slice(done.cursor)]
  const end = done.cursor + typed.length
  return {
    chars: next,
    cursor: Math.max(lineStart(next, end), end - 1),
    state: { ...done.state, mode: "normal", recording: undefined, last },
  }
}

function normal(chars: string[], cursor: number, state: State, keys: string): Result | "pending" | undefined {
  const parsed = /^([1-9]\d*)?(.*)$/s.exec(keys)!
  const count = Math.min(MAX_COUNT, Number(parsed[1] ?? 1))
  const rest = parsed[2]
  if (!rest) return "pending"
  const done = (next: string[], at: number, extra?: Partial<State>): Result => ({
    chars: next,
    cursor: at,
    state: { ...state, ...extra },
  })
  const insert = (next: string[], at: number) => done(next, at, { mode: "insert" })
  const line = lineStart(chars, cursor)
  const end = lineEnd(chars, cursor)

  switch (rest) {
    case "i":
      return insert(chars, cursor)
    case "a":
      return insert(chars, Math.min(end, cursor + 1))
    case "I":
      return insert(chars, firstNonBlank(chars, line))
    case "A":
      return insert(chars, end)
    case "o":
      return insert([...chars.slice(0, end), "\n", ...chars.slice(end)], end + 1)
    case "O":
      return insert([...chars.slice(0, line), "\n", ...chars.slice(line)], line)
    case "v":
      return done(chars, cursor, { mode: "visual", anchor: cursor })
    case "V":
      return done(chars, cursor, { mode: "visual-line", anchor: cursor })
    case "u":
      return { ...done(chars, cursor), undo: true }
    case "ctrl+r":
      return { ...done(chars, cursor), redo: true }
    case "x":
      return operate(chars, cursor, state, "d", cursor, Math.min(end, cursor + count), false)
    case "X":
      return operate(chars, cursor, state, "d", Math.max(line, cursor - count), cursor, false)
    case "s":
      return operate(chars, cursor, state, "c", cursor, Math.min(end, cursor + count), false)
    case "S":
      return normal(chars, cursor, state, `${count}cc`)
    case "C":
      return normal(chars, cursor, state, `${count}c$`)
    case "D":
      return normal(chars, cursor, state, `${count}d$`)
    case "Y":
      return normal(chars, cursor, state, `${count}yy`)
    case "p":
    case "P":
      return paste(chars, cursor, state, rest === "P", count)
    case "J":
      return join(chars, cursor, state, Math.max(1, count - 1))
    case "~": {
      const stop = Math.min(end, cursor + count)
      const next = [...chars.slice(0, cursor), ...chars.slice(cursor, stop).map(toggleCase), ...chars.slice(stop)]
      return done(next, clamp(next, stop))
    }
  }
  if (rest === "r") return "pending"
  if (rest.startsWith("r")) {
    if (cursor + count > end) return
    const next = [...chars.slice(0, cursor), ...Array(count).fill(rest.slice(1)), ...chars.slice(cursor + count)]
    return done(next, cursor + count - 1)
  }

  const op = /^[dcy]/.exec(rest)?.[0]
  if (!op) {
    const target = motion(chars, cursor, state, rest, count, parsed[1] !== undefined, false)
    if (target === "pending") return "pending"
    if (!target) return
    return done(chars, target.linewise ? firstNonBlank(chars, target.to) : clamp(chars, target.to), target.find)
  }

  const inner = /^([1-9]\d*)?(.*)$/s.exec(rest.slice(1))!
  const total = Math.min(MAX_COUNT, count * Number(inner[1] ?? 1))
  const what = inner[2]
  if (!what) return "pending"
  if (what === op) {
    const last = lineNumberAt(chars, cursor) + total - 1
    return operateLines(chars, cursor, state, op, line, lineEnd(chars, lineOffset(chars, last)))
  }
  if (/^[ia]/.test(what)) {
    if (what.length < 2) return "pending"
    const range = textObject(chars, cursor, what)
    if (!range) return
    return operate(chars, cursor, state, op, range[0], range[1], false)
  }
  const explicit = parsed[1] !== undefined || inner[1] !== undefined
  // `cw` changes to the end of the word, like `ce`.
  const moved = op === "c" ? ({ w: "e", W: "E" } as Record<string, string>)[what] ?? what : what
  const target = motion(chars, cursor, state, moved, total, explicit, true)
  if (target === "pending") return "pending"
  if (!target) return
  const withFind = { ...state, ...target.find }
  if (target.linewise) {
    const [from, to] = target.to < cursor ? [target.to, cursor] : [cursor, target.to]
    return operateLines(chars, cursor, withFind, op, lineStart(chars, from), lineEnd(chars, to))
  }
  const stop = /^[wW]$/.test(what) && op !== "c" ? trimWordEnd(chars, cursor, target.to) : target.to
  const [from, to] = stop < cursor ? [stop, cursor] : [cursor, stop + (target.inclusive ? 1 : 0)]
  return operate(chars, cursor, withFind, op, from, Math.min(chars.length, to), false)
}

// The range a visual mode selection covers, end exclusive.
export function selection(chars: string[], cursor: number, state: State) {
  const [low, high] = state.anchor <= cursor ? [state.anchor, cursor] : [cursor, state.anchor]
  if (state.mode === "visual-line") return [lineStart(chars, low), lineEnd(chars, high)] as const
  return [low, Math.min(chars.length, high + 1)] as const
}

function visual(chars: string[], cursor: number, state: State, keys: string): Result {
  const linewise = state.mode === "visual-line"
  const low = Math.min(state.anchor, cursor)
  const [from, to] = selection(chars, cursor, state)
  const leave = { ...state, mode: "normal" as const, pending: "" }
  const stay = (at: number, extra?: Partial<State>): Result => ({
    chars,
    cursor: at,
    state: { ...state, pending: "", ...extra },
  })
  switch (keys) {
    case "v":
    case "V": {
      const mode = keys === "v" ? "visual" : "visual-line"
      if (state.mode === mode) return { chars, cursor, state: leave }
      return stay(cursor, { mode })
    }
    case "o":
      return stay(state.anchor, { anchor: cursor })
    case "d":
    case "x":
    case "c":
    case "s":
    case "y": {
      const op = keys === "x" ? "d" : keys === "s" ? "c" : keys
      if (linewise) return operateLines(chars, low, leave, op, from, to)
      return operate(chars, low, leave, op, from, to, false)
    }
    case "~": {
      const next = [...chars.slice(0, from), ...chars.slice(from, to).map(toggleCase), ...chars.slice(to)]
      return { chars: next, cursor: from, state: leave }
    }
    case "p":
    case "P": {
      const text = [...segment(state.register.text)]
      const next = [...chars.slice(0, from), ...text, ...chars.slice(to)]
      return {
        chars: next,
        cursor: clamp(next, from + text.length - 1),
        state: { ...leave, register: { text: chars.slice(from, to).join(""), linewise } },
      }
    }
  }
  const parsed = /^([1-9]\d*)?(.*)$/s.exec(keys)!
  const rest = parsed[2]
  if (!rest) return stay(cursor, { pending: keys })
  if (/^[ia]/.test(rest)) {
    if (rest.length < 2) return stay(cursor, { pending: keys })
    const range = textObject(chars, cursor, rest)
    if (!range || range[1] <= range[0]) return stay(cursor)
    return stay(range[1] - 1, { anchor: range[0] })
  }
  const target = motion(chars, cursor, state, rest, Math.min(MAX_COUNT, Number(parsed[1] ?? 1)), parsed[1] !== undefined, false)
  if (target === "pending") return stay(cursor, { pending: keys })
  if (!target) return stay(cursor)
  return stay(Math.min(target.to, Math.max(0, chars.length - 1)), target.find)
}

function operate(
  chars: string[],
  cursor: number,
  state: State,
  op: string,
  from: number,
  to: number,
  linewise: boolean,
): Result {
  if (from === to && op !== "c") return { chars, cursor, state }
  const register = { text: chars.slice(from, to).join(""), linewise }
  if (op === "y") return { chars, cursor: Math.min(cursor, from), state: { ...state, register } }
  const next = [...chars.slice(0, from), ...chars.slice(to)]
  if (op === "c") return { chars: next, cursor: from, state: { ...state, register, mode: "insert" } }
  return { chars: next, cursor: clamp(next, from), state: { ...state, register } }
}

function operateLines(chars: string[], cursor: number, state: State, op: string, from: number, to: number): Result {
  const register = { text: chars.slice(from, to).join(""), linewise: true }
  if (op === "y") return { chars, cursor: Math.min(cursor, from), state: { ...state, register } }
  if (op === "c") {
    const indent = firstNonBlank(chars, from)
    const next = [...chars.slice(0, indent), ...chars.slice(to)]
    return { chars: next, cursor: indent, state: { ...state, register, mode: "insert" } }
  }
  // Take one newline with the lines: the one after them, or before them on the last line.
  const [start, stop] = to < chars.length ? [from, to + 1] : [Math.max(0, from - 1), to]
  const next = [...chars.slice(0, start), ...chars.slice(stop)]
  const at = Math.min(start === from ? from : lineStart(next, start), next.length)
  return { chars: next, cursor: firstNonBlank(next, lineStart(next, at)), state: { ...state, register } }
}

function paste(chars: string[], cursor: number, state: State, before: boolean, count: number): Result {
  const register = state.register
  if (!register.text) return { chars, cursor, state }
  const text = [...segment(register.text.repeat(count))]
  if (register.linewise) {
    const lines = before ? [...text, "\n"] : ["\n", ...text]
    const at = before ? lineStart(chars, cursor) : lineEnd(chars, cursor)
    const next = [...chars.slice(0, at), ...lines, ...chars.slice(at)]
    return { chars: next, cursor: firstNonBlank(next, before ? at : at + 1), state }
  }
  const at = before || chars.length === 0 || chars[cursor] === "\n" ? cursor : Math.min(chars.length, cursor + 1)
  const next = [...chars.slice(0, at), ...text, ...chars.slice(at)]
  return { chars: next, cursor: at + text.length - 1, state }
}

function join(chars: string[], cursor: number, state: State, times: number): Result {
  const next = Array.from({ length: times }).reduce<{ chars: string[]; at: number }>(
    (acc) => {
      const end = lineEnd(acc.chars, acc.at)
      if (end >= acc.chars.length) return acc
      const start = firstNonBlank(acc.chars, end + 1)
      const glue = end === lineStart(acc.chars, end) || acc.chars[start] === ")" || acc.chars[start] === "\n" ? [] : [" "]
      const trimmed = acc.chars.slice(0, end)
      while (trimmed.length > lineStart(acc.chars, end) && isSpace(trimmed[trimmed.length - 1])) trimmed.pop()
      return { chars: [...trimmed, ...glue, ...acc.chars.slice(start)], at: trimmed.length }
    },
    { chars, at: cursor },
  )
  return { chars: next.chars, cursor: next.at, state }
}

type Target = { to: number; linewise?: boolean; inclusive?: boolean; find?: Partial<State> }

function motion(
  chars: string[],
  cursor: number,
  state: State,
  keys: string,
  count: number,
  explicit: boolean,
  operator: boolean,
): Target | "pending" | undefined {
  const line = lineStart(chars, cursor)
  const end = lineEnd(chars, cursor)
  const times = (step: (at: number) => number) =>
    Array.from({ length: count }).reduce<number>((at) => step(at), cursor)
  switch (keys) {
    case "h":
      return { to: Math.max(line, cursor - count) }
    case "l":
      return { to: Math.min(operator ? end : Math.max(line, end - 1), cursor + count) }
    case "0":
      return { to: line }
    case "^":
      return { to: firstNonBlank(chars, line) }
    case "$": {
      const last = lineEnd(chars, lineOffset(chars, lineNumberAt(chars, cursor) + count - 1))
      return operator ? { to: last } : { to: Math.max(lineStart(chars, last), last - 1) }
    }
    case "j":
    case "k": {
      const row = lineNumberAt(chars, cursor) + (keys === "j" ? count : -count)
      const total = lineNumberAt(chars, chars.length)
      if (row < 0 || row > total) return
      const start = lineOffset(chars, row)
      return { to: Math.min(start + (cursor - line), lineEnd(chars, start)), linewise: operator }
    }
    case "G":
      return { to: lineOffset(chars, explicit ? count - 1 : lineNumberAt(chars, chars.length)), linewise: true }
    case "g":
      return "pending"
    case "gg":
      return { to: lineOffset(chars, count - 1), linewise: true }
    case "w":
    case "W":
      return { to: times((at) => wordForward(chars, at, keys === "W")) }
    case "b":
    case "B":
      return { to: times((at) => wordBackward(chars, at, keys === "B")) }
    case "e":
    case "E":
      return { to: times((at) => wordEnd(chars, at, keys === "E")), inclusive: true }
    case ";":
    case ",": {
      const last = state.find
      if (!last) return
      const reverse = { f: "F", F: "f", t: "T", T: "t" } as Record<string, string>
      const repeat = keys === ";" ? last.key : reverse[last.key]
      const to = find(chars, cursor, repeat, last.char, count, true)
      if (to === undefined) return
      return { to, inclusive: /[ft]/.test(repeat) }
    }
  }
  if (/^[fFtT]$/.test(keys)) return "pending"
  if (/^[fFtT]/.test(keys)) {
    const to = find(chars, cursor, keys[0], keys.slice(1), count, false)
    if (to === undefined) return
    return { to, inclusive: /[ft]/.test(keys[0]), find: { find: { key: keys[0], char: keys.slice(1) } } }
  }
}

function find(chars: string[], cursor: number, kind: string, char: string, count: number, again: boolean) {
  const line = lineStart(chars, cursor)
  const end = lineEnd(chars, cursor)
  const forward = kind === "f" || kind === "t"
  const till = kind === "t" || kind === "T"
  // Repeating a `t` from just before its match would find the same match.
  const skip = again && till ? 1 : 0
  const hits = forward
    ? chars.slice(cursor + 1 + skip, end).flatMap((c, i) => (c === char ? [cursor + 1 + skip + i] : []))
    : chars
        .slice(line, Math.max(line, cursor - skip))
        .flatMap((c, i) => (c === char ? [line + i] : []))
        .reverse()
  const hit = hits[count - 1]
  if (hit === undefined) return
  if (!till) return hit
  return forward ? hit - 1 : hit + 1
}

function textObject(chars: string[], cursor: number, keys: string): [number, number] | undefined {
  const around = keys[0] === "a"
  const kind = keys[1]
  if (kind === "w" || kind === "W") {
    const big = kind === "W"
    const line = lineStart(chars, cursor)
    const end = lineEnd(chars, cursor)
    if (cursor >= end) return
    const type = kindOf(chars[cursor], big)
    const startAt = (at: number): number => (at > line && kindOf(chars[at - 1], big) === type ? startAt(at - 1) : at)
    const endAt = (at: number): number => (at < end && kindOf(chars[at], big) === type ? endAt(at + 1) : at)
    const from = startAt(cursor)
    const to = endAt(cursor)
    if (!around) return [from, to]
    const trailing = (at: number): number => (at < end && isSpace(chars[at]) ? trailing(at + 1) : at)
    const leading = (at: number): number => (at > line && isSpace(chars[at - 1]) ? leading(at - 1) : at)
    const after = trailing(to)
    return after > to || type === 0 ? [from, after] : [leading(from), to]
  }
  const pairs: Record<string, [string, string]> = {
    "(": ["(", ")"],
    ")": ["(", ")"],
    b: ["(", ")"],
    "[": ["[", "]"],
    "]": ["[", "]"],
    "{": ["{", "}"],
    "}": ["{", "}"],
    B: ["{", "}"],
    "<": ["<", ">"],
    ">": ["<", ">"],
  }
  const pair = pairs[kind]
  if (pair) {
    const open = enclosing(chars, cursor, pair[0], pair[1])
    if (open === undefined) return
    const close = matching(chars, open, pair[0], pair[1])
    if (close === undefined) return
    return around ? [open, close + 1] : [open + 1, close]
  }
  if (kind === '"' || kind === "'" || kind === "`") {
    const line = lineStart(chars, cursor)
    const quotes = chars
      .slice(line, lineEnd(chars, cursor))
      .flatMap((c, i) => (c === kind ? [line + i] : []))
    const pairsOf = quotes.flatMap((q, i) => (i % 2 === 0 && quotes[i + 1] !== undefined ? [[q, quotes[i + 1]]] : []))
    const hit = pairsOf.find(([a, b]) => a <= cursor && cursor <= b) ?? pairsOf.find(([a]) => a > cursor)
    if (!hit) return
    return around ? [hit[0], hit[1] + 1] : [hit[0] + 1, hit[1]]
  }
}

function enclosing(chars: string[], cursor: number, open: string, close: string): number | undefined {
  if (chars[cursor] === open) return cursor
  const walk = (at: number, depth: number): number | undefined => {
    if (at < 0) return
    if (chars[at] === close) return walk(at - 1, depth + 1)
    if (chars[at] === open) return depth === 0 ? at : walk(at - 1, depth - 1)
    return walk(at - 1, depth)
  }
  return walk(cursor - 1, 0)
}

function matching(chars: string[], from: number, open: string, close: string): number | undefined {
  // ponytail: recursion depth is the distance to the match; prompts are short.
  const walk = (at: number, depth: number): number | undefined => {
    if (at >= chars.length) return
    if (chars[at] === open) return walk(at + 1, depth + 1)
    if (chars[at] === close) return depth === 1 ? at : walk(at + 1, depth - 1)
    return walk(at + 1, depth)
  }
  return walk(from, 0)
}

// `dw` on the last word of a line stops at the line's end instead of joining lines.
function trimWordEnd(chars: string[], from: number, to: number) {
  const newline = to <= 0 ? -1 : chars.lastIndexOf("\n", to - 1)
  if (newline < from) return to
  if (chars.slice(newline, to).every(isSpace) && newline > from) return newline
  return to
}

function wordForward(chars: string[], at: number, big: boolean) {
  const type = kindOf(chars[at], big)
  const skipSame = (i: number): number => (i < chars.length && type !== 0 && kindOf(chars[i], big) === type ? skipSame(i + 1) : i)
  const skipSpace = (i: number, newlines: number): number => {
    if (i >= chars.length || !isSpace(chars[i])) return i
    // An empty line counts as a word.
    if (chars[i] === "\n" && newlines > 0) return i
    return skipSpace(i + 1, newlines + (chars[i] === "\n" ? 1 : 0))
  }
  return Math.min(chars.length, skipSpace(skipSame(at), 0))
}

function wordBackward(chars: string[], at: number, big: boolean) {
  const skipSpace = (i: number): number => (i > 0 && isSpace(chars[i]) ? skipSpace(i - 1) : i)
  const start = skipSpace(at - 1)
  if (start <= 0) return 0
  const type = kindOf(chars[start], big)
  const back = (i: number): number => (i > 0 && kindOf(chars[i - 1], big) === type ? back(i - 1) : i)
  return back(start)
}

function wordEnd(chars: string[], at: number, big: boolean) {
  const skipSpace = (i: number): number => (i < chars.length - 1 && isSpace(chars[i]) ? skipSpace(i + 1) : i)
  const start = skipSpace(at + 1)
  const type = kindOf(chars[start], big)
  const forward = (i: number): number =>
    i < chars.length - 1 && kindOf(chars[i + 1], big) === type ? forward(i + 1) : i
  return Math.min(Math.max(0, chars.length - 1), forward(start))
}

function kindOf(char: string | undefined, big: boolean) {
  if (char === undefined || isSpace(char)) return 0
  if (big) return 1
  return /^[\p{L}\p{N}_]/u.test(char) ? 1 : 2
}

function isSpace(char: string | undefined) {
  return char === " " || char === "\t" || char === "\n"
}

function toggleCase(char: string) {
  const upper = char.toUpperCase()
  return upper === char ? char.toLowerCase() : upper
}

export function lineStart(chars: string[], at: number) {
  // lastIndexOf counts a negative start from the end.
  return at <= 0 ? 0 : chars.lastIndexOf("\n", at - 1) + 1
}

export function lineEnd(chars: string[], at: number) {
  const index = chars.indexOf("\n", at)
  return index === -1 ? chars.length : index
}

function firstNonBlank(chars: string[], at: number) {
  const start = lineStart(chars, at)
  const end = lineEnd(chars, at)
  const index = chars.slice(start, end).findIndex((c) => c !== " " && c !== "\t")
  return index === -1 ? Math.max(start, end - 1) : start + index
}

function lineNumberAt(chars: string[], at: number) {
  return chars.slice(0, at).filter((c) => c === "\n").length
}

function lineOffset(chars: string[], row: number) {
  const starts = [0, ...chars.flatMap((c, i) => (c === "\n" ? [i + 1] : []))]
  return starts[Math.max(0, Math.min(row, starts.length - 1))]
}

// Normal mode never rests on a line's newline or past the end, except on an empty line.
function clamp(chars: string[], at: number) {
  const start = lineStart(chars, Math.min(at, chars.length))
  const end = lineEnd(chars, start)
  return Math.max(start, Math.min(at, end - 1))
}

export function segment(text: string) {
  return Array.from(new Intl.Segmenter().segment(text), (s) => s.segment)
}
