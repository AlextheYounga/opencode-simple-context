import { renderTranscript } from "./transcript.js"

export const DEFAULT_MAX_CHARS = 12000
export const MAX_CHARS = 100000

export function serializeResult({ columns, rows }, options = {}) {
  const format = options.format ?? "compact"
  const budget = (options.maxChars ?? DEFAULT_MAX_CHARS) - 1 // CLI newline
  if (!["compact", "json", "markdown"].includes(format)) {
    throw new Error(`Unsupported output format: ${format}`)
  }
  if (format === "markdown" && (columns.length !== 2 || columns[0] !== "role" || columns[1] !== "text")) {
    throw new Error("Markdown output requires exactly two columns named role and text")
  }

  const selected = []
  const clippedCells = []
  let more = false
  const valueLimit = Math.max(16, Math.floor(budget / 4))

  for (const row of rows) {
    const clipped = []
    const values = row.map((value, index) => {
      if (typeof value === "string" && value.length > valueLimit) {
        clipped.push(index)
        return `${value.slice(0, valueLimit - 1)}…`
      }
      return value
    })
    selected.push(values)
    clippedCells.push(...clipped.map((column) => [selected.length - 1, column]))
    if (render(columns, selected, format, clippedCells.length ? metadata(false, selected.length, clippedCells) : undefined).length > budget) {
      selected.pop()
      while (clippedCells.at(-1)?.[0] === selected.length) clippedCells.pop()
      more = true
      break
    }
  }

  while (more && selected.length && render(columns, selected, format, metadata(true, selected.length, clippedCells)).length > budget) {
    selected.pop()
    while (clippedCells.at(-1)?.[0] === selected.length) clippedCells.pop()
  }
  const truncation = more || clippedCells.length
    ? metadata(more, selected.length, clippedCells)
    : undefined
  const output = render(columns, selected, format, truncation)
  if (output.length > budget) throw new Error("Output budget is too small for columns and truncation metadata")
  if (more && selected.length === 0) {
    throw new Error("No row fits the response budget; select fewer columns, shorten values with substr(), or increase --max-chars")
  }
  return output
}

function metadata(more, count, clippedCells) {
  return {
    rowsOmitted: more ? 1 : 0,
    rowsOmittedIsLowerBound: more,
    valuesClipped: clippedCells.length,
    clippedCells,
    nextOffset: count,
  }
}

function render(columns, rows, format, truncated) {
  if (format === "markdown") {
    const text = renderTranscript(rows.map(([role, text]) => ({ role, text })))
    return truncated ? `${text}\n\n[truncated ${JSON.stringify(truncated)}]` : text
  }
  if (format === "json") {
    const objects = rows.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])))
    return JSON.stringify(truncated ? { rows: objects, truncated } : objects, jsonReplacer, 2)
  }
  return JSON.stringify(truncated ? { columns, rows, truncated } : { columns, rows }, jsonReplacer)
}

function jsonReplacer(_key, value) {
  if (typeof value === "bigint") return value.toString()
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64")
  return value
}
