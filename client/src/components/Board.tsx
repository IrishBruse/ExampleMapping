import { useRef, useEffect } from "react";
import type { Note } from "../types";
import NoteCard from "./NoteCard";

interface BoardProps {
  notes: Map<string, Note>;
  activeFilter: string;
  currentAuthor: string;
  onEdit: (id: string, content: string) => void;
}

export default function Board({
  notes,
  activeFilter,
  currentAuthor,
  onEdit,
}: BoardProps) {
  const boardRef = useRef<HTMLElement>(null);
  const prevCountRef = useRef(0);

  const visible = [...notes.values()]
    .filter((n) => activeFilter === "All" || n.type === activeFilter)
    .sort((a, b) => {
      const [aT, aN] = a.id.split("_");
      const [bT, bN] = b.id.split("_");
      if (aT !== bT) return aT.localeCompare(bT);
      return parseInt(aN) - parseInt(bN);
    });

  useEffect(() => {
    if (visible.length > prevCountRef.current && boardRef.current) {
      const lastCard = boardRef.current.lastElementChild;
      if (lastCard) {
        lastCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
    prevCountRef.current = visible.length;
  }, [visible.length]);

  return (
    <main id="board" ref={boardRef}>
      {visible.length === 0 ? (
        <div id="empty-msg">No notes yet — post the first one ↗</div>
      ) : (
        visible.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            currentAuthor={currentAuthor}
            onEdit={onEdit}
          />
        ))
      )}
    </main>
  );
}
