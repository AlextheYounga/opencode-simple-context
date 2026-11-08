import assert from "node:assert/strict"
import { test } from "node:test"

import { serializeResult, DEFAULT_MAX_CHARS } from "../src/serialize.js"
import { runDb } from "./support/db-command.js"

test("bounds every CLI format by default and explicitly", () => {
  const sql = `WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1000)
    SELECT 'assistant' AS role, printf('%0500d', x) AS text FROM n`
  for (const format of ["auto", "compact", "json", "markdown"]) {
    for (const budget of [undefined, 1200]) {
      const args = ["--format", format]
      if (budget) args.push("--max-chars", String(budget))
      const result = runDb(sql, { args })
      assert.equal(result.status, 0, result.stderr)
      assert.ok(result.stdout.length <= (budget ?? DEFAULT_MAX_CHARS))
      assert.match(result.stdout, /truncated/)
    }
  }
})

test("stops consuming rows when the response fills", () => {
  let consumed = 0
  function* rows() {
    for (let id = 0; id < 1000000; id++) {
      consumed++
      yield [id, "x".repeat(100)]
    }
  }
  const result = JSON.parse(serializeResult({ columns: ["id", "text"], rows: rows() }, { format: "compact", maxChars: 1000 }))
  assert.ok(consumed < 20)
  assert.ok(result.truncated.rowsOmittedIsLowerBound)
  assert.equal(result.truncated.nextOffset, result.rows.length)
})

test("stops stepping SQLite before evaluating the unread tail", () => {
  const sql = `WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1000)
    SELECT x, CASE WHEN x > 100 THEN abs(-9223372036854775808)
      ELSE printf('%0100d', x) END AS text FROM n`
  const result = runDb(sql, { args: ["--format", "compact", "--max-chars", "1000"] })
  assert.equal(result.status, 0, result.stderr)
  assert.ok(JSON.parse(result.stdout).truncated.rowsOmittedIsLowerBound)
})

test("provides schema discovery without returning conversation bodies", () => {
  const result = runDb("schema")
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /session_message\(id TEXT/i)
  assert.doesNotMatch(result.stdout, /CREATE TABLE/)
})
