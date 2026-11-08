import assert from "node:assert/strict"
import { test } from "node:test"
import { copyFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { fixturePath, runDb, runDbJson } from "../support/db-command.js"
import { snapshotDatabase } from "../support/fixture.js"

// doc: docs/specs/context-query-tool.md#rejects-every-attempted-database-mutation
test("rejects_every_attempted_database_mutation", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "opencode-context-test-"))
  const database = join(directory, "fixture.db")
  copyFileSync(fixturePath, database)
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const before = snapshotDatabase(database)
  const mutations = [
    "INSERT INTO project (id, worktree, time_created, time_updated) VALUES ('bad', '/tmp', 0, 0)",
    "UPDATE session_v2 SET title = 'changed'",
    "DELETE FROM session_message",
    "CREATE TABLE injected (value TEXT)",
    "DROP TABLE part",
    "PRAGMA user_version = 7",
    `ATTACH DATABASE '${join(directory, "attached.db")}' AS attached`,
    "SELECT 1; SELECT 2",
    "SELECT 1; DELETE FROM project",
    "SELECT load_extension('/tmp/not-an-extension')",
  ]
  const attempts = mutations.map((sql) => runDb(sql, { database }))

  assert.ok(attempts.every(({ status }) => status !== 0))
  assert.deepEqual(snapshotDatabase(database), before)
  assert.deepEqual(runDbJson("SELECT count(*) AS sessions FROM session_v2", { database }), {
    columns: ["sessions"],
    rows: [[2]],
  })
})
