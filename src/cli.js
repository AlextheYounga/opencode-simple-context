#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

import { serializeResult } from "./serialize.js"

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
)

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`)
  process.exitCode = 1
})

async function main(args) {
  if (args.includes("--version") || args.includes("-v")) {
    process.stdout.write(`${version}\n`)
    return
  }
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(helpText())
    return
  }
  if (args[0] !== "db") throw new Error(`Unknown command: ${args[0]}`)

  const parsed = parseDbArguments(args.slice(1))
  if (parsed.path) {
    process.stdout.write(`${parsed.database}\n`)
    return
  }

  const sql = parsed.query ?? readQueryFromStdin()
  const { executeReadQuery } = await loadQueryRunner()
  const result = executeReadQuery(parsed.database, sql)
  const output = serializeResult(result, parsed)
  process.stdout.write(`${output}\n`)
}

async function loadQueryRunner() {
  const emitWarning = process.emitWarning
  process.emitWarning = (warning, ...args) => {
    if (String(warning) === "SQLite is an experimental feature and might change at any time") return
    return emitWarning.call(process, warning, ...args)
  }
  try {
    return await import("./query.js")
  } finally {
    process.emitWarning = emitWarning
  }
}

function parseDbArguments(args) {
  const options = {
    database: resolveDatabasePath(),
    format: "compact",
    maxChars: undefined,
    path: false,
    query: undefined,
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "path" && options.query === undefined) {
      options.path = true
      continue
    }
    if (argument === "--database") {
      options.database = requiredValue(args, ++index, argument)
      continue
    }
    if (argument === "--format") {
      options.format = requiredValue(args, ++index, argument)
      if (!new Set(["compact", "json", "markdown"]).has(options.format)) {
        throw new Error("--format must be compact, json, or markdown")
      }
      continue
    }
    if (argument === "--max-chars") {
      options.maxChars = Number(requiredValue(args, ++index, argument))
      if (!Number.isInteger(options.maxChars) || options.maxChars < 100) {
        throw new Error("--max-chars must be an integer of at least 100")
      }
      continue
    }
    if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`)
    if (options.query !== undefined) throw new Error("Only one SQL query argument is allowed")
    options.query = argument
  }

  return options
}

function requiredValue(args, index, option) {
  const value = args[index]
  if (value === undefined) throw new Error(`${option} requires a value`)
  return value
}

function readQueryFromStdin() {
  if (process.stdin.isTTY) throw new Error("Provide a SQL query argument or pipe one on stdin")
  return readFileSync(0, "utf8")
}

function resolveDatabasePath() {
  if (process.env.OPENCODE_DB_PATH) return process.env.OPENCODE_DB_PATH
  const data = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share")
  return join(data, "opencode", "opencode.db")
}

function helpText() {
  return `opencode-context

Usage:
  opencode-context db <query> [--format compact|json|markdown] [--max-chars N]
  opencode-context db path

Options:
  --database PATH   Query a specific SQLite database
  --format FORMAT   Output format (default: compact)
  --max-chars N     Bound the complete compact response
  --help, -h        Show help
  --version, -v     Show version
`
}
