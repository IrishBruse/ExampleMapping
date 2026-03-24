import { useState, useRef, useEffect } from "react";
import type { Note } from "../types";

interface NoteCardProps {
  note: Note;
  currentAuthor: string;
  onEdit: (id: string, content: string) => void;
}

export default function NoteCard({ note, currentAuthor, onEdit }: NoteCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isOwner =
    note.author.trim().toLowerCase() === currentAuthor.trim().toLowerCase();

  const [, num] = note.id.split("_");

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.selectionEnd =
        textareaRef.current.value.length;
    }
  }, [isEditing]);

  useEffect(() => {
    setEditContent(note.content);
  }, [note.content]);

  const handleEdit = () => {
    setEditContent(note.content);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditContent(note.content);
  };

  const handleSave = () => {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === note.content) {
      setIsEditing(false);
      return;
    }
    onEdit(note.id, trimmed);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  };

  return (
    <div
      className={`card${isEditing ? " editing" : ""}`}
      data-id={note.id}
      data-type={note.type}
    >
      <div className="card-header">
        <span className="card-type">{note.type.toUpperCase()}</span>
        <span className="card-id">#{num}</span>
      </div>

      <div className="card-content">{note.content}</div>

      <div className="card-edit-area">
        <textarea
          ref={textareaRef}
          className="card-textarea"
          maxLength={600}
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      <div className="card-actions">
        {isOwner && !isEditing && (
          <button className="card-btn edit-btn" onClick={handleEdit}>
            Edit
          </button>
        )}
        {isEditing && (
          <>
            <button className="card-btn save-btn" onClick={handleSave}>
              Save
            </button>
            <button className="card-btn cancel-btn" onClick={handleCancel}>
              Cancel
            </button>
          </>
        )}
      </div>

      <div className="card-meta">
        <span>{note.author}</span>
        {isOwner && <span className="owner-badge">you</span>}
      </div>
    </div>
  );
}
