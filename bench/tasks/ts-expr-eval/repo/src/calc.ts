export class CalcError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message)
  }
}

// Evaluates a formula such as "price * (1 + tax)".
// TODO: this only works left to right and ignores precedence, parentheses and errors.
export function evaluate(source: string, vars: Record<string, number> = {}): number {
  const tokens = source.match(/\d+(\.\d+)?|[A-Za-z_]\w*|[-+*/]/g) ?? []
  const value = (token: string) => (/^\d/.test(token) ? Number(token) : vars[token])
  let result = value(tokens[0])
  for (let i = 1; i < tokens.length; i += 2) {
    const right = value(tokens[i + 1])
    if (tokens[i] === "+") result += right
    if (tokens[i] === "-") result -= right
    if (tokens[i] === "*") result *= right
    if (tokens[i] === "/") result /= right
  }
  return result
}
