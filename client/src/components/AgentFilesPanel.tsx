import { useState, useMemo, useEffect } from "react";
import type { AgentFilesPayload } from "../types";

interface AgentFilesPanelProps {
  payload: AgentFilesPayload | null;
}

export default function AgentFilesPanel({ payload }: AgentFilesPanelProps) {
  const [selectedRel, setSelectedRel] = useState<string | null>(null);

  const selected = useMemo(() => {
    if (!payload?.enabled || !selectedRel) return null;
    return payload.files.find((f) => f.relPath === selectedRel) ?? null;
  }, [payload, selectedRel]);

  useEffect(() => {
    if (!payload?.enabled || !selectedRel) return;
    if (!payload.files.some((f) => f.relPath === selectedRel)) {
      setSelectedRel(null);
    }
  }, [payload, selectedRel]);

  if (!payload) {
    return (
      <div className="agent-files-section">
        <div className="field-label">AI rules</div>
        <p className="agent-files-empty">Loading…</p>
      </div>
    );
  }

  if (!payload.enabled) {
    return (
      <div className="agent-files-section">
        <div className="field-label">AI rules</div>
        <p className="agent-files-disabled">
          The <code className="agent-files-code">agent</code> folder under your
          output directory could not be read. Check{" "}
          <code className="agent-files-code">outputDir</code> in{" "}
          <code className="agent-files-code">config.json</code> and filesystem
          permissions.
        </p>
      </div>
    );
  }

  return (
    <div className="agent-files-section">
      <div className="field-label">AI rules</div>
      <p className="agent-files-path" title={payload.watchPath}>
        {payload.label}
        <span className="agent-files-count">{payload.files.length}</span>
      </p>
      {payload.files.length === 0 ? (
        <p className="agent-files-empty">Waiting for files…</p>
      ) : (
        <>
          <ul className="agent-files-list" role="listbox" aria-label="AI rule files">
            {payload.files.map((f) => (
              <li key={f.relPath}>
                <button
                  type="button"
                  className={`agent-file-btn${selectedRel === f.relPath ? " agent-file-btn--active" : ""}`}
                  onClick={() => setSelectedRel(f.relPath)}
                >
                  {f.relPath}
                </button>
              </li>
            ))}
          </ul>
          {selected && (
            <div className="agent-file-preview">
              {selected.truncated && (
                <p className="agent-file-truncated">Preview truncated (large file).</p>
              )}
              <pre className="agent-file-pre">{selected.content}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
