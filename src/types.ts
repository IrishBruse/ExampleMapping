// src/types.ts — Shared interfaces for server and client

export type NoteType = "Story" | "Rule" | "Example" | "Question";

export interface Note {
  /** Global per-type counter, e.g. "Story_4" — unique across all users */
  id: string;
  author: string;
  type: NoteType;
  content: string;
  timestamp: string; // ISO 8601 — stored in frontmatter only, not in filename
  /** Relative path inside context_files/, e.g. "alice/Story_4.md" */
  relPath: string;
  /** True when marked as AI-generated (persisted as `Source: ai` in frontmatter) */
  isAi?: boolean;
  /**
   * For Example notes only: which rules this example illustrates.
   * Omitted on other types. Persisted in frontmatter as `Rules: Rule_1, Rule_2`.
   *
   * Rule notes on disk include `Examples: Example_1, …` in frontmatter (IDs only;
   * example bodies live in their own files).
   */
  ruleIds?: string[];
}

/** Per-type counters tracked by the server */
export type TypeCounters = Record<NoteType, number>;

// Socket.io event contracts — keeps server and client in sync
export interface ServerToClientEvents {
  /** Sent once on connect: all existing notes */
  init_notes: (notes: Note[]) => void;
  /** Broadcast when a new note is written to disk */
  note_added: (note: Note) => void;
  /** Broadcast when a note's content is updated on disk */
  note_updated: (note: Note) => void;
  /** Broadcast when a file is deleted from context_files/ */
  note_removed: (id: string) => void;
  /** Broadcast whenever the set of connected users changes */
  users_changed: (users: string[]) => void;
  /** Validation failed for new_note or edit_note */
  note_error: (payload: { message: string }) => void;

  /** Current note edit locks: note id → display name of the editor (for reconnect sync) */
  init_edit_locks: (locks: Record<string, string>) => void;
  /** A note's edit lock was taken or released (lockedBy null = unlocked) */
  note_edit_lock_changed: (payload: {
    noteId: string;
    lockedBy: string | null;
  }) => void;
  /** Result of attempting to start an edit session (only sent to the requesting client) */
  begin_edit_result: (payload: {
    noteId: string;
    ok: boolean;
    message?: string;
  }) => void;

  /** Initial snapshot of externally generated agent files (after init_notes) */
  init_agent_files: (payload: AgentFilesPayload) => void;
  /** Fired when files under the agent watch directory change */
  agent_files_updated: (payload: AgentFilesPayload) => void;
}

/** One file under the watched agent directory */
export interface AgentFileEntry {
  /** Path relative to watch root (forward slashes) */
  relPath: string;
  name: string;
  mtimeMs: number;
  /** UTF-8 text; may be truncated for very large files */
  content: string;
  truncated?: boolean;
}

export interface AgentFilesPayload {
  /** False when `<outputDir>/agent` is missing (e.g. could not be created) */
  enabled: boolean;
  /** Display label (e.g. folder basename) */
  label: string;
  /** Absolute path being watched */
  watchPath: string;
  files: AgentFileEntry[];
}

export interface ClientToServerEvents {
  /** Client submits a new sticky note */
  new_note: (payload: {
    author: string;
    type: NoteType;
    content: string;
    /** Required when type is Example: at least one rule id */
    ruleIds?: string[];
    /** When true, sticky is styled as AI-generated */
    isAi?: boolean;
  }) => void;
  /** Any user may edit if they hold the edit lock (see begin_edit_note) */
  edit_note: (payload: {
    id: string;
    content: string;
    /** When editing an Example, updates which rules it is linked to */
    ruleIds?: string[];
  }) => void;
  /** Request exclusive edit access; server replies with begin_edit_result */
  begin_edit_note: (payload: { id: string }) => void;
  /** Release edit lock (cancel, or after local-only exit) */
  end_edit_note: (payload: { id: string }) => void;
  /** Owner deletes their note */
  delete_note: (payload: { id: string }) => void;
  /** Client sets or updates their display name */
  set_username: (name: string) => void;
}
