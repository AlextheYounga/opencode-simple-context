import assert from "node:assert/strict"
import { randomInt } from "node:crypto"
import { test } from "node:test"

import { runDbJson, runDbSuccessfully } from "../support/db-command.js"

// doc: docs/specs/context-query-tool.md#limits-oversized-results-and-reports-how-to-continue
test("limits_oversized_results_and_reports_how_to_continue", () => {
  const maxChars = randomInt(900, 1100)
  const source = `
    WITH RECURSIVE generated(id) AS (
      VALUES(1)
      UNION ALL
      SELECT id + 1 FROM generated WHERE id < 200
    )
    SELECT id, replace(hex(zeroblob(150)), '00', printf('%03d', id)) AS text
    FROM generated
    ORDER BY id
  `
  const output = runDbSuccessfully(source, {
    args: ["--max-chars", String(maxChars)],
  })
  const result = JSON.parse(output)

  assert.ok(output.length <= maxChars)
  assert.ok(result.truncated.rowsOmitted > 0)
  assert.ok(result.truncated.valuesClipped > 0)

  const continued = runDbJson(`${source} LIMIT 1 OFFSET ${result.truncated.nextOffset}`)
  assert.equal(continued.rows[0][0], result.truncated.nextOffset + 1)
})
