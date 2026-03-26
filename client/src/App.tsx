import { useState, useEffect, useCallback, useMemo } from "react";
import type { Note, NoteType, AgentFilesPayload } from "./types";
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
  const [agentPayload, setAgentPayload] = useState<AgentFilesPayload | null>(
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

    const onInitAgentFiles = (p: AgentFilesPayload) => setAgentPayload(p);
    const onAgentFilesUpdated = (p: AgentFilesPayload) => setAgentPayload(p);

    const onNoteError = ({ message }: { message: string }) => {
      window.alert(message);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("init_notes", onInitNotes);
    socket.on("note_added", onNoteAdded);
    socket.on("note_updated", onNoteUpdated);
    socket.on("note_removed", onNoteRemoved);
    socket.on("users_changed", onUsersChanged);
    socket.on("init_agent_files", onInitAgentFiles);
    socket.on("agent_files_updated", onAgentFilesUpdated);
    socket.on("note_error", onNoteError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("init_notes", onInitNotes);
      socket.off("note_added", onNoteAdded);
      socket.off("note_updated", onNoteUpdated);
      socket.off("note_removed", onNoteRemoved);
      socket.off("users_changed", onUsersChanged);
      socket.off("init_agent_files", onInitAgentFiles);
      socket.off("agent_files_updated", onAgentFilesUpdated);
      socket.off("note_error", onNoteError);
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
        agentPayload={agentPayload}
      />
      <Board
        notes={notes}
        activeFilter={activeFilter}
        currentAuthor={currentAuthor}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </>
  );
}
