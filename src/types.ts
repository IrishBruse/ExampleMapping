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
}

export interface ClientToServerEvents {
  /** Client submits a new sticky note */
  new_note: (payload: {
    author: string;
    type: NoteType;
    content: string;
  }) => void;
  /** Owner edits their own note */
  edit_note: (payload: { id: string; content: string }) => void;
}
