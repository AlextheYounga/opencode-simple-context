import assert from "node:assert/strict"
import { randomInt } from "node:crypto"
import { test } from "node:test"

import { runDbJson } from "../support/db-command.js"

// doc: docs/specs/context-query-tool.md#executes-custom-relational-and-json-queries-faithfully
test("returns_custom_relational_and_json_queries_faithfully", () => {
  const projected = runDbJson(`
    SELECT
      s.title AS session_title,
      json_extract(m.data, '$.role') AS role,
      length(json_extract(p.data, '$.text')) AS text_length
    FROM session s
    JOIN message m ON m.session_id = s.id
    JOIN part p ON p.message_id = m.id
    WHERE json_extract(p.data, '$.type') = 'text'
      AND json_extract(m.data, '$.role') = 'user'
    ORDER BY p.time_created
    LIMIT 3
  `)
  const aggregated = runDbJson(`
    SELECT json_extract(data, '$.role') AS role, count(*) AS messages
    FROM message
    GROUP BY role
    ORDER BY role
  `)
  const nonce = randomInt(1_000_000, 10_000_000)
  const selectedAtRuntime = runDbJson(`SELECT ${nonce} AS nonce, '7' AS text_value`)

  assert.deepEqual(projected, {
    columns: ["session_title", "role", "text_length"],
    rows: [
      ["Token-efficient OpenCode SQLite plugin", "user", 301],
      ["Token-efficient OpenCode SQLite plugin", "user", 196],
      ["Token-efficient OpenCode SQLite plugin", "user", 97],
    ],
  })
  assert.deepEqual(aggregated, {
    columns: ["role", "messages"],
    rows: [
      ["assistant", 26],
      ["user", 10],
    ],
  })
  assert.deepEqual(selectedAtRuntime, {
    columns: ["nonce", "text_value"],
    rows: [[nonce, "7"]],
  })
})
