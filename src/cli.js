#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

import { DEFAULT_MAX_CHARS, MAX_CHARS, serializeResult } from "./serialize.js"

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

  const sql = parsed.schema
    ? "SELECT name, sql FROM sqlite_schema WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
    : parsed.query ?? readQueryFromStdin()
  const { executeReadQuery } = await loadQueryRunner()
  const output = executeReadQuery(parsed.database, sql, (result) => serializeResult(result, parsed))
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
    maxChars: DEFAULT_MAX_CHARS,
    path: false,
    schema: false,
    query: undefined,
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "path" && options.query === undefined) {
      options.path = true
      continue
    }
    if (argument === "schema" && options.query === undefined) {
      options.schema = true
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
      if (!Number.isInteger(options.maxChars) || options.maxChars < 300 || options.maxChars > MAX_CHARS) {
        throw new Error(`--max-chars must be an integer between 300 and ${MAX_CHARS}`)
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
  opencode-context db schema [--database PATH]

Retrieval: inspect schema, select IDs and substr(text, ...) excerpts, then
query a small chronological window around a chosen match. Use ORDER BY and
LIMIT/OFFSET for stable paging. See skills/context-retrieval/SKILL.md.

Options:
  --database PATH   Query a specific SQLite database
  --format FORMAT   Output format (default: compact)
  --max-chars N     Bound every output format (default: ${DEFAULT_MAX_CHARS}, maximum: ${MAX_CHARS})
  --help, -h        Show help
  --version, -v     Show version
`
}
