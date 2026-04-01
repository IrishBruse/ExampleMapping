import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { AgentFileEntry, AgentFilesPayload } from "../types";
import GherkinView from "./GherkinView";

interface AgentFeaturePanelProps {
  payload: AgentFilesPayload;
  hasDisplayName: boolean;
  onSave: (relPath: string, content: string) => void;
}

export default function AgentFeaturePanel({
  payload,
  hasDisplayName,
  onSave,
}: AgentFeaturePanelProps) {
  const featureFiles = useMemo(
    () =>
      payload.files
        .filter((f) => f.name.toLowerCase().endsWith(".feature"))
        .sort((a, b) => a.relPath.localeCompare(b.relPath)),
    [payload.files],
  );

  const [selectedRel, setSelectedRel] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const openModalBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (featureFiles.length === 0) {
      setSelectedRel(null);
      return;
    }
    setSelectedRel((prev) => {
      if (prev && featureFiles.some((f) => f.relPath === prev)) return prev;
      return featureFiles[0].relPath;
    });
  }, [featureFiles]);

  const selected: AgentFileEntry | undefined = useMemo(
    () => featureFiles.find((f) => f.relPath === selectedRel),
    [featureFiles, selectedRel],
  );

  const isDirty = useMemo(() => {
    if (!editing || !selected) return false;
    return draft !== selected.content;
  }, [draft, editing, selected]);

  const requestCloseModal = useCallback(() => {
    if (editing && isDirty) {
      if (!window.confirm("Discard unsaved edits and close?")) return;
    }
    setModalOpen(false);
    setEditing(false);
    setDraft("");
    openModalBtnRef.current?.focus();
  }, [editing, isDirty]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestCloseModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, requestCloseModal]);

  useEffect(() => {
    if (!modalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modalOpen]);

  const startEdit = useCallback(() => {
    if (!selected || selected.truncated) return;
    setDraft(selected.content);
    setEditing(true);
  }, [selected]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setDraft("");
  }, []);

  const saveEdit = useCallback(() => {
    if (!selectedRel || !selected) return;
    const trimmed = draft.replace(/\s+$/, "");
    if (!trimmed) {
      window.alert("Content cannot be empty.");
      return;
    }
    onSave(selectedRel, trimmed.endsWith("\n") ? trimmed : trimmed + "\n");
    setEditing(false);
    setDraft("");
  }, [draft, onSave, selected, selectedRel]);

  const handleSelectChange = (rel: string) => {
    if (editing && isDirty) {
      if (!window.confirm("Discard unsaved edits and switch file?")) {
        return;
      }
    }
    setEditing(false);
    setDraft("");
    setSelectedRel(rel);
  };

  const openModal = useCallback(() => {
    setEditing(false);
    setDraft("");
    setModalOpen(true);
  }, []);

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) requestCloseModal();
  };

  if (!payload.enabled) {
    return (
      <div className="agent-feature-panel agent-feature-panel--disabled">
        <div className="field-label">Agent — Gherkin drafts</div>
        <p className="agent-feature-panel-msg">
          No <code className="agent-code">agent</code> folder in your output directory yet (default: <code className="agent-code">example-mapping/agent/</code>).
          The agent can place <code className="agent-code">*.feature</code> files there; they will appear here.
        </p>
      </div>
    );
  }

  if (featureFiles.length === 0) {
    return (
      <div className="agent-feature-panel">
        <div className="field-label">Agent — Gherkin drafts</div>
        <p className="agent-feature-panel-msg">
          No <code className="agent-code">.feature</code> files in the agent folder yet.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="agent-feature-panel">
        <div className="field-label">Agent — Gherkin drafts</div>
        <label className="agent-feature-select-wrap">
          <span className="sr-only">Select feature file</span>
          <select
            className="agent-feature-select"
            value={selectedRel ?? ""}
            onChange={(e) => handleSelectChange(e.target.value)}
          >
            {featureFiles.map((f) => (
              <option key={f.relPath} value={f.relPath}>
                {f.relPath}
                {f.truncated ? " (truncated)" : ""}
              </option>
            ))}
          </select>
        </label>

        {selected?.truncated && (
          <p className="agent-feature-truncated" role="status">
            Large file — preview may be truncated in the viewer.
          </p>
        )}

        <button
          ref={openModalBtnRef}
          type="button"
          className="agent-feature-open-btn"
          onClick={openModal}
        >
          Open viewer
        </button>
      </div>

      {typeof document !== "undefined" &&
        modalOpen &&
        selected &&
        createPortal(
          <div
            className="gherkin-modal-backdrop"
            role="presentation"
            onMouseDown={handleBackdropMouseDown}
          >
            <div
              className="gherkin-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="gherkin-modal-title"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <header className="gherkin-modal-header">
                <h2 id="gherkin-modal-title" className="gherkin-modal-title">
                  {selected.relPath}
                </h2>
                <button
                  type="button"
                  className="gherkin-modal-close"
                  onClick={requestCloseModal}
                  aria-label="Close viewer"
                >
                  ×
                </button>
              </header>

              {selected.truncated && (
                <p className="gherkin-modal-truncated" role="alert">
                  Preview truncated — edit the full file on disk or raise the server read limit.
                </p>
              )}

              <div className="gherkin-modal-body">
                {editing ? (
                  <textarea
                    className="gherkin-modal-textarea"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    spellCheck={false}
                    aria-label="Edit Gherkin feature"
                  />
                ) : (
                  <div className="gherkin-modal-scroll">
                    <GherkinView source={selected.content} />
                  </div>
                )}
              </div>

              <footer className="gherkin-modal-footer">
                {!editing ? (
                  <>
                    <button
                      type="button"
                      className="card-btn save-btn"
                      onClick={startEdit}
                      disabled={!!selected.truncated || !hasDisplayName}
                      title={
                        !hasDisplayName
                          ? "Set your display name to edit"
                          : selected.truncated
                            ? "Full file not loaded"
                            : "Edit this file"
                      }
                    >
                      Edit
                    </button>
                    <button type="button" className="card-btn cancel-btn" onClick={requestCloseModal}>
                      Close
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="card-btn save-btn"
                      onClick={saveEdit}
                      disabled={!hasDisplayName}
                    >
                      Save
                    </button>
                    <button type="button" className="card-btn cancel-btn" onClick={cancelEdit}>
                      Cancel edit
                    </button>
                    <button type="button" className="card-btn cancel-btn" onClick={requestCloseModal}>
                      Close
                    </button>
                  </>
                )}
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
