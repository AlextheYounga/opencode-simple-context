const roleHeadings = {
  user: "User",
  assistant: "Assistant",
}

export function renderTranscript(rows) {
  if (!Array.isArray(rows)) {
    throw new TypeError("Expected an array of message rows")
  }

  return rows
    .map(({ role, text }, index) => {
      if (!(role in roleHeadings) || typeof text !== "string") {
        throw new TypeError(`Invalid message row at index ${index}`)
      }

      return `## ${roleHeadings[role]}\n\n${text}`
    })
    .join("\n\n")
}

if (import.meta.main) {
  const input = await Bun.stdin.text()
  process.stdout.write(`${renderTranscript(JSON.parse(input))}\n`)
}
