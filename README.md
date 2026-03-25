# Mapping Tool — Collaborative Markdown Sticky Generator

A real-time collaborative sticky board that writes every note as a Markdown file
to `context_files/` — ready for your Cursor agent to watch and act on.

## Stack

| Layer       | Tech                              |
| ----------- | --------------------------------- |
| Server      | Node.js + Express + Socket.io     |
| Type Safety | TypeScript (shared interfaces)    |
| Persistence | `fs.writeFileSync` → `.md` files  |
| Real-time   | Socket.io (sub-100ms broadcast)   |
| Frontend    | Vanilla HTML + JS (no build step) |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run in dev mode (ts-node, no compile step needed)
npm run dev

# 3. Open the board
open http://localhost:3000
```

> **Production build:**
> ```bash
> npm run build && npm start
> ```

## Project Structure

```
/mapping-tool
  /context_files/     ← Cursor points here (gitignored)
  /src
    types.ts          ← Shared Note + Socket.io interfaces
    server.ts         ← Express + Socket.io + fs writer + fs watcher
  /public
    index.html        ← The sticky board UI (no build needed)
  package.json
  tsconfig.json
```

## File Format

Every posted note is saved as:

**Filename:** `2024-01-15T10:30:00.000Z_Alice_Question.md`

**Content:**
```markdown
---
Author: Alice
Type: Question
Time: 2024-01-15T10:30:00.000Z
---
# Question
Should we validate the schema before or after the DB write?
```

## Note Types & Colours

| Type     | Colour   | Intent                           |
| -------- | -------- | -------------------------------- |
| Story    | Yellow   | User stories / narrative context |
| Rule     | Blue     | Constraints / business rules     |
| Example  | Green    | Concrete examples / test cases   |
| Question | Red      | Open questions / blockers       |

## Cursor Agent Workflow

1. Open Cursor and add `context_files/` to your chat context.
2. Tell the agent:

   > *"Monitor `context_files/`. When a new **Question** (red) note appears,
   > check it against `schema.ts` and either suggest an implementation
   > or flag a conflict."*

3. As your team posts red cards in the browser, `.md` files appear in your IDE
   in real-time. The agent responds immediately.

## Sharing with Teammates

The server proxies to the internet via [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/), which makes an outbound HTTPS connection on port 443 — compatible with Netskope. Socket.io WebSocket traffic is carried through the same tunnel automatically.

**One-time setup:**

```bash
brew install cloudflare/cloudflare/cloudflared
```

**Each session — two terminals:**

```bash
# Terminal 1 — start the server
npm run dev

# Terminal 2 — open the tunnel
npm run share
```

`cloudflared` prints a public URL like `https://random-words.trycloudflare.com`. Send that to your teammates — they open it in a browser and are live on your board. The `share` script auto-detects the Netskope CA cert at the standard macOS path and passes it to `cloudflared` if present.

> **Custom port:** `PORT=8080 npm run share`

## Keyboard Shortcuts

| Shortcut                 | Action    |
| ------------------------ | --------- |
| `Ctrl+Enter` / `⌘+Enter` | Post note |

## Ports & Config

| Variable    | Default                          |
| ----------- | -------------------------------- |
| `PORT`      | `3000`                           |
| Context dir | `./context_files` (auto-created) |
| Public dir  | `./public`                       |

Override port: `PORT=8080 npm run dev`
