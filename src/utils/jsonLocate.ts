/**
 * Finds the offset of the first JSON syntax error. `JSON.parse` only reports a
 * position in some engines and for some errors, so the text is scanned again
 * here when it fails. Returns `null` when no error is found.
 */
export function findJsonErrorOffset(text: string): number | null {
  let index = 0
  const skipSpace = (): void => {
    while (index < text.length && ' \t\n\r'.includes(text[index] ?? '')) index += 1
  }
  const fail = (): never => {
    throw new RangeError(String(index))
  }
  const readString = (): void => {
    index += 1
    while (index < text.length) {
      const char = text[index] ?? ''
      if (char === '"') {
        index += 1
        return
      }
      if (char === '\\') index += 1
      else if (char < ' ') fail()
      index += 1
    }
    fail()
  }
  const readValue = (depth: number): void => {
    if (depth > 200) fail()
    skipSpace()
    const char = text[index] ?? ''
    if (char === '{' || char === '[') {
      const close = char === '{' ? '}' : ']'
      index += 1
      skipSpace()
      if (text[index] === close) {
        index += 1
        return
      }
      for (;;) {
        if (close === '}') {
          skipSpace()
          if (text[index] !== '"') fail()
          readString()
          skipSpace()
          if (text[index] !== ':') fail()
          index += 1
        }
        readValue(depth + 1)
        skipSpace()
        if (text[index] === ',') {
          index += 1
          continue
        }
        if (text[index] === close) {
          index += 1
          return
        }
        fail()
      }
    } else if (char === '"') {
      readString()
    } else {
      const literal = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(index, index + 64))
      if (!literal) fail()
      else index += literal[0].length
    }
  }
  try {
    readValue(0)
    skipSpace()
    return index < text.length ? index : null
  } catch (error) {
    return error instanceof RangeError ? Number(error.message) : null
  }
}

/** 1-based line and column of an offset. */
export function lineAndColumn(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset)
  return { line: before.split('\n').length, column: offset - before.lastIndexOf('\n') }
}
