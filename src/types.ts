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
  /**
   * For Example notes only: which rules this example illustrates.
   * Omitted on other types. Persisted in frontmatter as `Rules: Rule_1, Rule_2`.
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
}

export interface ClientToServerEvents {
  /** Client submits a new sticky note */
  new_note: (payload: {
    author: string;
    type: NoteType;
    content: string;
    /** Required when type is Example: at least one rule id */
    ruleIds?: string[];
  }) => void;
  /** Owner edits their own note */
  edit_note: (payload: {
    id: string;
    content: string;
    /** When editing an Example, updates which rules it is linked to */
    ruleIds?: string[];
  }) => void;
  /** Client sets or updates their display name */
  set_username: (name: string) => void;
}
