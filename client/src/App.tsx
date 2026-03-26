import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Note, NoteType } from "./types";
import { socket } from "./socket";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Board from "./components/Board";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [notes, setNotes] = useState<Map<string, Note>>(new Map());
  const [activeFilter, setActiveFilter] = useState<string>("All");
  const [currentAuthor, setCurrentAuthor] = useState(
    () => localStorage.getItem("authorName") ?? ""
  );
  const [connectedUsers, setConnectedUsers] = useState<string[]>([]);
  /** note id → display name of user currently editing */
  const [editLocks, setEditLocks] = useState<Map<string, string>>(() => new Map());
  const pendingBeginEdit = useRef<{
    id: string;
    resolve: (ok: boolean) => void;
  } | null>(null);
  /** When set, Sidebar switches to Example composer with this rule pre-linked */
  const [pendingExampleRuleId, setPendingExampleRuleId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      const saved = localStorage.getItem("authorName");
      if (saved) socket.emit("set_username", saved);
    };
    const onDisconnect = () => setConnected(false);

    const onInitNotes = (existing: Note[]) => {
      setNotes((prev) => {
        const next = new Map(prev);
        existing.forEach((n) => next.set(n.id, n));
        return next;
      });
    };

    const onNoteAdded = (note: Note) => {
      setNotes((prev) => new Map(prev).set(note.id, note));
    };

    const onNoteUpdated = (note: Note) => {
      setNotes((prev) => new Map(prev).set(note.id, note));
    };

    const onNoteRemoved = (id: string) => {
      setNotes((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    };

    const onUsersChanged = (users: string[]) => setConnectedUsers(users);

    const onNoteError = ({ message }: { message: string }) => {
      window.alert(message);
    };

    const onInitEditLocks = (locks: Record<string, string>) => {
      setEditLocks(new Map(Object.entries(locks)));
    };

    const onNoteEditLockChanged = (payload: {
      noteId: string;
      lockedBy: string | null;
    }) => {
      setEditLocks((prev) => {
        const next = new Map(prev);
        if (payload.lockedBy === null) next.delete(payload.noteId);
        else next.set(payload.noteId, payload.lockedBy);
        return next;
      });
    };

    const onBeginEditResult = (payload: {
      noteId: string;
      ok: boolean;
      message?: string;
    }) => {
      const pending = pendingBeginEdit.current;
      if (pending && pending.id === payload.noteId) {
        pendingBeginEdit.current = null;
        if (payload.message && !payload.ok) window.alert(payload.message);
        pending.resolve(payload.ok);
      }
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("init_notes", onInitNotes);
    socket.on("note_added", onNoteAdded);
    socket.on("note_updated", onNoteUpdated);
    socket.on("note_removed", onNoteRemoved);
    socket.on("users_changed", onUsersChanged);
    socket.on("note_error", onNoteError);
    socket.on("init_edit_locks", onInitEditLocks);
    socket.on("note_edit_lock_changed", onNoteEditLockChanged);
    socket.on("begin_edit_result", onBeginEditResult);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("init_notes", onInitNotes);
      socket.off("note_added", onNoteAdded);
      socket.off("note_updated", onNoteUpdated);
      socket.off("note_removed", onNoteRemoved);
      socket.off("users_changed", onUsersChanged);
      socket.off("note_error", onNoteError);
      socket.off("init_edit_locks", onInitEditLocks);
      socket.off("note_edit_lock_changed", onNoteEditLockChanged);
      socket.off("begin_edit_result", onBeginEditResult);
    };
  }, []);

  const handleAuthorChange = useCallback((name: string) => {
    setCurrentAuthor(name);
    localStorage.setItem("authorName", name);
    socket.emit("set_username", name);
  }, []);

  const ruleNotes = useMemo(
    () =>
      [...notes.values()]
        .filter((n) => n.type === "Rule")
        .sort((a, b) => {
          const [, an] = a.id.split("_");
          const [, bn] = b.id.split("_");
          return parseInt(an, 10) - parseInt(bn, 10);
        }),
    [notes],
  );

  const handleEdit = useCallback(
    (id: string, content: string, ruleIds?: string[]) => {
      const payload: { id: string; content: string; ruleIds?: string[] } = {
        id,
        content,
      };
      if (ruleIds !== undefined) payload.ruleIds = ruleIds;
      socket.emit("edit_note", payload);
    },
    [],
  );

  const requestBeginEdit = useCallback((id: string): Promise<boolean> => {
    return new Promise((resolve) => {
      pendingBeginEdit.current = { id, resolve };
      socket.emit("begin_edit_note", { id });
      window.setTimeout(() => {
        const p = pendingBeginEdit.current;
        if (p && p.id === id) {
          pendingBeginEdit.current = null;
          resolve(false);
        }
      }, 15000);
    });
  }, []);

  const handleEndEdit = useCallback((id: string) => {
    socket.emit("end_edit_note", { id });
  }, []);

  const handlePost = useCallback(
    (
      author: string,
      type: string,
      content: string,
      ruleIds?: string[],
    ) => {
      const payload: {
        author: string;
        type: NoteType;
        content: string;
        ruleIds?: string[];
        isAi?: boolean;
      } = { author, type: type as NoteType, content };
      if (ruleIds !== undefined) payload.ruleIds = ruleIds;
      if (type === "Rule") payload.isAi = true;
      socket.emit("new_note", payload);
    },
    [],
  );

  const handleDelete = useCallback((id: string) => {
    socket.emit("delete_note", { id });
  }, []);

  const handleStartAddExampleForRule = useCallback((ruleId: string) => {
    setPendingExampleRuleId(ruleId);
  }, []);

  const handlePendingExampleConsumed = useCallback(() => {
    setPendingExampleRuleId(null);
  }, []);

  return (
    <>
      <Header connected={connected} noteCount={notes.size} />
      <Sidebar
        currentAuthor={currentAuthor}
        onAuthorChange={handleAuthorChange}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        onPost={handlePost}
        connectedUsers={connectedUsers}
        rules={ruleNotes}
        pendingExampleRuleId={pendingExampleRuleId}
        onPendingExampleConsumed={handlePendingExampleConsumed}
      />
      <Board
        notes={notes}
        activeFilter={activeFilter}
        currentAuthor={currentAuthor}
        onEdit={handleEdit}
        onDelete={handleDelete}
        editLocks={editLocks}
        onRequestBeginEdit={requestBeginEdit}
        onEndEdit={handleEndEdit}
        onStartAddExampleForRule={handleStartAddExampleForRule}
      />
    </>
  );
}
