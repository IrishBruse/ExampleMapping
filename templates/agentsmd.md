## How this folder works

This is a collaborative Example Mapping tool. Users create sticky notes from a
browser UI. The notes are persisted as Markdown files inside this directory.

### File layout

```
context_files/
  AGENTS.md              ← this file (auto-generated)
  agent/                 ← reserved for agent-generated files (.feature, .md, .txt, etc.)
  <username>/
    Story_1.md
    Rule_1.md
    Example_1.md
    Question_1.md
```

Each note lives under a **user subfolder** whose name is the sanitized username
(lowercase, alphanumeric, `_`, `-`, max 32 chars). Files placed directly in
the `context_files/` root are **ignored** by the server.

### Synchronization

The server watches `context_files/` recursively with `fs.watch()`. When any
file is created, modified, or deleted, the server debounces for 350 ms then
runs a full resync:

1. Every `.md` file in every user subfolder is parsed.
2. The in-memory note index is reconciled with what is on disk.
3. Connected browser clients receive real-time `note_added`, `note_updated`,
   or `note_removed` Socket.io events.

This means an external agent **can** add, edit, or delete note files directly
on disk. The server will detect the change and push updates to all clients
within a few hundred milliseconds.

### ID counters

The server maintains a per-type counter (e.g. Story: 3, Rule: 5, ...).
It scans disk at startup and bumps counters whenever it sees a higher number.
New notes always get the **next** number: `Story_4`, `Rule_6`, etc.

**Important:** If you create a note file, you must choose an ID whose numeric
suffix is greater than the current maximum for that type (see Current Notes
below), or exactly the next sequential number. Reusing an existing ID will
**overwrite** that note on the next resync.

---

## Note Format

Every note file must have YAML frontmatter between `---` fences followed by a
markdown body that starts with an H1 heading.

### Common frontmatter fields

| Field    | Required     | Description                                                                    |
| -------- | ------------ | ------------------------------------------------------------------------------ |
| Author   | yes          | Username of the note creator                                                   |
| Type     | yes          | One of: `Story`, `Rule`, `Example`, `Question`                                 |
| ID       | yes          | `<Type>_<N>` — must be unique across all users                                 |
| Time     | yes          | ISO 8601 timestamp                                                             |
| Rules    | Example only | Comma-separated Rule IDs this example illustrates                              |
| Examples | Rule only    | Comma-separated Example IDs that illustrate this rule (auto-updated by server) |

### Story

```markdown
{{STORY_TEMPLATE}}
```

### Rule

```markdown
{{RULE_TEMPLATE}}
```

The `Examples` field is **auto-managed by the server**. When you create or edit
an Example that links to a Rule, the server rewrites the Rule file to keep the
Examples list in sync. Do not manually edit the Examples field on Rule files —
it will be overwritten.

### Example

```markdown
{{EXAMPLE_TEMPLATE}}
```

The `Rules` field is **required**. An Example must link to at least one Rule.
If the linked Rule is deleted, the Example is deleted too.

### Question

```markdown
{{QUESTION_TEMPLATE}}
```

---

## Agent Permissions and Workflow

### What an agent can do

- **Create notes** — Write a `.md` file into any user subfolder (e.g.
  `context_files/agent/Story_5.md`). Use `agent` as the Author and
  subfolder name for notes you create. The file must follow the templates
  above. The server will pick it up on the next resync.

- **Edit notes** — Read the file, modify the body text (after the H1 line),
  and write it back. Keep the frontmatter intact. Do **not** change the ID
  field — it is the primary key.

- **Delete notes** — Remove the `.md` file. If you delete a Rule, the server
  will also delete any Examples that only referenced that rule.

- **Write agent files** — Place `.feature` or `.md` or similar text files in `context_files/agent/`.
  These files are broadcast to connected clients but are **not** treated as
  notes. Max file size: 512 KB.

### What to avoid

- Do **not** place `.md` files directly in `context_files/` root — only
  subdirectories are scanned for notes.
- Do **not** reuse an existing note ID. Each `<Type>_<N>` must be unique.
- Do **not** change the Author or ID fields when editing an existing note.
- Do **not** edit the `Examples` field in Rule frontmatter — it is managed
  by the server. Edit the `Rules` field in Example files instead.
- Do **not** delete the `agent/` directory — it is watched by the server.

