import { DatabaseSync } from "node:sqlite"

import { fixturePath } from "./db-command.js"

export function readFixture(sql, ...parameters) {
  const database = new DatabaseSync(fixturePath, { readOnly: true })

  try {
    return database.prepare(sql).all(...parameters)
  } finally {
    database.close()
  }
}

export function snapshotDatabase(path) {
  const database = new DatabaseSync(path, { readOnly: true })

  try {
    const tables = database
      .prepare(
        "SELECT name, sql FROM sqlite_schema WHERE type = 'table' ORDER BY name",
      )
      .all()

    return tables.map(({ name, sql }) => ({
      name,
      sql,
      rows: database.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all(),
    }))
  } finally {
    database.close()
  }
}
