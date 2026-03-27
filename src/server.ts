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
    ConnectedUserEntry,
    ServerToClientEvents,
    ClientToServerEvents,
    AgentFileEntry,
    AgentFilesPayload,
} from "./types";

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.resolve(__dirname, "../client/dist");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR_REL = process.env.MAPPING_OUTPUT_DIR?.trim() || "./context_files";
const CONTEXT_DIR = path.resolve(PROJECT_ROOT, OUTPUT_DIR_REL);
/** Optional auth secret: query `?token=…` and Socket.io `auth.token` must match. Set via `MAPPING_PASSWORD` or CLI `--password`. */
const PASSWORD = process.env.MAPPING_PASSWORD?.trim() || undefined;

console.log(`[notes] CONTEXT_DIR (absolute): ${CONTEXT_DIR}`);
if (PASSWORD) {
    console.log(`http://localhost:${PORT}/?token=${PASSWORD}`);
}
console.log();
console.log();

/** AI-generated files always live under `<outputDir>/agent/` (author folder name is always `agent`). */
const AGENT_DIR = path.join(CONTEXT_DIR, "agent");

const MAX_AGENT_FILE_BYTES = 512 * 1024;
const AGENT_TEXT_EXT = new Set([
    ".md",
    ".txt",
    ".json",
    ".jsonl",
    ".log",
    ".ts",
    ".tsx",
    ".js",
    ".mjs",
    ".cjs",
    ".yaml",
    ".yml",
    ".feature",
]);

function isAgentTextFile(name: string): boolean {
    const lower = name.toLowerCase();
    const dot = lower.lastIndexOf(".");
    if (dot === -1) return true;
    return AGENT_TEXT_EXT.has(lower.slice(dot));
}

/** Resolve a relative path under AGENT_DIR only; rejects `..` and escapes. */
function safeResolvedPathUnderAgent(relPath: string): string | null {
    const norm = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
    const parts = norm.split("/").filter((p) => p.length > 0);
    if (parts.length === 0) return null;
    if (parts.some((p) => p === "..")) return null;
    const full = path.resolve(AGENT_DIR, ...parts);
    const root = path.resolve(AGENT_DIR);
    const rel = path.relative(root, full);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    return full;
}

function scanAgentFiles(root: string): AgentFileEntry[] {
    const out: AgentFileEntry[] = [];
    function walk(dir: string, relPrefix: string): void {
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entries) {
            if (e.name.startsWith(".") || e.name === "node_modules") continue;
            const rel = relPrefix ? `${relPrefix}/${e.name}` : e.name;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                walk(full, rel);
            } else if (e.isFile() && isAgentTextFile(e.name)) {
                try {
                    const st = fs.statSync(full);
                    const maxRead = Math.min(st.size, MAX_AGENT_FILE_BYTES);
                    const buf = fs.readFileSync(full);
                    const truncated = st.size > MAX_AGENT_FILE_BYTES;
                    out.push({
                        relPath: rel.replace(/\\/g, "/"),
                        name: e.name,
                        mtimeMs: st.mtimeMs,
                        content: buf.subarray(0, maxRead).toString("utf8"),
                        truncated: truncated || undefined,
                    });
                } catch {
                    /* unreadable */
                }
            }
        }
    }
    walk(root, "");
    out.sort((a, b) => a.relPath.localeCompare(b.relPath));
    return out;
}

function buildAgentPayload(): AgentFilesPayload {
    if (!fs.existsSync(AGENT_DIR)) {
        return {
            enabled: false,
            label: "",
            watchPath: AGENT_DIR,
            files: [],
        };
    }
    return {
        enabled: true,
        label: "agent",
        watchPath: AGENT_DIR,
        files: scanAgentFiles(AGENT_DIR),
    };
}

const NOTE_TYPES: NoteType[] = [
    "Story",
    "Rule",
    "Example",
    "Question",
    "Feature",
];

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
    if (!PASSWORD) return next();

    const queryToken = req.query.token as string | undefined;
    if (queryToken === PASSWORD) {
        res.setHeader(
            "Set-Cookie",
            `mapping_token=${encodeURIComponent(PASSWORD)}; Path=/; Max-Age=${
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
    if (cookieToken === PASSWORD) return next();

    res.status(401).send(
        "<!doctype html><html><head><title>Access Denied</title></head>" +
            "<body style='font-family:sans-serif;text-align:center;padding:4rem'>" +
            "<h1>401 - Access Denied</h1>" +
            "<p>Use the link your teammate sent you.</p>" +
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

if (!fs.existsSync(AGENT_DIR)) {
    try {
        fs.mkdirSync(AGENT_DIR, { recursive: true });
        console.log(`Created agent watch directory: ${AGENT_DIR}`);
    } catch (e) {
        console.warn(`Could not create agent directory ${AGENT_DIR}:`, e);
    }
}

io.use((socket, next) => {
    if (!PASSWORD) return next();
    const token = socket.handshake.auth?.token as string | undefined;
    if (token === PASSWORD) return next();
    console.warn(
        `[socket] auth rejected (invalid or missing token in handshake) socket=${socket.id}`,
    );
    next(new Error("Unauthorized"));
});

// ─── Per-type counters ────────────────────────────────────────────────────────
// Scanned from disk on startup; incremented on each new note.

const counters: TypeCounters = {
    Story: 0,
    Rule: 0,
    Example: 0,
    Question: 0,
    Feature: 0,
};

function scanCounters(): void {
    if (!fs.existsSync(CONTEXT_DIR)) return;
    for (const entry of fs.readdirSync(CONTEXT_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const userDir = path.join(CONTEXT_DIR, entry.name);
        for (const file of fs.readdirSync(userDir)) {
            const match = file.match(/^([A-Za-z]+)_(\d+)\.(md|feature)$/);
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

/** Create parent dirs then write — avoids ENOENT if the context tree was removed and recreated. */
function writeFileEnsuringDir(absFilePath: string, content: string): void {
    fs.mkdirSync(path.dirname(absFilePath), { recursive: true });
    fs.writeFileSync(absFilePath, content, "utf-8");
}

function sourceFrontmatter(note: Note): string {
    return note.isAi ? "Source: ai\n" : "";
}

function buildMarkdown(note: Note): string {
    const rulesFm =
        note.type === "Example"
            ? `Rules: ${(note.ruleIds ?? []).join(", ")}\n`
            : "";
    const titleLine = note.type === "Question" ? note.id : note.type;
    return `---
Author: ${note.author}
Type: ${note.type}
ID: ${note.id}
Time: ${note.timestamp}
${sourceFrontmatter(note)}${rulesFm}---
# ${titleLine}
${note.content}
`;
}

/** Gherkin body only — no markdown heading (valid .feature for Cucumber-style tools). */
function buildFeatureFile(note: Note): string {
    return `---
Author: ${note.author}
Type: ${note.type}
ID: ${note.id}
Time: ${note.timestamp}
${sourceFrontmatter(note)}---
${note.content}
`;
}

function noteFileExtension(type: NoteType): "md" | "feature" {
    return type === "Feature" ? "feature" : "md";
}

function writeNoteToDisk(note: Note): void {
    const p = absPath(note.relPath);
    if (note.type === "Rule") {
        writeFileEnsuringDir(p, buildRuleMarkdown(note));
    } else if (note.type === "Feature") {
        writeFileEnsuringDir(p, buildFeatureFile(note));
    } else {
        writeFileEnsuringDir(p, buildMarkdown(note));
    }
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
            writeFileEnsuringDir(absPath(n.relPath), buildMarkdown(n));
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
        writeFileEnsuringDir(absPath(n.relPath), buildMarkdown(n));
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

/** Legacy Rule files had a generated "## Examples" body section; strip on load. */
function stripRuleExamplesSectionFromBody(body: string): string {
    return body.replace(/\r?\n## Examples[\s\S]*$/u, "").trimEnd();
}

/** Rule body on disk: frontmatter includes `Examples: Example_1, …` (IDs only); no inline example text. */
function buildRuleMarkdown(rule: Note): string {
    const examples = examplesForRule(rule.id);
    const examplesFm =
        examples.length > 0
            ? `Examples: ${examples.map((e) => e.id).join(", ")}\n`
            : "";
    const ruleBody = stripRuleExamplesSectionFromBody(rule.content);

    return `---
Author: ${rule.author}
Type: ${rule.type}
ID: ${rule.id}
Time: ${rule.timestamp}
${sourceFrontmatter(rule)}${examplesFm}---
# Rule
${ruleBody}
`;
}

/** Re-write every Rule file on disk with up-to-date Examples: line in frontmatter. */
function rebuildAllRuleFiles(): void {
    const rules = [...noteIndex.values()].filter((n) => n.type === "Rule");

    for (const rule of rules) {
        const md = buildRuleMarkdown(rule);
        writeFileEnsuringDir(absPath(rule.relPath), md);
    }
}

type ParseNoteResult =
    | { ok: true; note: Note }
    | { ok: false; reason: string };

/** Parse a single note file; use {@link parseNoteFile} if you only need the note or null. */
function parseNoteFileResult(relPath: string): ParseNoteResult {
    try {
        const raw = fs.readFileSync(absPath(relPath), "utf-8");
        const split = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
        if (!split) {
            return {
                ok: false,
                reason:
                    "no YAML frontmatter (expected --- then --- then body); file may be raw markdown without metadata",
            };
        }
        const fmBlock = split[1];
        const afterFm = split[2];
        const author = fmBlock.match(/^Author:\s*(.+)$/m)?.[1]?.trim();
        const typeRaw = fmBlock.match(/^Type:\s*(.+)$/m)?.[1]?.trim();
        const id = fmBlock.match(/^ID:\s*(.+)$/m)?.[1]?.trim();
        const time = fmBlock.match(/^Time:\s*(.+)$/m)?.[1]?.trim();
        const sourceRaw = fmBlock
            .match(/^Source:\s*(.+)$/m)?.[1]
            ?.trim()
            .toLowerCase();

        const missing: string[] = [];
        if (!author) missing.push("Author");
        if (!typeRaw) missing.push("Type");
        if (!id) missing.push("ID");
        if (!time) missing.push("Time");
        if (missing.length > 0) {
            return {
                ok: false,
                reason: `frontmatter missing: ${missing.join(", ")}`,
            };
        }
        if (!NOTE_TYPES.includes(typeRaw as NoteType)) {
            return {
                ok: false,
                reason: `invalid Type "${typeRaw}" (must be one of ${NOTE_TYPES.join(", ")})`,
            };
        }
        const noteType = typeRaw as NoteType;

        let content: string;
        if (noteType === "Feature") {
            content = afterFm.replace(/\s+$/, "");
        } else {
            const bodyMatch = afterFm.match(/^#\s*.+\n([\s\S]+)/m);
            if (!bodyMatch) {
                return {
                    ok: false,
                    reason:
                        "body must start with a markdown H1 line (# …) followed by a newline, then note text (parser is strict)",
                };
            }
            content = bodyMatch[1]?.trim() ?? "";
            if (!content) {
                return {
                    ok: false,
                    reason: "no text after the # title line",
                };
            }
            if (noteType === "Rule") {
                content = stripRuleExamplesSectionFromBody(content);
            }
        }
        if (!content) {
            return {
                ok: false,
                reason: "note body is empty",
            };
        }

        const parsedRules = parseRulesLine(fmBlock);
        const note: Note = {
            id: id!,
            author: author!,
            type: noteType,
            content,
            timestamp: time!,
            relPath,
        };
        if (sourceRaw === "ai") {
            note.isAi = true;
        }
        if (noteType === "Example" && parsedRules !== undefined) {
            note.ruleIds = parsedRules;
        }
        return { ok: true, note };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, reason: `read/parse error: ${msg}` };
    }
}

function parseNoteFile(relPath: string): Note | null {
    const r = parseNoteFileResult(relPath);
    return r.ok ? r.note : null;
}

function warnIgnoredRootMarkdownFiles(): void {
    if (!fs.existsSync(CONTEXT_DIR)) return;
    const rootFiles = fs
        .readdirSync(CONTEXT_DIR)
        .filter((f) => f.endsWith(".md") || f.endsWith(".feature"));
    if (rootFiles.length === 0) return;
    const sample = rootFiles.slice(0, 15).join(", ");
    const more =
        rootFiles.length > 15 ? ` (and ${rootFiles.length - 15} more)` : "";
    console.warn(
        `[notes] ${rootFiles.length} file(s) in CONTEXT_DIR root are NOT loaded — put each note in a user subfolder, e.g. ${path.join(
            CONTEXT_DIR,
            "you",
            "Story_1.md",
        )}. Found: ${sample}${more}`,
    );
}

function loadAllNotes(options?: { logSkipped?: boolean }): Note[] {
    const logSkipped =
        options?.logSkipped === true ||
        process.env.MAPPING_LOG_SKIPPED_NOTES === "1";
    const notes: Note[] = [];
    if (!fs.existsSync(CONTEXT_DIR)) return notes;
    for (const entry of fs.readdirSync(CONTEXT_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const userDir = path.join(CONTEXT_DIR, entry.name);
        for (const file of fs.readdirSync(userDir)) {
            if (!file.endsWith(".md") && !file.endsWith(".feature")) continue;
            const rel = `${entry.name}/${file}`;
            const r = parseNoteFileResult(rel);
            if (r.ok) {
                notes.push(r.note);
            } else if (logSkipped) {
                console.warn(`[notes] skipped ${rel}: ${r.reason}`);
            }
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
loadAllNotes({ logSkipped: true }).forEach((n) => noteIndex.set(n.id, n));
migrateLegacyExampleFiles();
normalizeExampleRuleLinks();
rebuildAllRuleFiles();

function logNoteIndexSummary(context: string): void {
    const byType: Partial<Record<NoteType, number>> = {};
    for (const n of noteIndex.values()) {
        byType[n.type] = (byType[n.type] ?? 0) + 1;
    }
    console.log(
        `[notes] ${context}: ${noteIndex.size} notes in index`,
        Object.keys(byType).length > 0 ? byType : "(empty)",
    );
}

logNoteIndexSummary("after load + migrations");
warnIgnoredRootMarkdownFiles();
console.log(
    `[notes] Tip: set MAPPING_LOG_SKIPPED_NOTES=1 to log parse skips on each disk resync`,
);

// ─── Connected users ──────────────────────────────────────────────────────────
// Maps socket.id → profile (name empty until set_username; color from set_user_color)

const DEFAULT_USER_COLOR = "#6b9fd4";

interface SocketProfile {
    displayName: string;
    color: string;
}

function normalizeHexColor(raw: string): string {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toLowerCase();
    return DEFAULT_USER_COLOR;
}

const connectedUsers = new Map<string, SocketProfile>();

function broadcastUsers(): void {
    const users: ConnectedUserEntry[] = [...connectedUsers.entries()].map(
        ([socketId, p]) => ({
            socketId,
            displayName: p.displayName.trim(),
            color: p.color,
        }),
    );
    io.emit("users_changed", users);
}

function isNoteOwner(socketId: string, note: Note): boolean {
    const name =
        connectedUsers.get(socketId)?.displayName?.trim().toLowerCase() ?? "";
    return name.length > 0 && name === note.author.trim().toLowerCase();
}

/** note id → socket id — who holds the edit lock */
const noteEditLocks = new Map<string, string>();

function getSocketDisplayName(socketId: string): string {
    return connectedUsers.get(socketId)?.displayName?.trim() ?? "";
}

function getSocketColor(socketId: string): string {
    return connectedUsers.get(socketId)?.color ?? DEFAULT_USER_COLOR;
}

function broadcastLock(
    noteId: string,
    lockedBy: string | null,
    editorColor: string | null,
): void {
    io.emit("note_edit_lock_changed", { noteId, lockedBy, editorColor });
}

function releaseLocksHeldBySocket(socketId: string): void {
    for (const [noteId, holder] of noteEditLocks.entries()) {
        if (holder === socketId) {
            noteEditLocks.delete(noteId);
            broadcastLock(noteId, null, null);
        }
    }
}

function buildEditLocksPayload(): Record<
    string,
    { lockedBy: string; color: string }
> {
    const out: Record<string, { lockedBy: string; color: string }> = {};
    for (const [noteId, sid] of noteEditLocks.entries()) {
        const name = getSocketDisplayName(sid);
        if (name)
            out[noteId] = { lockedBy: name, color: getSocketColor(sid) };
    }
    return out;
}

/** Notes stored under the agent user (Author: agent) — any client may delete; only agent can edit via owner check */
function isAgentAuthorNote(note: Note): boolean {
    return note.author.trim().toLowerCase() === "agent";
}

/** Deletes a note and dependent example files if a rule is removed. Returns ids removed (examples first, then target), or null on failure. */
function deleteNoteById(id: string): string[] | null {
    const note = noteIndex.get(id);
    if (!note) return null;

    const removedIds: string[] = [];

    if (note.type === "Rule") {
        const toRemove: string[] = [];
        const toUpdate: Note[] = [];
        for (const n of noteIndex.values()) {
            if (n.type !== "Example" || !n.ruleIds?.includes(id)) continue;
            const next = n.ruleIds.filter((rid) => rid !== id);
            if (next.length === 0) {
                toRemove.push(n.id);
            } else {
                toUpdate.push({ ...n, ruleIds: next });
            }
        }
        for (const eid of toRemove) {
            const ex = noteIndex.get(eid);
            if (!ex) continue;
            const exAbs = absPath(ex.relPath);
            if (fs.existsSync(exAbs)) {
                try {
                    fs.unlinkSync(exAbs);
                } catch {
                    return null;
                }
            }
            noteIndex.delete(eid);
            removedIds.push(eid);
        }
        for (const n of toUpdate) {
            noteIndex.set(n.id, n);
            writeFileEnsuringDir(absPath(n.relPath), buildMarkdown(n));
        }
    }

    const mainAbs = absPath(note.relPath);
    if (fs.existsSync(mainAbs)) {
        try {
            fs.unlinkSync(mainAbs);
        } catch {
            return null;
        }
    }
    noteIndex.delete(id);
    removedIds.push(id);

    if (note.type === "Rule" || note.type === "Example") {
        rebuildAllRuleFiles();
    }
    return removedIds;
}

function notesEqual(a: Note, b: Note): boolean {
    return (
        a.id === b.id &&
        a.content === b.content &&
        a.timestamp === b.timestamp &&
        a.author === b.author &&
        a.type === b.type &&
        a.relPath === b.relPath &&
        (a.isAi ?? false) === (b.isAi ?? false) &&
        JSON.stringify(a.ruleIds ?? []) === JSON.stringify(b.ruleIds ?? [])
    );
}

function updateCounterFromNoteId(id: string): void {
    const m = id.match(/^([A-Za-z]+)_(\d+)$/);
    if (!m) return;
    const type = m[1] as NoteType;
    const n = parseInt(m[2], 10);
    if (!NOTE_TYPES.includes(type) || Number.isNaN(n)) return;
    if (n > counters[type]) counters[type] = n;
}

/**
 * Reconcile noteIndex with everything on disk (all user folders).
 * Used when the agent or another process adds, edits, or removes `.md` notes outside Socket.io handlers.
 */
function fullResyncNotesFromDisk(): void {
    const diskList = loadAllNotes();
    const onDisk = new Map<string, Note>();
    for (const n of diskList) {
        onDisk.set(n.id, n);
    }

    const toRemove = [...noteIndex.keys()].filter((id) => !onDisk.has(id));
    for (const id of toRemove) {
        const removed = deleteNoteById(id);
        if (removed) {
            for (const rid of removed) {
                io.emit("note_removed", rid);
            }
        }
    }

    let needsRuleRebuild = false;
    for (const [id, parsed] of onDisk) {
        updateCounterFromNoteId(id);
        const before = noteIndex.get(id);
        noteIndex.set(id, parsed);
        if (!before) {
            if (parsed.type === "Rule" || parsed.type === "Example") {
                needsRuleRebuild = true;
            }
            io.emit("note_added", parsed);
        } else if (!notesEqual(before, parsed)) {
            if (
                parsed.type === "Rule" ||
                parsed.type === "Example" ||
                before.type === "Rule" ||
                before.type === "Example"
            ) {
                needsRuleRebuild = true;
            }
            io.emit("note_updated", parsed);
        }
    }
    if (needsRuleRebuild) {
        rebuildAllRuleFiles();
    }
}

let contextDirWatchDebounce: NodeJS.Timeout | null = null;
function scheduleContextDirEffects(): void {
    if (contextDirWatchDebounce) clearTimeout(contextDirWatchDebounce);
    contextDirWatchDebounce = setTimeout(() => {
        contextDirWatchDebounce = null;
        try {
            io.emit("agent_files_updated", buildAgentPayload());
            fullResyncNotesFromDisk();
        } catch (e) {
            console.error("[notes] context dir watch / resync error:", e);
        }
    }, 350);
}

// ─── Socket Events ────────────────────────────────────────────────────────────

io.on("connection", (socket) => {
    console.log(`[${new Date().toISOString()}] Client connected: ${socket.id}`);
    connectedUsers.set(socket.id, {
        displayName: "",
        color: DEFAULT_USER_COLOR,
    });
    broadcastUsers();

    const snapshot = [...noteIndex.values()];
    socket.emit("init_notes", snapshot);
    console.log(
        `[notes] init_notes → socket ${socket.id} (${snapshot.length} notes)`,
    );
    socket.emit("init_edit_locks", buildEditLocksPayload());
    socket.emit("init_agent_files", buildAgentPayload());

    socket.on("set_username", (name: string) => {
        const p = connectedUsers.get(socket.id) ?? {
            displayName: "",
            color: DEFAULT_USER_COLOR,
        };
        p.displayName =
            typeof name === "string" ? name.trim().slice(0, 32) : "";
        connectedUsers.set(socket.id, p);
        broadcastUsers();
    });

    socket.on("set_user_color", (color: string) => {
        const p = connectedUsers.get(socket.id) ?? {
            displayName: "",
            color: DEFAULT_USER_COLOR,
        };
        p.color = normalizeHexColor(typeof color === "string" ? color : "");
        connectedUsers.set(socket.id, p);
        broadcastUsers();
        const name = p.displayName.trim();
        if (name) {
            for (const [noteId, holder] of noteEditLocks.entries()) {
                if (holder === socket.id)
                    broadcastLock(noteId, name, p.color);
            }
        }
    });

    socket.on("save_agent_file", ({ relPath, content }) => {
        const displayName = getSocketDisplayName(socket.id);
        if (!displayName) {
            socket.emit("note_error", {
                message:
                    "Set your display name in the toolbar before saving agent files.",
            });
            return;
        }
        if (typeof relPath !== "string" || typeof content !== "string") {
            socket.emit("note_error", { message: "Invalid save request." });
            return;
        }
        const abs = safeResolvedPathUnderAgent(relPath);
        if (!abs) {
            socket.emit("note_error", { message: "Invalid file path." });
            return;
        }
        if (!abs.toLowerCase().endsWith(".feature")) {
            socket.emit("note_error", {
                message:
                    "Only .feature files can be saved from the agent panel.",
            });
            return;
        }
        const buf = Buffer.from(content, "utf8");
        if (buf.length > MAX_AGENT_FILE_BYTES) {
            socket.emit("note_error", {
                message: `File is too large (max ${MAX_AGENT_FILE_BYTES} bytes).`,
            });
            return;
        }
        try {
            writeFileEnsuringDir(abs, content);
            console.log(`Agent file saved: ${abs}`);
            io.emit("agent_files_updated", buildAgentPayload());
        } catch (e) {
            console.warn("save_agent_file:", e);
            socket.emit("note_error", {
                message: "Could not write the agent file to disk.",
            });
        }
    });

    socket.on("new_note", ({ author, type, content, ruleIds, isAi }) => {
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
        const ext = noteFileExtension(type);
        const relPath = `${userDir}/${id}.${ext}`;

        const userAbsDir = path.join(CONTEXT_DIR, userDir);
        if (!fs.existsSync(userAbsDir))
            fs.mkdirSync(userAbsDir, { recursive: true });

        let note: Note = { id, author, type, content, timestamp, relPath };
        if (isAi) {
            note = { ...note, isAi: true };
        }
        if (type === "Example" && resolvedExampleRuleIds) {
            note = { ...note, ruleIds: resolvedExampleRuleIds };
        }
        noteIndex.set(id, note);

        writeNoteToDisk(note);
        console.log(`Saved: context_files/${relPath}`);

        if (type === "Example") {
            rebuildAllRuleFiles();
        }

        io.emit("note_added", note);
    });

    socket.on("begin_edit_note", ({ id }) => {
        const note = noteIndex.get(id);
        if (!note) {
            socket.emit("begin_edit_result", {
                noteId: id,
                ok: false,
                message: "Note not found.",
            });
            return;
        }
        const name = getSocketDisplayName(socket.id);
        if (!name) {
            socket.emit("begin_edit_result", {
                noteId: id,
                ok: false,
                message: "Set your display name before editing.",
            });
            return;
        }
        const holder = noteEditLocks.get(id);
        if (holder !== undefined && holder !== socket.id) {
            const other = getSocketDisplayName(holder) || "Someone";
            socket.emit("begin_edit_result", {
                noteId: id,
                ok: false,
                message: `${other} is already editing this note.`,
            });
            return;
        }
        noteEditLocks.set(id, socket.id);
        broadcastLock(id, name, getSocketColor(socket.id));
        socket.emit("begin_edit_result", { noteId: id, ok: true });
    });

    socket.on("end_edit_note", ({ id }) => {
        if (noteEditLocks.get(id) !== socket.id) return;
        noteEditLocks.delete(id);
        broadcastLock(id, null, null);
    });

    socket.on("edit_note", ({ id, content, ruleIds }) => {
        const note = noteIndex.get(id);
        if (!note) {
            console.warn(`edit_note: unknown id "${id}"`);
            return;
        }
        const name = getSocketDisplayName(socket.id);
        if (!name) {
            socket.emit("note_error", {
                message: "Set your display name before editing.",
            });
            return;
        }
        if (noteEditLocks.get(id) !== socket.id) {
            socket.emit("note_error", {
                message: "You no longer hold the edit lock for this note.",
            });
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

        writeNoteToDisk(updated);
        console.log(`Updated: context_files/${updated.relPath}`);

        if (updated.type === "Example") {
            rebuildAllRuleFiles();
        }

        if (noteEditLocks.get(id) === socket.id) {
            noteEditLocks.delete(id);
            broadcastLock(id, null, null);
        }

        io.emit("note_updated", updated);
    });

    socket.on("delete_note", ({ id }) => {
        const note = noteIndex.get(id);
        if (!note) {
            socket.emit("note_error", { message: "Note not found." });
            return;
        }
        const canDelete =
            isNoteOwner(socket.id, note) ||
            note.isAi === true ||
            isAgentAuthorNote(note);
        if (!canDelete) {
            socket.emit("note_error", {
                message: "You can only delete your own notes.",
            });
            return;
        }
        const removed = deleteNoteById(id);
        if (!removed) {
            socket.emit("note_error", {
                message: "Could not delete note from disk.",
            });
            return;
        }
        for (const rid of removed) {
            io.emit("note_removed", rid);
        }
    });

    socket.on("disconnect", () => {
        const displayName = connectedUsers.get(socket.id)?.displayName?.trim();
        const who = displayName ? `"${displayName}"` : "(name not set)";
        console.log(
            `[${new Date().toISOString()}] Client disconnected: ${socket.id} ${who}`,
        );
        releaseLocksHeldBySocket(socket.id);
        connectedUsers.delete(socket.id);
        broadcastUsers();
    });
});

// ─── File watcher (agent + external edits: add / change / delete) ────────────
// fs.watch may pass a null filename on some OSes; debounced full resync handles all cases.

fs.watch(CONTEXT_DIR, { recursive: true }, () => {
    scheduleContextDirEffects();
});

// ─── Start ────────────────────────────────────────────────────────────────────

export function startServer(): void {
    httpServer.listen(PORT, () => {
        console.log(`\nMapping Tool running at http://localhost:${PORT}`);
        console.log(`context_files/ -> ${CONTEXT_DIR}\n`);
    });
}

if (require.main === module) {
    startServer();
}
