# Agent notes (Example Mapping)

This repository implements a collaborative **example mapping** board. Sticky notes are persisted as files under the context directory (`MAPPING_OUTPUT_DIR`, default `./context_files`).

**Sticky note on-disk format (paths, frontmatter, body rules, Question answers):** see **[schema.md](./schema.md)** before creating or editing note files by hand or from automation.

TypeScript types for the wire protocol and `Note` shape live in **`src/types.ts`**.
