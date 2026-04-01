# Rules

1. Write all plans to `docs/` before implementing anything
2. Always verify changes with commands before finishing
3. Run `npm run build` after modifying server TypeScript to check for compilation errors
4. Run `npm run build:client` after modifying client code to check for compilation errors

# Project Overview

Collaborative Markdown sticky-note tool. Server: Express + Socket.io (TypeScript, CommonJS). Client: React 18 + Vite (TypeScript, ESM). Notes are persisted as Markdown files with YAML frontmatter under `example-mapping/`.

# Build & Run Commands

| Command                | Description                                                   |
| ---------------------- | ------------------------------------------------------------- |
| `npm run build`        | Full build (server via tsc + client via Vite)                 |
| `npm run build:server` | Compile server TypeScript only (`tsc`)                        |
| `npm run build:client` | Build client (`cd client && npm run build`)                   |
| `npm run dev`          | Build client then start server with `tsx watch` (auto-reload) |
| `npm run start`        | Run compiled server from `dist/cli.js`                        |
| `npm run kill-port`    | Kill process on port 3000 (helper script)                     |

Client dev server (separate): `cd client && npm run dev` (Vite on port 5173, proxies `/socket.io` to 3000).

There is **no test framework or linter configured** in this project. Verify changes by running `npm run build` (server) and `npm run build:client` (client) to catch TypeScript errors.

# Style

- Only use JSDoc doc comments (`/** ... */`). Never add inline or block comments that are not documentation.
- Never use `_` in variable names.
- No emojis in code or comments.
- Use 4-space indentation (spaces, not tabs).
- Use LF line endings, UTF-8 charset.
- Use double quotes for strings.
- Prefer `import type { ... }` for type-only imports.
- Always annotate explicit return types on exported functions (e.g., `void`, `string[] | null`).
- Use `camelCase` for variables and functions, `PascalCase` for types/interfaces/classes.
- Export interfaces and types from `src/types.ts` (server) and `client/src/types.ts` (client).
- Error handling: use `try/catch` around filesystem and network operations; convert errors to typed results or emit structured error events to clients (never throw uncaught).
- Server uses CommonJS modules (`require`/`module.exports`); client uses ESM (`import`/`export`).
- Target: ES2020. Strict mode is enabled in both tsconfig files.
- Client tsconfig also enforces `noUnusedLocals` and `noUnusedParameters` — remove dead code promptly.

# Key Files

- `src/server.ts` — Express app, Socket.io event handlers, note persistence logic
- `src/cli.ts` — CLI entry point, argument parsing, relay tunnel startup
- `src/types.ts` — Shared TypeScript interfaces (Note, Socket events, etc.)
- `src/relayTunnel.ts` — WebSocket relay for AWS API Gateway
- `client/src/App.tsx` — React root component, socket event wiring
- `client/src/components/` — React components (Board, Sidebar, NoteCard, Header, etc.)
- `example-mapping/` — Default output directory for Markdown notes

# Architecture Notes

- Socket.io event contracts are defined in `src/types.ts` as `ServerToClientEvents` and `ClientToServerEvents`. Keep these in sync when adding new events.
- Server emits structured error events via `socket.emit("note_error", { message })`. Never throw uncaught exceptions from socket handlers.
- Notes use typed discriminators (`NoteType` union) and the server maintains an in-memory `Map<string, Note>` index synced with disk.
- Client re-exports server types via `client/src/types.ts` to avoid duplication.
- Component props are defined as inline interfaces above the component function (e.g., `interface BoardProps`).
- Use `useMemo`/`useCallback` for derived state; use `useRef` for mutable values that do not trigger re-renders.

# Error Handling Patterns

- Server: wrap all `fs.*` and network calls in `try/catch`. On failure in socket handlers, emit `socket.emit("note_error", { message: "..." })` and return — never throw.
- Use typed discriminated unions for results: e.g. `type ParseNoteResult = { ok: true; note: Note } | { ok: false; reason: string }`.
- Client: use `socket.on("note_error", ...)` to display server-side validation failures to the user.
- Relay tunnel: catch errors in `forward()` and return a 502 response body with the error message as JSON.

# Component Patterns

- Define props as an inline `interface` directly above the component function.
- Prefer named exports wrapped in `export default` for each component file.
- Use `useMemo` for expensive derivations from state (e.g. filtering notes by type).
- Use `useCallback` for event handler props passed to child components.
- Use `useRef` for mutable DOM references and values that should not trigger re-renders.
- Modals use `createPortal(..., document.body)` for overlay rendering.

# Server Notes

- The server maintains a `noteIndex: Map<string, Note>` that is kept in sync with disk via `fullResyncNotesFromDisk()`.
- Notes are written to disk as `.md` files with YAML frontmatter (Author, Type, ID, Time, Source, Rules/Examples).
- The server uses `fs.watch()` with a 350ms debounce to detect external changes to `example-mapping/`.
- Edit locks are managed in memory (`noteEditLocks: Map<string, string>`) — one editor per note at a time.
