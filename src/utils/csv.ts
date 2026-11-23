/**
 * Minimal RFC 4180 CSV reader that keeps the position of every row, so that
 * import errors can name a line. Handles quoted fields, doubled quotes,
 * embedded line breaks, CRLF or LF line ends, a UTF-8 byte order mark and the
 * comma, semicolon or tab delimiters.
 */

export const MAX_INPUT_BYTES = 2 * 1024 * 1024
export const MAX_ROWS = 5000

export interface CsvCell {
  /** `null` for an unquoted empty field or an unquoted NULL marker. */
  value: string | null
  quoted: boolean
}

export interface CsvRow {
  /** 1-based line of the first character of the row. */
  line: number
  cells: CsvCell[]
}

export interface CsvError {
  code: 'csvEmpty' | 'csvUnterminatedQuote' | 'csvTextAfterQuote' | 'csvTooManyRows' | 'csvFieldCount' | 'csvDuplicateHeader' | 'csvEmptyHeader'
  line: number
  params: Record<string, string | number>
}

export interface CsvTable {
  /** Header names, trimmed and lower-cased. */
  header: string[]
  rows: CsvRow[]
  errors: CsvError[]
}

const NULL_MARKERS = new Set(['null', '\\n', '(null)'])

function detectDelimiter(text: string): string {
  // Count candidate delimiters outside quotes on the header line only.
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let inQuotes = false
  for (const char of text) {
    if (char === '"') inQuotes = !inQuotes
    else if (!inQuotes && (char === '\n' || char === '\r')) break
    else if (!inQuotes && char in counts) counts[char] = (counts[char] ?? 0) + 1
  }
  let best = ','
  for (const candidate of [';', '\t']) {
    if ((counts[candidate] ?? 0) > (counts[best] ?? 0)) best = candidate
  }
  return best
}

function readRows(text: string, delimiter: string): { rows: CsvRow[]; errors: CsvError[] } {
  const rows: CsvRow[] = []
  const errors: CsvError[] = []
  let line = 1
  let rowLine = 1
  let cells: CsvCell[] = []
  let field = ''
  let quoted = false
  let inQuotes = false
  let afterQuote = false
  let quoteLine = 1

  const endField = (): void => {
    if (quoted) {
      cells.push({ value: field, quoted: true })
    } else {
      const trimmed = field.trim()
      const isNull = trimmed === '' || NULL_MARKERS.has(trimmed.toLowerCase())
      cells.push({ value: isNull ? null : trimmed, quoted: false })
    }
    field = ''
    quoted = false
    afterQuote = false
  }
  const endRow = (): void => {
    endField()
    const blank = cells.length === 1 && cells[0]?.value === null && !cells[0].quoted
    if (!blank) rows.push({ line: rowLine, cells })
    cells = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? ''
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
          afterQuote = true
        }
      } else {
        if (char === '\n') line += 1
        field += char
      }
      continue
    }
    if (char === '"' && field.trim() === '' && !afterQuote) {
      inQuotes = true
      quoted = true
      quoteLine = line
      field = ''
    } else if (char === delimiter) {
      endField()
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      endRow()
      line += 1
      rowLine = line
      if (rows.length > MAX_ROWS + 1) {
        errors.push({ code: 'csvTooManyRows', line, params: { max: MAX_ROWS } })
        return { rows: [], errors }
      }
    } else if (afterQuote) {
      if (char.trim() !== '') {
        errors.push({ code: 'csvTextAfterQuote', line, params: { field: cells.length + 1 } })
        // Skip the rest of the field to report one error only.
        while (index + 1 < text.length && ![delimiter, '\n', '\r'].includes(text[index + 1] ?? '')) index += 1
      }
    } else {
      field += char
    }
  }
  if (inQuotes) {
    errors.push({ code: 'csvUnterminatedQuote', line: quoteLine, params: {} })
    return { rows: [], errors }
  }
  if (field !== '' || quoted || cells.length > 0) endRow()
  return { rows, errors }
}

/** Parses CSV text. Any entry in `errors` means the table must not be used. */
export function parseCsv(input: string): CsvTable {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const { rows, errors } = readRows(text, detectDelimiter(text))
  if (errors.length > 0) return { header: [], rows: [], errors }
  const headerRow = rows[0]
  if (!headerRow) {
    return { header: [], rows: [], errors: [{ code: 'csvEmpty', line: 1, params: {} }] }
  }
  const header = headerRow.cells.map((cell) => (cell.value ?? '').trim().toLowerCase())
  header.forEach((name, index) => {
    if (name === '') {
      errors.push({ code: 'csvEmptyHeader', line: headerRow.line, params: { field: index + 1 } })
    } else if (header.indexOf(name) !== index) {
      errors.push({ code: 'csvDuplicateHeader', line: headerRow.line, params: { column: name } })
    }
  })
  const dataRows = rows.slice(1)
  for (const row of dataRows) {
    if (row.cells.length !== header.length) {
      errors.push({
        code: 'csvFieldCount',
        line: row.line,
        params: { found: row.cells.length, expected: header.length },
      })
    }
  }
  return { header, rows: errors.length > 0 ? [] : dataRows, errors }
}
