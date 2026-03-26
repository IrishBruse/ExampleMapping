// src/server.ts — Express + Socket.io + fs writer + fs watcher

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import * as fs from "fs";
import * as path from "path";
import type {
    Note,
    NoteType,
    TypeCounters,
    ServerToClientEvents,
    ClientToServerEvents,
} from "./types";

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.resolve(__dirname, "../client/dist");

function loadConfig(): { outputDir: string; accessToken?: string } {
    const configPath = path.resolve(__dirname, "../config.json");
    const defaults = { outputDir: "./context_files" };
    try {
        const raw = fs.readFileSync(configPath, "utf-8");
        return { ...defaults, ...JSON.parse(raw) };
    } catch {
        console.log("Warning: No config.json found, using defaults");
        return defaults;
    }
}

const config = loadConfig();
const CONTEXT_DIR = path.resolve(__dirname, "..", config.outputDir);

const NOTE_TYPES: NoteType[] = ["Story", "Rule", "Example", "Question"];

if (!fs.existsSync(CONTEXT_DIR)) {
    fs.mkdirSync(CONTEXT_DIR, { recursive: true });
    console.log(`Created context_files/ at ${CONTEXT_DIR}`);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function parseCookie(req: express.Request, name: string): string | undefined {
    const header = req.headers.cookie ?? "";
    const match = header.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : undefined;
}

function authMiddleware(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
): void {
    const { accessToken } = config;
    if (!accessToken) return next();

    const queryToken = req.query.token as string | undefined;
    if (queryToken === accessToken) {
        res.setHeader(
            "Set-Cookie",
            `mapping_token=${encodeURIComponent(accessToken)}; Path=/; Max-Age=${
                7 * 24 * 3600
            }; SameSite=Strict`,
        );
        const redirectUrl =
            req.path +
            (Object.keys(req.query).length > 1
                ? "?" +
                  new URLSearchParams(
                      Object.entries(
                          req.query as Record<string, string>,
                      ).filter(([k]) => k !== "token"),
                  ).toString()
                : "");
        res.redirect(302, redirectUrl);
        return;
    }

    const cookieToken = parseCookie(req, "mapping_token");
    if (cookieToken === accessToken) return next();

    res.status(401).send(
        "<!doctype html><html><head><title>Access Denied</title></head>" +
            "<body style='font-family:sans-serif;text-align:center;padding:4rem'>" +
            "<h1>401 - Access Denied</h1>" +
            "<p>Use the shared link provided by your teammate.</p>" +
            "</body></html>",
    );
}

// ─── Express ─────────────────────────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);
app.use(authMiddleware);
app.use(express.static(PUBLIC_DIR));

// ─── Socket.io ───────────────────────────────────────────────────────────────

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: "*" },
});

io.use((socket, next) => {
    if (!config.accessToken) return next();
    const token = socket.handshake.auth?.token as string | undefined;
    if (token === config.accessToken) return next();
    next(new Error("Unauthorized"));
});

// ─── Per-type counters ────────────────────────────────────────────────────────
// Scanned from disk on startup; incremented on each new note.

const counters: TypeCounters = { Story: 0, Rule: 0, Example: 0, Question: 0 };

function scanCounters(): void {
    if (!fs.existsSync(CONTEXT_DIR)) return;
    for (const entry of fs.readdirSync(CONTEXT_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const userDir = path.join(CONTEXT_DIR, entry.name);
        for (const file of fs.readdirSync(userDir)) {
            if (!file.endsWith(".md")) continue;
            const match = file.match(/^([A-Za-z]+)_(\d+)\.md$/);
            if (!match) continue;
            const type = match[1] as NoteType;
            const n = parseInt(match[2], 10);
            if (NOTE_TYPES.includes(type) && n > counters[type]) {
                counters[type] = n;
            }
        }
    }
    console.log("Counters after scan:", counters);
}

function nextId(type: NoteType): string {
    counters[type] += 1;
    return `${type}_${counters[type]}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeUsername(name: string): string {
    return name
        .replace(/[^a-z0-9_\-]/gi, "_")
        .slice(0, 32)
        .toLowerCase();
}

function absPath(relPath: string): string {
    return path.join(CONTEXT_DIR, relPath);
}

function buildMarkdown(note: Note): string {
    const rulesFm =
        note.type === "Example"
            ? `Rules: ${(note.ruleIds ?? []).join(", ")}\n`
            : "";
    return `---
Author: ${note.author}
Type: ${note.type}
ID: ${note.id}
Time: ${note.timestamp}
${rulesFm}---
# ${note.type}
${note.content}
`;
}

function parseRulesLine(raw: string): string[] | undefined {
    const line = raw.match(/^Rules:\s*(.*)$/m)?.[1];
    if (line === undefined) return undefined;
    return line
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

function filterToExistingRuleIds(ids: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
        const n = noteIndex.get(id);
        if (n?.type === "Rule" && !seen.has(id)) {
            seen.add(id);
            out.push(id);
        }
    }
    return out;
}

/** Drop stale rule IDs after the index is built (e.g. deleted rules). */
function normalizeExampleRuleLinks(): void {
    const ruleIdSet = new Set(
        [...noteIndex.values()]
            .filter((n) => n.type === "Rule")
            .map((n) => n.id),
    );
    for (const n of noteIndex.values()) {
        if (n.type !== "Example" || n.ruleIds === undefined) continue;
        const next = n.ruleIds.filter((id) => ruleIdSet.has(id));
        if (next.length !== n.ruleIds.length) {
            n.ruleIds = next;
            fs.writeFileSync(absPath(n.relPath), buildMarkdown(n), "utf-8");
        }
    }
}

/** Old Example files had no Rules line — treat as illustrating every rule, then persist. */
function migrateLegacyExampleFiles(): void {
    const allRuleIds = [...noteIndex.values()]
        .filter((n) => n.type === "Rule")
        .map((n) => n.id);
    for (const n of noteIndex.values()) {
        if (n.type !== "Example" || n.ruleIds !== undefined) continue;
        n.ruleIds = [...allRuleIds];
        fs.writeFileSync(absPath(n.relPath), buildMarkdown(n), "utf-8");
    }
}

function examplesForRule(ruleId: string): Note[] {
    return [...noteIndex.values()]
        .filter(
            (n) => n.type === "Example" && (n.ruleIds ?? []).includes(ruleId),
        )
        .sort(
            (a, b) =>
                parseInt(a.id.split("_")[1], 10) -
                parseInt(b.id.split("_")[1], 10),
        );
}

/** Rule files store generated "## Examples" on disk; strip so we never duplicate on rebuild. */
function stripRuleExamplesSectionFromBody(body: string): string {
    return body.replace(/\r?\n## Examples[\s\S]*$/u, "").trimEnd();
}

function buildRuleMarkdownWithExamples(rule: Note, examples: Note[]): string {
    const examplesSection =
        examples.length === 0
            ? "\n_No examples yet._\n"
            : "\n" +
              examples
                  .map(
                      (ex) =>
                          `- **[${ex.id}]** ${ex.content}  _(${ex.author})_`,
                  )
                  .join("\n") +
              "\n";

    const ruleBody = stripRuleExamplesSectionFromBody(rule.content);

    return `---
Author: ${rule.author}
Type: ${rule.type}
ID: ${rule.id}
Time: ${rule.timestamp}
---
# Rule
${ruleBody}

## Examples
${examplesSection}`;
}

/** Re-write every Rule file on disk with examples that list that rule in ruleIds. */
function rebuildAllRuleFiles(): void {
    const rules = [...noteIndex.values()].filter((n) => n.type === "Rule");

    for (const rule of rules) {
        const md = buildRuleMarkdownWithExamples(
            rule,
            examplesForRule(rule.id),
        );
        fs.writeFileSync(absPath(rule.relPath), md, "utf-8");
    }
}

function parseNoteFile(relPath: string): Note | null {
    try {
        const raw = fs.readFileSync(absPath(relPath), "utf-8");
        const author = raw.match(/^Author:\s*(.+)$/m)?.[1]?.trim();
        const type = raw.match(/^Type:\s*(.+)$/m)?.[1]?.trim() as
            | NoteType
            | undefined;
        const id = raw.match(/^ID:\s*(.+)$/m)?.[1]?.trim();
        const time = raw.match(/^Time:\s*(.+)$/m)?.[1]?.trim();
        let content = raw.match(/^#\s*.+\n([\s\S]+)$/m)?.[1]?.trim();
        if (!author || !type || !id || !time || !content) return null;
        if (type === "Rule") {
            content = stripRuleExamplesSectionFromBody(content);
        }
        const parsedRules = parseRulesLine(raw);
        const note: Note = {
            id,
            author,
            type,
            content,
            timestamp: time,
            relPath,
        };
        if (type === "Example" && parsedRules !== undefined) {
            note.ruleIds = parsedRules;
        }
        return note;
    } catch {
        return null;
    }
}

function loadAllNotes(): Note[] {
    const notes: Note[] = [];
    if (!fs.existsSync(CONTEXT_DIR)) return notes;
    for (const entry of fs.readdirSync(CONTEXT_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const userDir = path.join(CONTEXT_DIR, entry.name);
        for (const file of fs.readdirSync(userDir)) {
            if (!file.endsWith(".md")) continue;
            const note = parseNoteFile(`${entry.name}/${file}`);
            if (note) notes.push(note);
        }
    }
    return notes.sort((a, b) => {
        const [aType, aNum] = a.id.split("_");
        const [bType, bNum] = b.id.split("_");
        if (aType !== bType) return aType.localeCompare(bType);
        return parseInt(aNum, 10) - parseInt(bNum, 10);
    });
}

// ─── Startup ──────────────────────────────────────────────────────────────────

scanCounters();

// In-memory index so edit_note can find notes without a disk scan
const noteIndex = new Map<string, Note>();
loadAllNotes().forEach((n) => noteIndex.set(n.id, n));
migrateLegacyExampleFiles();
normalizeExampleRuleLinks();
rebuildAllRuleFiles();

// ─── Connected users ──────────────────────────────────────────────────────────
// Maps socket.id → display name (empty string until set_username is received)

const connectedUsers = new Map<string, string>();

function broadcastUsers(): void {
    const names = [...connectedUsers.values()].filter(
        (n) => n.trim().length > 0,
    );
    io.emit("users_changed", names);
}

// ─── Socket Events ────────────────────────────────────────────────────────────

io.on("connection", (socket) => {
    console.log(`Client connected: ${socket.id}`);
    connectedUsers.set(socket.id, "");
    broadcastUsers();

    socket.emit("init_notes", [...noteIndex.values()]);

    socket.on("set_username", (name: string) => {
        connectedUsers.set(socket.id, name.trim().slice(0, 32));
        broadcastUsers();
    });

    socket.on("new_note", ({ author, type, content, ruleIds }) => {
        let resolvedExampleRuleIds: string[] | undefined;
        if (type === "Example") {
            const raw = Array.isArray(ruleIds) ? ruleIds : [];
            resolvedExampleRuleIds = filterToExistingRuleIds(raw);
            if (resolvedExampleRuleIds.length === 0) {
                socket.emit("note_error", {
                    message:
                        "Link the example to at least one rule before posting.",
                });
                return;
            }
        }

        const id = nextId(type);
        const timestamp = new Date().toISOString();
        const userDir = safeUsername(author);
        const relPath = `${userDir}/${id}.md`;

        const userAbsDir = path.join(CONTEXT_DIR, userDir);
        if (!fs.existsSync(userAbsDir))
            fs.mkdirSync(userAbsDir, { recursive: true });

        let note: Note = { id, author, type, content, timestamp, relPath };
        if (type === "Example" && resolvedExampleRuleIds) {
            note = { ...note, ruleIds: resolvedExampleRuleIds };
        }
        noteIndex.set(id, note);

        if (type === "Rule") {
            fs.writeFileSync(
                absPath(relPath),
                buildRuleMarkdownWithExamples(note, examplesForRule(note.id)),
                "utf-8",
            );
        } else {
            fs.writeFileSync(absPath(relPath), buildMarkdown(note), "utf-8");
        }
        console.log(`Saved: context_files/${relPath}`);

        if (type === "Example") {
            rebuildAllRuleFiles();
        }

        io.emit("note_added", note);
    });

    socket.on("edit_note", ({ id, content, ruleIds }) => {
        const note = noteIndex.get(id);
        if (!note) {
            console.warn(`edit_note: unknown id "${id}"`);
            return;
        }
        let updated: Note = { ...note, content };
        if (updated.type === "Example" && ruleIds !== undefined) {
            const nextRuleIds = filterToExistingRuleIds(ruleIds);
            if (nextRuleIds.length === 0) {
                socket.emit("note_error", {
                    message:
                        "An example must stay linked to at least one rule.",
                });
                return;
            }
            updated = { ...updated, ruleIds: nextRuleIds };
        }
        noteIndex.set(id, updated);

        if (updated.type === "Rule") {
            fs.writeFileSync(
                absPath(updated.relPath),
                buildRuleMarkdownWithExamples(
                    updated,
                    examplesForRule(updated.id),
                ),
                "utf-8",
            );
        } else {
            fs.writeFileSync(
                absPath(updated.relPath),
                buildMarkdown(updated),
                "utf-8",
            );
        }
        console.log(`Updated: context_files/${updated.relPath}`);

        if (updated.type === "Example") {
            rebuildAllRuleFiles();
        }

        io.emit("note_updated", updated);
    });

    socket.on("disconnect", () => {
        console.log(`Client disconnected: ${socket.id}`);
        connectedUsers.delete(socket.id);
        broadcastUsers();
    });
});

// ─── File Watcher (detects manual deletes) ────────────────────────────────────

fs.watch(CONTEXT_DIR, { recursive: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith(".md")) return;
    const relPath = filename.replace(/\\/g, "/");
    if (
        eventType === "rename" &&
        !fs.existsSync(path.join(CONTEXT_DIR, relPath))
    ) {
        for (const [id, note] of noteIndex.entries()) {
            if (note.relPath === relPath) {
                const wasExample = note.type === "Example";
                noteIndex.delete(id);
                console.log(`Removed: context_files/${relPath}`);
                io.emit("note_removed", id);
                if (wasExample) rebuildAllRuleFiles();
                break;
            }
        }
    }
});

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
    console.log(`\nMapping Tool running at http://localhost:${PORT}`);
    console.log(`context_files/ -> ${CONTEXT_DIR}\n`);
});
