import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useId,
} from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import type { Note } from "../types";
import { mergeQuestionContent, splitQuestionContent } from "../questionContent";

const MARKDOWN_COMPONENTS = {
  a: (props: React.ComponentProps<"a">) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
  img: ({
    node: _n,
    ...props
  }: React.ComponentProps<"img"> & { node?: unknown }) => (
    <img {...props} alt={props.alt ?? ""} className="card-md-img" />
  ),
};

interface NoteCardProps {
  note: Note;
  currentAuthor: string;
  onEdit: (id: string, content: string, ruleIds?: string[]) => void;
  onDelete: (id: string) => void;
  allRules: Note[];
  /** Edit lock holder (name + color), or null if nobody is editing */
  editLock: { lockedBy: string; color: string } | null;
  /** This client’s chosen color (outline while you edit) */
  userColor: string;
  onRequestBeginEdit: (id: string) => Promise<boolean>;
  onEndEdit: (id: string) => void;
}

export default function NoteCard({
  note,
  currentAuthor,
  onEdit,
  onDelete,
  allRules,
  editLock,
  userColor,
  onRequestBeginEdit,
  onEndEdit,
}: NoteCardProps) {
  const [readerOpen, setReaderOpen] = useState(false);
  const expandBtnRef = useRef<HTMLButtonElement>(null);
  const answerBtnRef = useRef<HTMLButtonElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  /** Question cards: only the answer section (below the marker) while editing */
  const [answerDraft, setAnswerDraft] = useState("");
  const [editRuleIds, setEditRuleIds] = useState<Set<string>>(
    () => new Set(note.type === "Example" ? note.ruleIds ?? [] : []),
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const questionAnswerRef = useRef<HTMLTextAreaElement>(null);
  const answerFieldId = useId();

  const isOwner =
    note.author.trim().toLowerCase() === currentAuthor.trim().toLowerCase();
  const isAgentAuthor =
    note.author.trim().toLowerCase() === "agent";
  const canDelete = isOwner || note.isAi === true || isAgentAuthor;

  const hasDisplayName = currentAuthor.trim().length > 0;
  const lockedByOther =
    editLock !== null &&
    editLock.lockedBy.trim().toLowerCase() !==
      currentAuthor.trim().toLowerCase();

  const editorOutlineColor = isEditing
    ? userColor
    : lockedByOther
      ? editLock.color
      : undefined;

  const [, num] = note.id.split("_");

  const closeReader = useCallback(() => {
    setReaderOpen(false);
    expandBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!readerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeReader();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readerOpen, closeReader]);

  useEffect(() => {
    if (!readerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [readerOpen]);

  useEffect(() => {
    if (!isEditing) return;
    const el =
      note.type === "Question" ? questionAnswerRef.current : textareaRef.current;
    if (el) {
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
    }
  }, [isEditing, note.type]);

  useEffect(() => {
    if (note.type === "Question" && isEditing) return;
    setEditContent(note.content);
  }, [note.content, note.type, isEditing]);

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
    if (note.type === "Question") {
      setAnswerDraft(splitQuestionContent(note.content).answer);
    } else {
      setEditContent(note.content);
      if (note.type === "Example") {
        setEditRuleIds(new Set(note.ruleIds ?? []));
      }
    }
    setIsEditing(true);
  };

  const handleCancel = () => {
    onEndEdit(note.id);
    setIsEditing(false);
    setEditContent(note.content);
    if (note.type === "Question") {
      setAnswerDraft(splitQuestionContent(note.content).answer);
      requestAnimationFrame(() => answerBtnRef.current?.focus());
    }
    if (note.type === "Example") {
      setEditRuleIds(new Set(note.ruleIds ?? []));
    }
  };

  const handleSave = () => {
    if (note.type === "Question") {
      const { question } = splitQuestionContent(note.content);
      const merged = mergeQuestionContent(question, answerDraft);
      if (merged.length > contentMaxLength) {
        window.alert(
          `This note is limited to ${contentMaxLength} characters (question + answer).`,
        );
        return;
      }
      if (merged === note.content) {
        onEndEdit(note.id);
        setIsEditing(false);
        requestAnimationFrame(() => answerBtnRef.current?.focus());
        return;
      }
      onEdit(note.id, merged);
      setIsEditing(false);
      requestAnimationFrame(() => answerBtnRef.current?.focus());
      return;
    }

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

  const contentMaxLength = 600;

  const isQuestion = note.type === "Question";
  const { question: questionPart, answer: answerPart } = useMemo(
    () =>
      isQuestion
        ? splitQuestionContent(note.content)
        : { question: "", answer: "" },
    [isQuestion, note.content],
  );

  const questionCharsLeft = isQuestion
    ? contentMaxLength -
      mergeQuestionContent(questionPart, answerDraft).length
    : 0;

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
      className={`card${isEditing ? " editing" : ""}${editorOutlineColor ? " card--editor-ring" : ""}${isQuestion ? " card--question" : ""}`}
      style={
        editorOutlineColor
          ? ({
              ["--editor-ring-color" as string]: editorOutlineColor,
            } as React.CSSProperties)
          : undefined
      }
      data-id={note.id}
      data-type={note.type}
      data-ai={note.isAi ? "true" : undefined}
    >
      <div className="card-header">
        <span className="card-type">{note.id}</span>
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

      {isQuestion ? (
        <div className="card-question-wrap">
          <div className="card-question-scroll">
            {note.isAi && !isAgentAuthor && (
              <span
                className="card-ai-mark"
                title="AI-generated"
                aria-label="AI-generated"
              >
                AI
              </span>
            )}
            <div className="card-content card-content--markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={MARKDOWN_COMPONENTS}
              >
                {questionPart}
              </ReactMarkdown>
            </div>
            {!isEditing && answerPart ? (
              <>
                <div className="card-question-answer-label">Answer</div>
                <div className="card-content card-content--markdown card-question-answer-md">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    components={MARKDOWN_COMPONENTS}
                  >
                    {answerPart}
                  </ReactMarkdown>
                </div>
              </>
            ) : null}
          </div>
          {isEditing && (
            <div className="card-question-answer-edit">
              {lockedByOther && editLock && (
                <p
                  className="card-question-lock-hint card-question-lock-hint--inline"
                  style={
                    {
                      ["--lock-accent" as string]: editLock.color,
                    } as React.CSSProperties
                  }
                >
                  <span className="card-question-lock-dot" aria-hidden />
                  <span>
                    <strong>{editLock.lockedBy}</strong> is answering — only one
                    person can edit at a time.
                  </span>
                </p>
              )}
              <label
                className="card-question-answer-label"
                htmlFor={answerFieldId}
              >
                Your answer
              </label>
              <textarea
                id={answerFieldId}
                ref={questionAnswerRef}
                className="card-question-answer-textarea card-question-answer-textarea--inline"
                value={answerDraft}
                onChange={(e) => setAnswerDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add your answer…"
                rows={3}
                aria-label="Your answer"
              />
              <p className="card-question-answer-hint">
                {questionCharsLeft < 0
                  ? `${-questionCharsLeft} characters over limit — shorten to save`
                  : `${questionCharsLeft} characters left · ⌘↵ save · Esc cancel`}
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="card-content-block">
            {note.isAi && !isAgentAuthor && (
              <span
                className="card-ai-mark"
                title="AI-generated"
                aria-label="AI-generated"
              >
                AI
              </span>
            )}
            <div className="card-content card-content--markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={MARKDOWN_COMPONENTS}
              >
                {note.content}
              </ReactMarkdown>
            </div>
          </div>

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
              {isEditing && note.isAi && !isAgentAuthor && (
                <span
                  className="card-ai-mark"
                  title="AI-generated"
                  aria-label="AI-generated"
                >
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
        </>
      )}

      <div
        className={`card-footer${isQuestion ? " card-footer--question" : ""}`}
      >
        <div className="card-meta">
          <span>{note.author}</span>
          {isOwner && <span className="owner-badge">you</span>}
        </div>
        <div className="card-actions">
          {!isEditing && (
            <>
              <button
                ref={expandBtnRef}
                type="button"
                className="card-btn expand-btn"
                onClick={() => setReaderOpen(true)}
                title="Open in a larger view for reading"
                aria-label="Expand note for reading"
              >
                Expand
              </button>
              {isQuestion ? (
                <button
                  ref={answerBtnRef}
                  type="button"
                  className="card-btn edit-btn"
                  onClick={() => void handleEdit()}
                  disabled={!hasDisplayName || lockedByOther}
                  title={
                    !hasDisplayName
                      ? "Set your display name in the toolbar to answer."
                      : lockedByOther && editLock
                        ? `${editLock.lockedBy} is answering`
                        : "Add or edit the answer"
                  }
                >
                  Answer
                </button>
              ) : (
                <button
                  type="button"
                  className="card-btn edit-btn"
                  onClick={() => void handleEdit()}
                  disabled={!hasDisplayName || lockedByOther}
                  title={
                    !hasDisplayName
                      ? "Set your display name in the toolbar to edit notes."
                      : lockedByOther && editLock
                        ? `${editLock.lockedBy} is editing`
                        : "Edit this note"
                  }
                >
                  Edit
                </button>
              )}
            </>
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
                {note.type === "Question" ? "Save answer" : "Save"}
              </button>
              <button type="button" className="card-btn cancel-btn" onClick={handleCancel}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {readerOpen &&
        createPortal(
          <div
            className="gherkin-modal-backdrop note-read-modal-backdrop"
            role="presentation"
            onClick={closeReader}
          >
            <div
              className="gherkin-modal note-read-modal"
              data-type={note.type}
              role="dialog"
              aria-modal="true"
              aria-labelledby="note-read-modal-title"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="gherkin-modal-header">
                <h2 id="note-read-modal-title" className="gherkin-modal-title">
                  {note.id}
                </h2>
                <button
                  type="button"
                  className="gherkin-modal-close"
                  onClick={closeReader}
                  aria-label="Close expanded view"
                >
                  ×
                </button>
              </header>
              <div className="gherkin-modal-body">
                <div className="gherkin-modal-scroll note-read-modal-scroll">
                  {note.type === "Question" ? (
                    <div className="note-read-question">
                      <div className="card-content card-content--markdown">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkBreaks]}
                          components={MARKDOWN_COMPONENTS}
                        >
                          {questionPart}
                        </ReactMarkdown>
                      </div>
                      {answerPart ? (
                        <>
                          <p className="card-question-answer-label card-question-answer-label--read">
                            Answer
                          </p>
                          <div className="card-content card-content--markdown">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkBreaks]}
                              components={MARKDOWN_COMPONENTS}
                            >
                              {answerPart}
                            </ReactMarkdown>
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : (
                    <div className="card-content card-content--markdown">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkBreaks]}
                        components={MARKDOWN_COMPONENTS}
                      >
                        {note.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

    </div>
  );
}
