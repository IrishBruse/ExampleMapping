# Sticky note file schema

Notes are **Markdown** (`.md`) or **Gherkin** (`.feature`) files on disk. The server reads and writes them under the **context directory**: path from the `MAPPING_OUTPUT_DIR` environment variable (relative to the project root; default `./context_files`).

## Layout on disk

- **Root:** Only subfolders are scanned. Files placed directly under the context root are **ignored** (with a console warning).
- **Per-author folder:** Name is a **sanitized display name**: `safeUsername(author)` — non-alphanumeric characters become `_`, lowercased, max 32 chars (see `safeUsername` in `src/server.ts`).
- **Filename:** `<Type>_<n>.<ext>`
  - **`<Type>`:** One of `Story`, `Rule`, `Example`, `Question`, `Feature` (must match `NoteType` in `src/types.ts`).
  - **`<n>`:** Positive integer; the server tracks per-type counters and assigns the next id (e.g. `Story_4`).
  - **`<ext>`:** `.md` for all types except **Feature**, which uses `.feature`.
- **Relative path** stored in the in-memory `Note` (field `relPath`): `"<authorFolder>/<Type>_<n>.md"` or `".feature"`.

Example: `alice/Story_3.md`, `bob/Feature_1.feature`.

## File encoding

UTF-8. The parser accepts `\n` or `\r\n` after the opening `---` frontmatter delimiter.

## Frontmatter (YAML-like, required)

Every note file must begin with:

```text
---
<lines>
---
<body>
```

Required **lines** inside the block (each matched with `^Key:\s*(.+)$` per line):

| Field    | Description |
|----------|-------------|
| `Author` | Free-text author label. |
| `Type`   | One of: `Story`, `Rule`, `Example`, `Question`, `Feature`. |
| `ID`     | Must match the filename id, e.g. `Story_3`. |
| `Time`   | ISO 8601 timestamp string (as written by the server). |

Optional lines:

| Field     | When | Description |
|-----------|------|-------------|
| `Source`  | Optional | If `ai` (case-insensitive), the note is treated as AI-generated (`isAi: true`). |
| `Rules`   | **Example** notes | Comma-separated rule ids, e.g. `Rules: Rule_1, Rule_2`. Parsed into `note.ruleIds`. |
| `Examples`| **Rule** notes | Comma-separated example ids — **maintained by the server** when examples change; not parsed into the `Note` object on load (examples are derived from Example notes that link to the rule). |

When serializing, the server may omit empty optional sections. Example notes always get a `Rules:` line when saved.

## Body format by type

### Feature (`Type: Feature`, file ends with `.feature`)

- After the closing `---`, the **entire remainder** of the file is the note `content` (trailing whitespace trimmed). **No** leading `#` heading is required or emitted by `buildFeatureFile`.
- Frontmatter is the same block as other types, but the body is raw Gherkin/text suitable for Cucumber-style tools.

### Story, Example, Question, Rule (`.md`)

- After frontmatter, the body **must** start with a **Markdown H1** line: `# <title>` followed by a newline, then the note text. The parser uses: `^#\s*.+\n([\s\S]+)` and takes **everything after that first line** as `content` (trimmed).
- **Title line when the app writes the file** (`buildMarkdown`):
  - **Question:** `# <ID>` (e.g. `# Question_2`) — the visible heading is the note id.
  - **All other `.md` types (Story, Example, Rule):** `# <Type>` (e.g. `# Story`, `# Rule`).

### Rule

- On **read**, any legacy section matching `\n## Examples[\s\S]*$` is **stripped** from the body (`stripRuleExamplesSectionFromBody`). Current on-disk rules do not embed example bodies; linking is via frontmatter `Examples:` and separate Example files.

### Question — question vs answer in `content`

The stored `content` field is **markdown after the H1 line**, but **Question** notes may append a private answer using a fixed HTML comment separator (see `client/src/questionContent.ts`):

```text

<!-- example-mapping:answer -->

```

- **Question text** = everything before that marker (trimmed).
- **Answer** = everything after the marker (trimmed).
- If the marker is absent, the whole body is the question and the answer is empty.
- Rendering tools should treat the marker as non-displaying in normal Markdown.

## Validation summary

- Missing or unparseable frontmatter → file skipped (optional logging with `MAPPING_LOG_SKIPPED_NOTES=1`).
- Non-`.md`/`.feature` files in author folders are ignored.
- `Type` must be a valid `NoteType`.
- For non-Feature types, missing `# …` line or empty body after the title → parse failure.

## In-memory model (`Note`)

See `src/types.ts`:

- `id`, `author`, `type`, `content`, `timestamp`, `relPath` — always present when loaded successfully.
- `isAi` — optional, from `Source: ai`.
- `ruleIds` — optional, only for **Example**, from `Rules:` in frontmatter.

## Related code

| Concern | Location |
|---------|----------|
| Write templates | `buildMarkdown`, `buildFeatureFile`, `buildRuleMarkdown` in `src/server.ts` |
| Parse | `parseNoteFileResult` in `src/server.ts` |
| Question answer split | `mergeQuestionContent` / `splitQuestionContent` in `client/src/questionContent.ts` |
