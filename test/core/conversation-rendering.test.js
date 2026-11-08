import assert from "node:assert/strict"
import { test } from "node:test"
import { encode } from "gpt-tokenizer/model/gpt-5"

import { runDbSuccessfully } from "../support/db-command.js"
import { readFixture } from "../support/fixture.js"

// doc: docs/specs/context-query-tool.md#renders-selected-conversation-text-with-fewer-tokens
test("renders_selected_conversation_text_with_fewer_tokens", () => {
  const sql = `
    SELECT
      json_extract(m.data, '$.role') AS role,
      json_extract(p.data, '$.text') AS text
    FROM message m
    JOIN part p ON p.message_id = m.id
    WHERE p.message_id IN (
      'msg_0f0a7f6fd001y3dCnODoJ3TcNK',
      'msg_0f0a7f352001dxZOJFMwtltRh3'
    )
      AND json_extract(p.data, '$.type') = 'text'
    ORDER BY p.time_created
  `
  const messages = readFixture(sql)
  const markdown = runDbSuccessfully(sql, { args: ["--max-chars", "20000"] })
  const rawJson = runDbSuccessfully(sql, { args: ["--raw", "--max-chars", "20000"] })
  const expected = messages
    .map(({ role, text }) => `## ${role === "user" ? "User" : "Assistant"}\n\n${text}`)
    .join("\n\n---\n\n")

  assert.equal(markdown, expected)
  assert.ok(encode(markdown).length < encode(rawJson).length)
})
