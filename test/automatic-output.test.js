import assert from "node:assert/strict"
import { test } from "node:test"
import { runDb } from "./support/db-command.js"

test("renders conversations automatically and preserves source references", () => {
  const result = runDb("SELECT 'ses_example' AS session_id, 'user' AS role, 'Hello' || char(10) || 'world' AS text")
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'session_id: "ses_example"\n\n## User\n\nHello\nworld\n')
})

test("returns raw selected values only when requested", () => {
  const sql = "SELECT 'user' AS role, 'Hello' AS text"
  const raw = runDb(sql, { args: ["--raw"] })
  assert.equal(raw.status, 0, raw.stderr)
  assert.deepEqual(JSON.parse(raw.stdout), [{ role: "user", text: "Hello" }])
  assert.equal(runDb("SELECT 'Hello' AS text").stdout, "Hello\n")
})

test("preserves unfamiliar shapes and non-text values as compact tables", () => {
  for (const sql of ["SELECT 42 AS text", "SELECT 'tool' AS role, 'hello' AS text"]) {
    const result = runDb(sql)
    assert.equal(result.status, 0, result.stderr)
    assert.ok(Array.isArray(JSON.parse(result.stdout).rows))
  }
})
