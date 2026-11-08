import { renderTranscript } from "./transcript.js"

export function serializeResult(result, options = {}) {
  const format = options.format ?? "compact"

  if (format === "json") return serializeJson(result)
  if (format === "markdown") return serializeMarkdown(result)
  if (format === "compact") return serializeCompact(result, options.maxChars)

  throw new Error(`Unsupported output format: ${format}`)
}

function serializeJson({ columns, rows }) {
  const objects = rows.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])))
  return JSON.stringify(objects, jsonReplacer, 2)
}

function serializeMarkdown({ columns, rows }) {
  if (columns.length !== 2 || columns[0] !== "role" || columns[1] !== "text") {
    throw new Error("Markdown output requires exactly two columns named role and text")
  }

  return renderTranscript(rows.map(([role, text]) => ({ role, text })))
}

function serializeCompact({ columns, rows }, maxChars) {
  const complete = JSON.stringify({ columns, rows }, jsonReplacer)
  if (maxChars === undefined || complete.length <= maxChars) return complete

  const maxValueChars = Math.max(16, Math.floor(maxChars / 4))
  const clipped = rows.map((row) => row.map((value) => clipValue(value, maxValueChars)))

  for (let count = clipped.length; count >= 0; count -= 1) {
    const selected = clipped.slice(0, count)
    const valuesClipped = selected.flat().filter((value) => value.clipped).length
    const payload = {
      columns,
      rows: selected.map((row) => row.map((value) => value.value)),
      truncated: {
        rowsOmitted: rows.length - count,
        valuesClipped,
        nextOffset: count,
      },
    }
    const output = JSON.stringify(payload, jsonReplacer)
    if (output.length <= maxChars) return output
  }

  throw new Error(`Output budget of ${maxChars} characters is too small for truncation metadata`)
}

function clipValue(value, maxChars) {
  if (typeof value !== "string" || value.length <= maxChars) {
    return { value, clipped: false }
  }
  return { value: `${value.slice(0, maxChars - 1)}…`, clipped: true }
}

function jsonReplacer(_key, value) {
  if (typeof value === "bigint") return value.toString()
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64")
  return value
}
