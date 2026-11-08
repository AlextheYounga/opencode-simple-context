import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

export const fixturePath = resolve("fixtures/private/opencode-test.db")
const cliPath = resolve("src/cli.js")

export function runDb(sql, options = {}) {
  const args = ["db", sql, ...(options.args ?? [])]
  const executable = process.env.OPENCODE_CONTEXT_BIN ?? process.execPath
  const executableArgs = process.env.OPENCODE_CONTEXT_BIN ? args : [cliPath, ...args]
  const result = spawnSync(executable, executableArgs, {
    encoding: "utf8",
    env: {
      ...process.env,
      OPENCODE_DB_PATH: options.database ?? fixturePath,
    },
    maxBuffer: 10 * 1024 * 1024,
  })

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    command: `opencode-context ${args.map(quoteArgument).join(" ")}`,
  }
}

export function runDbSuccessfully(sql, options = {}) {
  const result = runDb(sql, options)

  if (result.status !== 0) {
    throw new Error(
      `${result.command} failed with status ${result.status}\n${result.stderr || result.stdout}`,
    )
  }

  return result.stdout.trimEnd()
}

export function runDbJson(sql, options = {}) {
  const output = runDbSuccessfully(sql, { ...options, args: ["--format", "compact", ...(options.args ?? [])] })

  try {
    return JSON.parse(output)
  } catch (error) {
    throw new Error(`opencode-context db returned invalid compact JSON:\n${output}`, {
      cause: error,
    })
  }
}

function quoteArgument(value) {
  return JSON.stringify(value)
}
