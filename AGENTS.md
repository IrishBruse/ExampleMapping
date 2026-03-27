# Agent notes (Example Mapping)

This repository implements a collaborative **example mapping** board. Sticky notes are persisted as files under the configured context directory.

**Sticky note on-disk format (paths, frontmatter, body rules, Question answers):** see **[schema.md](./schema.md)** before creating or editing note files by hand or from automation.

Shared TypeScript types for the wire protocol and `Note` shape live in **`src/types.ts`**.
