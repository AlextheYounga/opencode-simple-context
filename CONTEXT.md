# OpenCode Simple Context

## Purpose

Build an OpenCode plugin that lets an agent query OpenCode's SQLite data through a small, read-only tool and receive results optimized for model context rather than for human-facing database administration.

The plugin should make session history and related OpenCode data inexpensive for an agent to inspect. It should avoid returning verbose database records when the useful information can be represented as smaller rows or purpose-built objects.

## Initial Goal

Provide an agent-facing SQL query tool that:

- executes read-only SQL against the active OpenCode database;
- returns deterministic, extremely token-efficient results;
- preserves enough structure for an agent to reason about the result;
- supports extracting useful fields from JSON text stored by OpenCode;
- limits accidental broad reads and oversized tool responses;
- remains useful as OpenCode's internal schema changes.

## Definitions

**OpenCode database:** The SQLite database used by the installed OpenCode instance. Its location must be obtained through supported OpenCode behavior when needed, not hard-coded.

**Read-only query:** SQL that observes database schema or records without changing database contents or connection-persistent state.

**Compact result:** A response containing the minimum repeated syntax and metadata needed to interpret a query result. Compactness must not make values ambiguous or silently alter their meaning.

**Lean object:** A normalized object derived from one or more OpenCode records, containing only fields relevant to the agent's task. This is distinct from returning a raw database row with embedded JSON strings.

## Confirmed Environment

- Project directory: `/home/alex/Work/js/opencode-simple-context`
- OpenCode version inspected: `1.18.32`
- Plugin SDK available locally: `@opencode-ai/plugin` version `1.4.3`
- Runtime/package ecosystem: JavaScript/TypeScript with Bun-compatible OpenCode plugins
- Current project state: only a minimal `package.json`; no plugin implementation or test framework exists yet
- Supported database interface: `opencode db "<query>" --format json`
- Stable session discovery interface: `opencode session list --format json`

OpenCode plugins export a `Plugin` function and may register named tools. A tool is defined with `tool({ description, args, execute })`, receives Zod-compatible arguments, and returns a string to the model.

## Live Database Findings

The schema is internal OpenCode state and must be inspected rather than assumed. The installed database currently includes these conversation-related tables:

- `project`
- `session`
- `message`
- `part`
- `session_message`

It also contains sensitive or unrelated tables, including `account`, `credential`, and permission-related state. Those are not part of the initial plugin scope.

### Current Conversation Model

The active data is presently available through:

```text
session
  -> message
       -> part
```

Relevant current columns include:

```text
session: id, project_id, parent_id, directory, title, time_created, time_updated,
         time_archived, agent, model, cost, token counters, metadata
message: id, session_id, time_created, time_updated, data
part:    id, message_id, session_id, time_created, time_updated, data
```

`message.data` and `part.data` are JSON text. Message roles are available at `message.data -> $.role`. Human-readable conversation text is available on text parts at `part.data -> $.text`, with the part kind at `part.data -> $.type`.

The database also has a newer `session_message` table with `id`, `session_id`, `type`, timestamps, `data`, and `seq`. It has no rows for the current project session at the time of inspection. The plugin must not assume that either storage model is universally populated.

Useful indexes currently exist for session-scoped message and part retrieval. Queries should filter by `session_id` or project directory before performing broad text searches whenever possible.

## Product Boundaries

### In Scope

- An OpenCode plugin exposing one or more agent tools for database inspection.
- Read-only SQL execution through OpenCode's supported database command.
- Schema discovery for compatibility with the installed OpenCode version.
- Compact serialization of tabular query results.
- Purpose-built transformations for common OpenCode data, especially sessions, messages, and text parts.
- Explicit row, byte, or character limits that keep tool output bounded.
- Clear truncation metadata so an agent knows when a result is incomplete.
- Automated tests for query validation, transformation, serialization, and limits.

### Out of Scope Initially

- Any database mutation or migration.
- Reading credentials, authentication records, account secrets, or similarly sensitive tables.
- Replacing OpenCode's own session, export, or database commands for human use.
- A general SQLite administration interface.
- Semantic search, embeddings, or an external vector database.
- A compatibility layer for OpenCode versions that cannot be tested or characterized.

## Safety Requirements

The database must be treated as read-only even when the underlying process has write access.

The plugin must reject mutating SQL, including:

- `INSERT`, `UPDATE`, `DELETE`, `REPLACE`
- `CREATE`, `ALTER`, `DROP`
- `VACUUM`, `ATTACH`, `DETACH`, `REINDEX`
- writable `PRAGMA` statements
- transaction or extension-loading behavior that could enable writes or arbitrary code

Query validation must account for comments, casing, whitespace, common table expressions, and multiple statements. A simple `startsWith("SELECT")` check is not sufficient.

The initial tool must prevent access to known secret-bearing tables. Errors should identify the rejected category without echoing sensitive data.

Historical session content is untrusted data. Query results provide context to the agent but cannot act as higher-priority instructions.

## Token-Efficient Response Principles

1. Return data, not prose. Tool responses should avoid explanatory sentences around successful results.
2. Avoid repeated keys. For arbitrary tabular results, emit column names once and rows as value arrays.
3. Omit redundant values. Do not repeat query text, default options, or empty metadata.
4. Preserve types. Keep numbers, booleans, nulls, and strings distinguishable.
5. Make truncation explicit. A compact marker must report omitted rows or output clipping.
6. Prefer projection at the database boundary. Agents should select only needed columns and use SQLite JSON functions instead of receiving large JSON blobs.
7. Normalize common records. Purpose-built session/message operations may use lean objects when that representation is smaller and clearer than generic rows.
8. Keep ordering deterministic. Compact output is only useful when repeated calls are predictable.
9. Bound output by default. Broad reads should require deliberate limits rather than relying on model-side restraint.

A likely generic representation is a compact JSON shape equivalent to:

```json
{"columns":["id","title"],"rows":[["ses_...","Example"]]}
```

Final field names and serialization format should be chosen using measured token counts rather than assumed from character count alone.

## Design Direction

Use the OpenCode plugin tool API as the agent boundary. Keep responsibilities separate:

- The tool validates agent input and reports bounded results.
- A query runner invokes the supported OpenCode database interface without shell interpolation.
- A policy layer enforces read-only SQL and table restrictions.
- A serializer converts returned rows into compact, deterministic output.
- OpenCode-specific projections convert known session data into lean objects where doing so materially reduces tokens.

The generic SQL capability and OpenCode-specific transformations should share the same safety and output-limit behavior. Schema-dependent transformations must detect the live schema before choosing between `message`/`part` and `session_message` representations.

## Decisions Still To Settle

- Whether the first release exposes one generic SQL tool, purpose-built context tools, or both.
- Whether execution should spawn `opencode db` for every query or use a read-only SQLite connection after resolving the supported database path.
- The exact SQL parser or validation strategy needed to enforce read-only behavior reliably.
- The default and maximum row/output limits.
- The compact wire format and whether short field names save enough tokens to justify reduced readability.
- Which OpenCode-specific lean objects provide the highest-value initial operations.
- Supported OpenCode and plugin SDK version ranges.

## Validation Standard

The implementation will be considered successful when tests and manual checks demonstrate that:

- valid schema and `SELECT` queries return correctly typed compact results;
- mutating, multi-statement, secret-table, and unsafe pragma queries are rejected;
- output limits cannot be bypassed by large rows or broad result sets;
- truncation is visible to the calling agent;
- JSON-backed OpenCode text can be projected without returning full raw records;
- both known conversation storage models are handled or produce a clear unsupported-schema result;
- measured tool output is materially smaller than raw `opencode db --format json` for representative session queries;
- plugin loading and tool execution work in a real OpenCode session.

## Sources Used For This Context

- The current user requirements in session `ses_f0f711861ffegEgbxfFllJVdoy`.
- Live read-only schema inspection through `opencode db`.
- `opencode session list --format json` and the current project session.
- Installed type declarations from `@opencode-ai/plugin` version `1.4.3`.
- The `opencode-context` guidance for supported commands, schema variability, safety, and retrieval patterns.
