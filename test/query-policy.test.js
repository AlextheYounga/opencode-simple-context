import assert from "node:assert/strict"
import { copyFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { test } from "node:test"

import { fixturePath, runDb, runDbJson } from "./support/db-command.js"

test("rejects reads from credential tables while preserving conversation access", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "opencode-context-policy-"))
  const database = join(directory, "fixture.db")
  copyFileSync(fixturePath, database)
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const setup = new DatabaseSync(database)
  setup.exec("CREATE TABLE credential (id TEXT PRIMARY KEY, secret TEXT NOT NULL)")
  setup.prepare("INSERT INTO credential VALUES (?, ?)").run("cred_1", "do-not-return")
  setup.close()

  const restricted = runDb("SELECT * FROM credential", { database })

  assert.notEqual(restricted.status, 0)
  assert.deepEqual(runDbJson("SELECT count(*) AS sessions FROM session_v2", { database }), {
    columns: ["sessions"],
    rows: [[2]],
  })
})
