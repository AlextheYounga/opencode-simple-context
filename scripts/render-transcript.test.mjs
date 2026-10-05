import { describe, expect, test } from "bun:test"
import { renderTranscript } from "./render-transcript.mjs"

describe("renderTranscript", () => {
  test("renders message content and strips unselected metadata", () => {
    const result = renderTranscript([
      { id: "msg_1", role: "user", text: "Question", tokens: 10 },
      { id: "msg_2", role: "assistant", text: "First line\nSecond line" },
    ])

    expect(result).toBe(
      "## User\n\nQuestion\n\n## Assistant\n\nFirst line\nSecond line",
    )
    expect(result).not.toContain("msg_1")
    expect(result).not.toContain("tokens")
  })

  test("rejects rows without a supported role and text", () => {
    expect(() => renderTranscript([{ role: "tool", text: "Result" }])).toThrow(
      "Invalid message row at index 0",
    )
  })
})
