import { describe, expect, test } from "bun:test"
import { Vim } from "../../src/component/prompt/vim"

// "|" marks the cursor. Keys are typed one by one; <esc> and <C-r> are special.
function type(start: string, keys: string, mode: Vim.Mode = "normal") {
  const at = start.indexOf("|")
  const initial = {
    chars: Vim.segment(start.replace("|", "")),
    cursor: Vim.segment(start.slice(0, at)).length,
    state: { ...Vim.initial(), mode },
  }
  const tokens = keys.match(/<esc>|<C-r>|./gsu) ?? []
  const result = tokens.reduce((acc, token) => {
    const key = token === "<esc>" ? "escape" : token === "<C-r>" ? "ctrl+r" : token
    // Insert mode text goes to the textarea, not the engine.
    if (acc.state.mode === "insert" && key !== "escape")
      return {
        ...acc,
        chars: [...acc.chars.slice(0, acc.cursor), key, ...acc.chars.slice(acc.cursor)],
        cursor: acc.cursor + 1,
      }
    return Vim.key(acc.chars, acc.cursor, acc.state, key)
  }, initial)
  const text = [...result.chars.slice(0, result.cursor), "|", ...result.chars.slice(result.cursor)].join("")
  return { text, mode: result.state.mode, state: result.state }
}

describe("vim motions", () => {
  test.each([
    ["|foo bar baz", "w", "foo |bar baz"],
    ["|foo bar baz", "2w", "foo bar |baz"],
    ["foo.bar |baz", "b", "foo.|bar baz"],
    ["foo.bar |baz", "B", "|foo.bar baz"],
    ["|foo bar", "e", "fo|o bar"],
    ["|foo bar", "$", "foo ba|r"],
    ["  foo |bar", "^", "  |foo bar"],
    ["  foo |bar", "0", "|  foo bar"],
    ["|a,b,c", "f,", "a|,b,c"],
    ["|a,b,c", "2f,", "a,b|,c"],
    ["|a,b,c", "t,", "|a,b,c"],
    ["|a,b,c", "f,;", "a,b|,c"],
    ["a,b,|c", "F,", "a,b|,c"],
    ["one\n|two\nthree", "j", "one\ntwo\n|three"],
    ["one\ntw|o\nthree", "k", "on|e\ntwo\nthree"],
    ["one\ntwo\nth|ree", "gg", "|one\ntwo\nthree"],
    ["|one\ntwo\nthree", "G", "one\ntwo\n|three"],
    ["|one\ntwo\nthree", "2G", "one\n|two\nthree"],
    ["|foo\n\nbar", "w", "foo\n|\nbar"],
    ["|日本 語", "w", "日本 |語"],
    ["|😀😀 x", "l", "😀|😀 x"],
  ])("%p + %p", (start, keys, expected) => {
    expect(type(start, keys).text).toBe(expected)
  })
})

describe("vim edits", () => {
  test.each([
    ["foo |bar baz", "dw", "foo |baz"],
    ["foo |bar baz", "d2w", "foo| "],
    ["foo |bar\nbaz", "dw", "foo| \nbaz"],
    ["foo |bar baz", "cwqux<esc>", "foo qu|x baz"],
    ["foo |bar baz", "D", "foo| "],
    ["foo |bar baz", "C!<esc>", "foo |!"],
    ["|abc", "x", "|bc"],
    ["|abc", "2x", "|c"],
    ["ab|c", "X", "a|c"],
    ["|abc", "rz", "|zbc"],
    ["|abc", "~~", "AB|c"],
    ["one\n|two\nthree", "dd", "one\n|three"],
    ["one\ntwo\n|three", "dd", "one\n|two"],
    ["one\n|two\nthree", "2dd", "|one"],
    ["one\n  |two\nthree", "ccx<esc>", "one\n  |x\nthree"],
    ["|one\ntwo", "dj", "|"],
    ["|one\ntwo", "J", "one| two"],
    ["|one\n   two", "J", "one| two"],
    ["f(a, |b) x", "di(", "f(|) x"],
    ["f(a, |b) x", "da(", "f| x"],
    ['say "hi |there" ok', 'ci"yo<esc>', 'say "y|o" ok'],
    ['|say "hi" ok', 'di"', 'say "|" ok'],
    ["foo |bar baz", "diw", "foo | baz"],
    ["foo |bar baz", "daw", "foo |baz"],
    ["{\n  a|b\n}", "di{", "{|}"],
    ["|abc", "ix<esc>", "|xabc"],
    ["|abc", "ax<esc>", "a|xbc"],
    ["a|bc", "Ax<esc>", "abc|x"],
    ["  a|bc", "Ix<esc>", "  |xabc"],
    ["|one\ntwo", "onew<esc>", "one\nne|w\ntwo"],
    ["one\n|two", "Onew<esc>", "one\nne|w\ntwo"],
  ])("%p + %p", (start, keys, expected) => {
    expect(type(start, keys).text).toBe(expected)
  })

  test("yank and paste a word", () => {
    expect(type("|foo bar", "yw$p").text).toBe("foo barfoo| ")
  })

  test("yank and paste lines", () => {
    expect(type("|one\ntwo", "yyjp").text).toBe("one\ntwo\n|one")
    expect(type("one\n|two", "yykP").text).toBe("|two\none\ntwo")
  })

  test("delete puts text in the register", () => {
    expect(type("|ab", "xp").text).toBe("b|a")
  })

  test("dot repeats the last change", () => {
    expect(type("|a b c d", "dw.").text).toBe("|c d")
    expect(type("|foo foo", "cwbar<esc>w.").text).toBe("bar ba|r")
    expect(type("|x\ny\nz", "Aa<esc>j.").text).toBe("xa\ny|a\nz")
  })

  test("undo and redo are left to the textarea", () => {
    const undo = Vim.key(Vim.segment("ab"), 0, { ...Vim.initial(), mode: "normal" }, "u")
    expect(undo.undo).toBe(true)
    const redo = Vim.key(Vim.segment("ab"), 0, { ...Vim.initial(), mode: "normal" }, "ctrl+r")
    expect(redo.redo).toBe(true)
  })
})

describe("vim modes", () => {
  test("escape from insert steps back one character", () => {
    const result = type("abc|", "<esc>", "insert")
    expect(result).toMatchObject({ text: "ab|c", mode: "normal" })
  })

  test("a pending operator waits for its motion", () => {
    expect(type("|foo bar", "d").state.pending).toBe("d")
    expect(type("|foo bar", "d<esc>").state.pending).toBe("")
  })

  test("unknown keys are swallowed in normal mode", () => {
    expect(type("|foo", "Q").text).toBe("|foo")
  })

  test("visual mode selects and operates", () => {
    expect(type("|foo bar", "ved").text).toBe("| bar")
    expect(type("|foo bar", "veyP").text).toBe("fo|ofoo bar")
    expect(type("|one\ntwo\nthree", "Vjd").text).toBe("|three")
    expect(type("foo |bar baz", "viwc!<esc>").text).toBe("foo |! baz")
    expect(type("|abc", "vl~").mode).toBe("normal")
  })
})
