# Token-efficient OpenCode context queries

## Intent

Agents need to investigate prior OpenCode conversations without loading entire
sessions into model context. OpenCode's raw database records contain useful
conversation text alongside repeated identifiers, JSON wrappers, lifecycle
records, accounting data, and other metadata.

The `opencode-context db` command gives the agent arbitrary read-only SQL instead of a
fixed search language. The agent can start with cheap discovery queries, inspect
small matching excerpts, and selectively expand only promising context. Results
are compact, faithful to the query, and bounded across the complete response.

## Definitions

**Arbitrary read-only SQL:** A query chosen by the agent that observes database
schema or records but cannot change database contents, schema, attached
databases, or connection-persistent state.

**Compact table:** A lossless representation of arbitrary query results that
emits column names once, preserves SQLite value types, and preserves requested
row and column order.

**Conversation rendering:** The default representation of recognizable selected
conversation rows that retains speaker boundaries and message text while
omitting fields not selected for that view.

**Response budget:** A limit applied to the complete tool response, including
all rows, values, formatting, and truncation metadata.

**Progressive retrieval:** A sequence of small queries in which identifiers and
terms discovered in one result can be used to request more precise context in a
later result.

## Scope

The public boundary covered by this specification is the `opencode-context db` command.
It includes schema inspection, arbitrary read-only SQL, compact tabular output,
explicit conversation rendering, response-wide limits, and follow-up queries.

The default output renders a unique string `text` column as Markdown, recognizing
optional user/assistant `role` values and retaining extra columns as metadata.
Other query shapes use compact tables. `--raw` explicitly returns JSON row
objects; `--format compact` forces compact tables. `db schema` emits table names
and column names/types rather than raw DDL; query `sqlite_schema.sql` for full
constraints and indexes. The command may use schema guidance supplied by a skill or CLI
help, but it does not prescribe an agent's search sequence.

The verification fixture contains only selected local conversation records.
Tests that attempt mutation operate on a disposable copy. The live OpenCode
database is never a test target.

Semantic search, embeddings, generated summaries, automatic query planning,
and a fixed conversation-search language are excluded. Internal SQL parsing,
database adapters, and serialization components are implementation choices and
are not core-test boundaries.

## Rules

### Supports agent-chosen reads

The command executes agent-selected read-only SQL, including projections,
aliases, JSON extraction, joins, aggregates, filters, and ordering, without
restricting the agent to predefined search operations.

Examples:

- An agent can count user and assistant messages without retrieving their text.
- An agent can join messages to sessions and return only a title and excerpt.

### Supports progressive retrieval

Compact query results retain the identifiers and values needed to refine a
search and selectively expand a relevant passage in a later query.

Examples:

- A broad text match returns a session ID and message ID rather than its full session.
- A later query uses that message ID to retrieve a chronological context window.

### Returns faithful token-efficient output

Compact tables preserve selected values, SQLite types, aliases, and ordering.
Automatic conversation rendering preserves message text and speaker boundaries
while omitting unrequested raw-record metadata, and uses fewer tokens than the
equivalent raw JSON database response under the test suite's pinned tokenizer.

Examples:

- Multiline text, quotes, and code remain unchanged in a rendered transcript.
- Numeric values and numeric-looking strings remain distinguishable in a compact table.

### Bounds the complete response

The response budget applies to the complete result rather than independently to
each row. Omitted rows and clipped values are explicitly reported, and the
result retains enough information for a narrower follow-up query.

Every format defaults to 12,000 characters including the CLI newline; callers
may choose 300–100,000 characters. Retrieval consumes rows incrementally and
stops when the response fills. Omitted-row counts are explicitly lower bounds
when the unread remainder has not been counted. Zero-based clipped-cell
coordinates identify values that need a narrower follow-up query. This bounds
retained result rows, not SQLite's internal query execution or individual value
allocations. The CLI's `db schema` helper and bundled `opencode-context` skill
guide schema discovery and progressive queries without prescribing search SQL.

Examples:

- Many individually small matches cannot multiply into an unbounded response.
- One oversized message is clipped with an explicit marker rather than silently cut.

### Enforces read-only access

No command input can mutate the source database or its schema. Rejected input
does not prevent subsequent valid reads.

Examples:

- Data modification and schema modification statements are rejected.
- Multiple statements cannot hide a write after a valid read.

## Core scenarios

### Finds and expands only relevant conversation context

Rule: #supports-progressive-retrieval
Requirement: An agent can locate a relevant passage cheaply and expand only that passage in a later query.
Experiment: Configure `opencode-context db` to use the isolated conversation fixture. Query schema and text records for a distinctive passage, requesting short excerpts and stable identifiers. Use one returned identifier in a second command invocation to retrieve a small chronological message window around the match.
Expected: The first response identifies the correct passage and source without returning either complete session. The second response contains the selected surrounding messages in source order and excludes distant conversation content.
Rejects: A command that dumps matching sessions, removes the identifiers needed for refinement, or returns an incorrectly ordered context window.

### Executes custom relational and JSON queries faithfully

Rule: #supports-agent-chosen-reads
Requirement: Agents can express useful database reads beyond predefined search filters.
Experiment: Through `opencode-context db`, run fixture queries that join conversation records, extract JSON-backed values, aggregate role counts, and select custom aliases with filters and ordering. Compare results to independently fixed expectations derived from the fixture.
Expected: Every query succeeds and returns the expected rows with selected aliases, SQLite value types, column order, and row order preserved.
Rejects: A canned search interface, a serializer that loses types or aliases, or a query layer that silently changes requested ordering.

### Renders selected conversation text with fewer tokens

Rule: #returns-faithful-token-efficient-output
Requirement: Default conversation rendering removes raw-record overhead without rewriting selected conversation content.
Experiment: Select fixture messages containing multiline prose, quotes, and code using the default output. Compare the rendered speakers and text with the source values, assert that unrequested metadata is absent, and compare its pinned-tokenizer count with the equivalent --raw JSON database response.
Expected: Speaker boundaries and source text are exact, unrequested identifiers, accounting, reasoning, and tool payloads are absent, and the rendered response uses fewer tokens than raw JSON.
Rejects: A renamed JSON dump, prose that rewrites source text, missing message content, or formatting whose token count is not lower than the raw baseline.

### Limits oversized results and reports how to continue

Rule: #bounds-the-complete-response
Requirement: Broad reads cannot unexpectedly consume unbounded model context.
Experiment: Through `opencode-context db`, query a disposable fixture containing enough rows to exceed the response budget and one text value larger than the per-value allowance. Inspect the complete serialized response, then issue a narrower follow-up query using information retained in the truncated result.
Expected: The complete response stays within its configured budget, distinguishes omitted rows from clipped values, and enables the follow-up query to retrieve specifically omitted content.
Rejects: Per-row limits that permit an oversized total response, silent omission, malformed clipping, or truncation that leaves no practical refinement path.

### Rejects every attempted database mutation

Rule: #enforces-read-only-access
Requirement: Arbitrary SQL access never grants database write capability.
Experiment: Invoke `opencode-context db` against a disposable fixture with data writes, schema writes, write-capable pragmas, attachment or extension mechanisms, and multiple statements that combine a read with a write. After every attempt, inspect the fixture through an independent read-only connection and run a valid read through the command.
Expected: Every unsafe input fails, fixture schema and records remain byte-for-byte logically unchanged, and valid reads continue to return the original data.
Rejects: Prefix-only validation, partial execution before rejection, a nominally read-only command backed by a writable connection, or failure that corrupts subsequent reads.
