import { constants, DatabaseSync } from "node:sqlite"
import { serializeResult } from "./serialize.js"

const allowedActions = new Set([
  constants.SQLITE_FUNCTION,
  constants.SQLITE_READ,
  constants.SQLITE_RECURSIVE,
  constants.SQLITE_SELECT,
])
const restrictedTables = new Set([
  "account",
  "account_state",
  "control_account",
  "credential",
  "permission",
])

export function executeReadQuery(databasePath, sql, consume) {
  if (typeof sql !== "string" || sql.trim() === "") {
    throw new Error("SQL query must not be empty")
  }
  if (containsMultipleStatements(sql)) {
    throw new Error("Only one read-only SQL statement is allowed")
  }

  const database = new DatabaseSync(databasePath, { readOnly: true })
  database.enableDefensive(true)
  database.enableLoadExtension(false)
  database.setAuthorizer((action, table) => {
    if (action === constants.SQLITE_PRAGMA && table === "table_info") return constants.SQLITE_OK
    if (action === constants.SQLITE_READ && restrictedTables.has(table)) {
      return constants.SQLITE_DENY
    }
    return allowedActions.has(action) ? constants.SQLITE_OK : constants.SQLITE_DENY
  })

  try {
    const statement = database.prepare(sql)
    const columns = statement.columns().map(({ name }) => name)
    statement.setReturnArrays(true)
    const rows = statement.iterate()
    if (consume) return consume({ columns, rows })
    return JSON.parse(serializeResult({ columns, rows }, { format: "compact" }))
  } finally {
    database.close()
  }
}

function containsMultipleStatements(sql) {
  let state = "sql"
  let ended = false

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index]
    const next = sql[index + 1]

    if (state === "line-comment") {
      if (character === "\n") state = "sql"
      continue
    }
    if (state === "block-comment") {
      if (character === "*" && next === "/") {
        state = "sql"
        index += 1
      }
      continue
    }
    if (state !== "sql") {
      const closing = state === "bracket" ? "]" : state
      if (character === closing) {
        if (state !== "bracket" && next === closing) {
          index += 1
        } else {
          state = "sql"
        }
      }
      continue
    }
    if (character === "-" && next === "-") {
      state = "line-comment"
      index += 1
      continue
    }
    if (character === "/" && next === "*") {
      state = "block-comment"
      index += 1
      continue
    }
    if (ended && !/\s/u.test(character) && character !== ";") return true
    if (character === "'" || character === '"' || character === "`") {
      state = character
      continue
    }
    if (character === "[") {
      state = "bracket"
      continue
    }
    if (character === ";") {
      ended = true
      continue
    }
  }

  return false
}
