import assert from "node:assert/strict"
import { test } from "node:test"

import { serializeResult } from "../src/serialize.js"

test("omits truncation metadata when a bounded compact result fits", () => {
  const output = serializeResult(
    { columns: ["id", "title"], rows: [[1, "Example"]] },
    { format: "compact", maxChars: 200 },
  )

  assert.deepEqual(JSON.parse(output), {
    columns: ["id", "title"],
    rows: [[1, "Example"]],
  })
})
