import { useState, useRef, useEffect } from "react";
import type { Note } from "../types";

interface NoteCardProps {
  note: Note;
  currentAuthor: string;
  onEdit: (id: string, content: string, ruleIds?: string[]) => void;
  onDelete: (id: string) => void;
  allRules: Note[];
}

export default function NoteCard({
  note,
  currentAuthor,
  onEdit,
  onDelete,
  allRules,
}: NoteCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const [editRuleIds, setEditRuleIds] = useState<Set<string>>(
    () => new Set(note.type === "Example" ? note.ruleIds ?? [] : []),
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isOwner =
    note.author.trim().toLowerCase() === currentAuthor.trim().toLowerCase();
  const isAgentAuthor =
    note.author.trim().toLowerCase() === "agent";
  const canDelete = isOwner || note.isAi === true || isAgentAuthor;

  const [, num] = note.id.split("_");

  const linkedRules =
    note.type === "Example"
      ? allRules.filter((r) => (note.ruleIds ?? []).includes(r.id))
      : [];

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

  useEffect(() => {
    if (note.type === "Example" && !isEditing) {
      setEditRuleIds(new Set(note.ruleIds ?? []));
    }
  }, [note.type, note.ruleIds, isEditing]);

  const toggleEditRule = (ruleId: string) => {
    setEditRuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
  };

  const handleEdit = () => {
    setEditContent(note.content);
    if (note.type === "Example") {
      setEditRuleIds(new Set(note.ruleIds ?? []));
    }
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditContent(note.content);
    if (note.type === "Example") {
      setEditRuleIds(new Set(note.ruleIds ?? []));
    }
  };

  const handleSave = () => {
    const trimmed = editContent.trim();
    if (!trimmed) {
      setIsEditing(false);
      return;
    }
    const contentSame = trimmed === note.content;
    if (note.type === "Example") {
      if (editRuleIds.size === 0) {
        window.alert("Link this example to at least one rule before saving.");
        return;
      }
      const nextIds = [...editRuleIds].sort();
      const prevIds = [...(note.ruleIds ?? [])].sort();
      const rulesSame =
        nextIds.length === prevIds.length &&
        nextIds.every((id, i) => id === prevIds[i]);
      if (contentSame && rulesSame) {
        setIsEditing(false);
        return;
      }
      onEdit(note.id, trimmed, nextIds);
    } else {
      if (contentSame) {
        setIsEditing(false);
        return;
      }
      onEdit(note.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  };

  const handleDelete = () => {
    if (
      !window.confirm(
        "Delete this sticky permanently? This cannot be undone.",
      )
    ) {
      return;
    }
    onDelete(note.id);
  };

  const aiClass = note.isAi ? " card--ai" : "";

  return (
    <div
      className={`card${isEditing ? " editing" : ""}${aiClass}`}
      data-id={note.id}
      data-type={note.type}
      data-ai={note.isAi ? "true" : undefined}
    >
      {note.isAi && (
        <div className="card-ai-ribbon" title="Marked as AI-generated">
          AI
        </div>
      )}
      <div className="card-header">
        <span className="card-type">{note.type.toUpperCase()}</span>
        <span className="card-id">#{num}</span>
      </div>

      <div className="card-content">{note.content}</div>

      {note.type === "Example" && linkedRules.length > 0 && !isEditing && (
        <div className="card-linked-rules" aria-label="Linked rules">
          {linkedRules.map((r) => {
            const [, rn] = r.id.split("_");
            return (
              <span key={r.id} className="card-rule-chip" title={r.content}>
                Rule #{rn}
              </span>
            );
          })}
        </div>
      )}

      {note.type === "Example" && linkedRules.length === 0 && !isEditing && (
        <p className="card-linked-rules-empty">Not linked to any rule — edit to choose rules.</p>
      )}

      <div className="card-edit-area">
        {isEditing && note.type === "Example" && (
          <div className="card-edit-rules">
            <div className="card-edit-rules-label">Linked rules</div>
            {allRules.length === 0 ? (
              <p className="card-edit-rules-empty">No rules on the board yet.</p>
            ) : (
              <ul className="card-edit-rules-list" role="group">
                {allRules.map((r) => {
                  const [, rn] = r.id.split("_");
                  return (
                    <li key={r.id}>
                      <label className="card-edit-rule-option">
                        <input
                          type="checkbox"
                          checked={editRuleIds.has(r.id)}
                          onChange={() => toggleEditRule(r.id)}
                        />
                        <span className="card-edit-rule-id">#{rn}</span>
                        <span className="card-edit-rule-preview">{r.content}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="card-textarea"
          maxLength={600}
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      <div className="card-footer">
        <div className="card-meta">
          <span>{note.author}</span>
          {isOwner && <span className="owner-badge">you</span>}
        </div>
        <div className="card-actions">
          {isOwner && !isEditing && (
            <button type="button" className="card-btn edit-btn" onClick={handleEdit}>
              Edit
            </button>
          )}
          {canDelete && !isEditing && (
            <button
              type="button"
              className="card-btn delete-btn"
              onClick={handleDelete}
            >
              Delete
            </button>
          )}
          {isEditing && (
            <>
              <button
                type="button"
                className="card-btn save-btn"
                onClick={handleSave}
                disabled={note.type === "Example" && editRuleIds.size === 0}
                title={
                  note.type === "Example" && editRuleIds.size === 0
                    ? "Select at least one rule"
                    : undefined
                }
              >
                Save
              </button>
              <button type="button" className="card-btn cancel-btn" onClick={handleCancel}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
