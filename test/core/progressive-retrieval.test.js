import assert from "node:assert/strict"
import { test } from "node:test"

import { runDbJson } from "../support/db-command.js"

const findPassageSql = `
  SELECT
    p.message_id,
    p.session_id,
    substr(json_extract(p.data, '$.text'), 1, 120) AS excerpt
  FROM part p
  WHERE json_extract(p.data, '$.type') = 'text'
    AND json_extract(p.data, '$.text') LIKE '%semantic renderer%'
  ORDER BY p.time_created
`

// doc: docs/specs/context-query-tool.md#finds-and-expands-only-relevant-conversation-context
test("identifies_and_expands_only_relevant_conversation_context", () => {
  const matches = runDbJson(findPassageSql)

  assert.deepEqual(matches, {
    columns: ["message_id", "session_id", "excerpt"],
    rows: [
      [
        "msg_0f0a7f352001dxZOJFMwtltRh3",
        "ses_f0f711861ffegEgbxfFllJVdoy",
        "Yes. The useful product may be less “compact SQL output” and more **a semantic renderer for OpenCode records**.\n\nThe pip",
      ],
    ],
  })

  const [messageId, sessionId] = matches.rows[0]
  const context = runDbJson(contextWindowSql(sessionId, messageId))

  assert.deepEqual(context, {
    columns: ["message_id", "role", "text"],
    rows: [
      [
        "msg_0f0a7f6fd001y3dCnODoJ3TcNK",
        "user",
        "Stripping the unnecessary metadata",
      ],
      [
        "msg_0f0a7f352001dxZOJFMwtltRh3",
        "assistant",
        "Yes. The useful product may be less “compact SQL output” and more **a semantic r",
      ],
      [
        "msg_0f0a858b500177J7hiRFHxQBII",
        "assistant",
        "Exactly. The transformation should be **projection-first**: retain only informat",
      ],
    ],
  })
})

function contextWindowSql(sessionId, messageId) {
  return `
    WITH texts AS (
      SELECT p.message_id, json_extract(m.data, '$.role') AS role,
        json_extract(p.data, '$.text') AS text, p.time_created
      FROM part p JOIN message m ON m.id = p.message_id
      WHERE p.session_id = '${sessionId}'
        AND json_extract(p.data, '$.type') = 'text'
    ), numbered AS (
      SELECT *, row_number() OVER (ORDER BY time_created, message_id) AS position
      FROM texts
    ), anchor AS (
      SELECT position FROM numbered WHERE message_id = '${messageId}'
    )
    SELECT n.message_id, n.role, substr(n.text, 1, 80) AS text
    FROM numbered n, anchor a
    WHERE n.position BETWEEN a.position - 1 AND a.position + 1
    ORDER BY n.position
  `
}
