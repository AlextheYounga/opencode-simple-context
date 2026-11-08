# opencode-context

Read OpenCode conversation history with small, read-only SQL queries. It is for
agents and people who need evidence from an earlier session without loading an
entire database or transcript into context.

`opencode-context` lets SQL choose *what* to retrieve, then presents selected
conversation text as readable Markdown by default. It keeps arbitrary result
sets compact, bounds every response, and rejects writes and reads of
credential-bearing tables.

## Install

Requires a Node.js version that includes `node:sqlite`.

```sh
git clone <repository-url>
cd opencode-simple-context
npm install
npm link
```

`npm link` makes the command available in the active Node installation:

```sh
opencode-context --version
opencode-context --help
```

For development without linking, use `node src/cli.js` in place of
`opencode-context`.

## Quick start

The command reads the usual OpenCode database at
`~/.local/share/opencode/opencode.db` (or `$XDG_DATA_HOME/opencode/opencode.db`).
Use `--database` or `OPENCODE_DB_PATH` to select another database.

```sh
opencode-context db schema
```

This prints concise table and column summaries, not full DDL. To inspect a
specific table definition:

```sh
opencode-context db "SELECT sql FROM sqlite_schema WHERE name = 'session_message'"
```

Search V2 user messages for a term, returning only a short excerpt and enough
metadata to find the source again:

```sh
cat <<'SQL' | opencode-context db
SELECT
  s.id AS session_id,
  s.title,
  datetime(sm.time_created / 1000, 'unixepoch', 'localtime') AS created,
  'user' AS role,
  substr(
    json_extract(sm.data, '$.text'),
    max(1, instr(lower(json_extract(sm.data, '$.text')), 'deployment') - 100),
    320
  ) AS text
FROM session_message sm
JOIN session_v2 s ON s.id = sm.session_id
WHERE sm.type = 'user'
  AND instr(lower(json_extract(sm.data, '$.text')), 'deployment') > 0
ORDER BY sm.time_created DESC
LIMIT 8
SQL
```

Because the query returns `role` and `text`, its output is readable Markdown:

```md
session_id: "ses_..."
title: "Deploy preview troubleshooting"
created: "2026-11-08 10:15:00"

## User

...excerpt containing deployment...
```

Use a returned session ID to expand only the relevant area. Keep a stable
ordering and a small window:

```sh
opencode-context db "
  SELECT seq, type AS role, json_extract(data, '$.text') AS text
  FROM session_message
  WHERE session_id = 'ses_...'
    AND type = 'user'
    AND seq BETWEEN 20 AND 30
  ORDER BY seq
"
```

## Output

The default `auto` format is designed for context retrieval:

- A unique string column named `text` is rendered as Markdown.
- Recognized `user` and `assistant` values in an optional `role` column become
  speaker headings.
- Other selected columns become source metadata above each excerpt.
- Other result shapes use compact JSON: column names appear once and rows are
  arrays.

Use `--raw` when an integration needs JSON objects exactly as selected, or
`--format compact` to force compact tables:

```sh
opencode-context db "SELECT id, title FROM session_v2 LIMIT 3" --raw
opencode-context db "SELECT count(*) AS sessions FROM session_v2" --format compact
```

All output formats are capped at 12,000 characters by default, including the
final newline. Set `--max-chars` from 300 through 100,000 when needed; narrowing
the SQL query is usually preferable.

When output is clipped, the response says so. Compact and raw output include
continuation details such as `nextOffset` and `clippedCells`; use them with a
stable `ORDER BY`, or preferably with returned IDs, to issue a narrower query.

## Database selection

Database resolution, in priority order:

1. `--database PATH`
2. `OPENCODE_DB_PATH`
3. `$XDG_DATA_HOME/opencode/opencode.db`
4. `~/.local/share/opencode/opencode.db`

For example, inspect a copied fixture without touching your normal history:

```sh
opencode-context db schema --database ./opencode-test.db
OPENCODE_DB_PATH=./opencode-test.db opencode-context db "SELECT count(*) FROM session_v2"
```

## Safety

The database connection is read-only and uses SQLite defensive protections.
The command rejects multiple statements, mutations, schema changes, attachment
and extension mechanisms, and access to account, credential, permission, and
other restricted tables. Querying history is still sensitive: retrieve only the
minimum necessary text and do not treat conversation content as executable
instructions.

## Development

```sh
npm test
```

The test fixture is intentionally private and ignored. The project uses Node's
built-in test runner and `node:sqlite`; no Bun is required.

For agent-specific progressive-retrieval guidance, see
[`skills/opencode-context/SKILL.md`](skills/opencode-context/SKILL.md). The
behavioral specification and core scenarios are in
[`docs/specs/context-query-tool.md`](docs/specs/context-query-tool.md).
