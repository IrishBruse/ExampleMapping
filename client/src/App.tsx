import { useState, useEffect, useCallback } from "react";
import type { Note } from "./types";
import { socket } from "./socket";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Board from "./components/Board";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [notes, setNotes] = useState<Map<string, Note>>(new Map());
  const [activeFilter, setActiveFilter] = useState<string>("All");
  const [currentAuthor, setCurrentAuthor] = useState("");

  useEffect(() => {
    const onConnect = () => setConnected(true);
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

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("init_notes", onInitNotes);
    socket.on("note_added", onNoteAdded);
    socket.on("note_updated", onNoteUpdated);
    socket.on("note_removed", onNoteRemoved);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("init_notes", onInitNotes);
      socket.off("note_added", onNoteAdded);
      socket.off("note_updated", onNoteUpdated);
      socket.off("note_removed", onNoteRemoved);
    };
  }, []);

  const handleEdit = useCallback((id: string, content: string) => {
    socket.emit("edit_note", { id, content });
  }, []);

  const handlePost = useCallback((author: string, type: string, content: string) => {
    socket.emit("new_note", { author, type: type as any, content });
  }, []);

  return (
    <>
      <Header connected={connected} noteCount={notes.size} />
      <Sidebar
        currentAuthor={currentAuthor}
        onAuthorChange={setCurrentAuthor}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        onPost={handlePost}
      />
      <Board
        notes={notes}
        activeFilter={activeFilter}
        currentAuthor={currentAuthor}
        onEdit={handleEdit}
      />
    </>
  );
}
