import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import type { Note } from "../types";

interface NoteCardProps {
  note: Note;
  currentAuthor: string;
  onEdit: (id: string, content: string, ruleIds?: string[]) => void;
  onDelete: (id: string) => void;
  allRules: Note[];
  /** Display name of user editing this note, or null if nobody is */
  editLockedBy: string | null;
  onRequestBeginEdit: (id: string) => Promise<boolean>;
  onEndEdit: (id: string) => void;
}

export default function NoteCard({
  note,
  currentAuthor,
  onEdit,
  onDelete,
  allRules,
  editLockedBy,
  onRequestBeginEdit,
  onEndEdit,
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

  const hasDisplayName = currentAuthor.trim().length > 0;
  const lockedByOther =
    editLockedBy !== null &&
    editLockedBy.trim().toLowerCase() !==
      currentAuthor.trim().toLowerCase();

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

  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;

  useEffect(() => {
    return () => {
      if (isEditingRef.current) onEndEdit(note.id);
    };
  }, [note.id, onEndEdit]);

  const toggleEditRule = (ruleId: string) => {
    setEditRuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
  };

  const handleEdit = async () => {
    const ok = await onRequestBeginEdit(note.id);
    if (!ok) return;
    setEditContent(note.content);
    if (note.type === "Example") {
      setEditRuleIds(new Set(note.ruleIds ?? []));
    }
    setIsEditing(true);
  };

  const handleCancel = () => {
    onEndEdit(note.id);
    setIsEditing(false);
    setEditContent(note.content);
    if (note.type === "Example") {
      setEditRuleIds(new Set(note.ruleIds ?? []));
    }
  };

  const handleSave = () => {
    const trimmed = editContent.trim();
    if (!trimmed) {
      onEndEdit(note.id);
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
        onEndEdit(note.id);
        setIsEditing(false);
        return;
      }
      onEdit(note.id, trimmed, nextIds);
    } else {
      if (contentSame) {
        onEndEdit(note.id);
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

  const contentMaxLength = note.type === "Feature" ? 4000 : 600;

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

  return (
    <div
      className={`card${isEditing ? " editing" : ""}`}
      data-id={note.id}
      data-type={note.type}
      data-ai={note.isAi ? "true" : undefined}
    >
      <div className="card-header">
        <span className="card-type">{note.type.toUpperCase()}</span>
        {isEditing ? (
          <span className="card-id">#{num}</span>
        ) : canDelete ? (
          <button
            type="button"
            className="card-delete-x"
            onClick={handleDelete}
            aria-label="Delete this note"
            title="Delete"
          >
            ×
          </button>
        ) : (
          <span className="card-id">#{num}</span>
        )}
      </div>

      <div className="card-content-block">
        {note.isAi && (
          <span className="card-ai-mark" title="AI-generated" aria-label="AI-generated">
            AI
          </span>
        )}
        {note.type === "Feature" ? (
          <pre className="card-content card-content--gherkin">{note.content}</pre>
        ) : (
          <div className="card-content card-content--markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={{
                a: (props) => (
                  <a
                    {...props}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                ),
                img: ({ node: _n, ...props }) => (
                  <img {...props} alt={props.alt ?? ""} className="card-md-img" />
                ),
              }}
            >
              {note.content}
            </ReactMarkdown>
          </div>
        )}
      </div>

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
        <div className="card-edit-main">
          {isEditing && note.isAi && (
            <span className="card-ai-mark" title="AI-generated" aria-label="AI-generated">
              AI
            </span>
          )}
          <textarea
            ref={textareaRef}
            className="card-textarea"
            maxLength={contentMaxLength}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>

      <div className="card-footer">
        <div className="card-meta">
          <span>{note.author}</span>
          {isOwner && <span className="owner-badge">you</span>}
        </div>
        <div className="card-actions">
          {!isEditing && (
            <button
              type="button"
              className="card-btn edit-btn"
              onClick={() => void handleEdit()}
              disabled={!hasDisplayName || lockedByOther}
              title={
                !hasDisplayName
                  ? "Set your display name in the sidebar to edit notes."
                  : lockedByOther
                    ? `${editLockedBy} is editing`
                    : "Edit this note"
              }
            >
              Edit
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
