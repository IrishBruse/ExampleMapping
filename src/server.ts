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
    return `---
Author: ${note.author}
Type: ${note.type}
ID: ${note.id}
Time: ${note.timestamp}
---
# ${note.type}
${note.content}
`;
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
        const content = raw.match(/^#\s*.+\n([\s\S]+)$/m)?.[1]?.trim();
        if (!author || !type || !id || !time || !content) return null;
        return { id, author, type, content, timestamp: time, relPath };
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

    socket.on("new_note", ({ author, type, content }) => {
        const id = nextId(type);
        const timestamp = new Date().toISOString();
        const userDir = safeUsername(author);
        const relPath = `${userDir}/${id}.md`;

        const userAbsDir = path.join(CONTEXT_DIR, userDir);
        if (!fs.existsSync(userAbsDir))
            fs.mkdirSync(userAbsDir, { recursive: true });

        const note: Note = { id, author, type, content, timestamp, relPath };
        fs.writeFileSync(absPath(relPath), buildMarkdown(note), "utf-8");
        console.log(`Saved: context_files/${relPath}`);

        noteIndex.set(id, note);
        io.emit("note_added", note);
    });

    socket.on("edit_note", ({ id, content }) => {
        const note = noteIndex.get(id);
        if (!note) {
            console.warn(`edit_note: unknown id "${id}"`);
            return;
        }
        const updated: Note = { ...note, content };
        fs.writeFileSync(
            absPath(updated.relPath),
            buildMarkdown(updated),
            "utf-8",
        );
        console.log(`Updated: context_files/${updated.relPath}`);
        noteIndex.set(id, updated);
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
                noteIndex.delete(id);
                console.log(`Removed: context_files/${relPath}`);
                io.emit("note_removed", id);
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
