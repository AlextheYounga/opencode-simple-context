import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { renderTranscript } from "../src/transcript.js"

describe("renderTranscript", () => {
  test("renders message content and strips unselected metadata", () => {
    const result = renderTranscript([
      { id: "msg_1", role: "user", text: "Question", tokens: 10 },
      { id: "msg_2", role: "assistant", text: "First line\nSecond line" },
    ])

    assert.equal(
      result,
      "## User\n\nQuestion\n\n## Assistant\n\nFirst line\nSecond line",
    )
    assert.doesNotMatch(result, /msg_1/)
    assert.doesNotMatch(result, /tokens/)
  })

  test("rejects rows without a supported role and text", () => {
    assert.throws(
      () => renderTranscript([{ role: "tool", text: "Result" }]),
      { message: "Invalid message row at index 0" },
    )
  })
})
