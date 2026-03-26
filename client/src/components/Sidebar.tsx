import { useState, useEffect } from "react";
import type { Note, NoteType } from "../types";

const NOTE_TYPES: { type: NoteType; label: string }[] = [
  { type: "Story", label: "Story" },
  { type: "Rule", label: "Rule" },
  { type: "Example", label: "Example" },
  { type: "Question", label: "Question" },
];

const FILTERS = ["All", "Story", "Rule", "Example", "Question"];

interface SidebarProps {
  currentAuthor: string;
  onAuthorChange: (author: string) => void;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  onPost: (
    author: string,
    type: string,
    content: string,
    ruleIds?: string[],
  ) => void;
  connectedUsers: string[];
  /** Rules available when posting an Example */
  rules: Note[];
}

export default function Sidebar({
  currentAuthor,
  onAuthorChange,
  activeFilter,
  onFilterChange,
  onPost,
  connectedUsers,
  rules,
}: SidebarProps) {
  const [selectedType, setSelectedType] = useState<NoteType>("Story");
  const [content, setContent] = useState("");
  const [exampleRuleIds, setExampleRuleIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (selectedType !== "Example") setExampleRuleIds(new Set());
  }, [selectedType]);

  const canPost =
    currentAuthor.trim().length > 0 &&
    content.trim().length > 0 &&
    (selectedType !== "Example" ||
      (rules.length > 0 && exampleRuleIds.size > 0));

  const toggleExampleRule = (ruleId: string) => {
    setExampleRuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
  };

  const handlePost = () => {
    if (!canPost) return;
    if (selectedType === "Example") {
      onPost(currentAuthor, selectedType, content.trim(), [...exampleRuleIds]);
    } else {
      onPost(currentAuthor, selectedType, content.trim());
    }
    setContent("");
    setExampleRuleIds(new Set());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canPost) {
      handlePost();
    }
  };

  return (
    <aside>
      <div>
        <div className="field-label">Your name</div>
        <input
          type="text"
          id="author-input"
          placeholder="e.g. Alice"
          maxLength={32}
          value={currentAuthor}
          onChange={(e) => onAuthorChange(e.target.value)}
        />
      </div>

      <hr className="divider" />

      <div>
        <div className="field-label">Note type</div>
        <div className="type-grid">
          {NOTE_TYPES.map(({ type, label }) => (
            <button
              key={type}
              className={`type-btn${selectedType === type ? " selected" : ""}`}
              data-type={type}
              onClick={() => setSelectedType(type)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="type-hint">
          <span className="type-hint-pair">Rule + Example</span> — pick which rules each example belongs to; one example can illustrate several rules.
        </p>
      </div>

      {selectedType === "Example" && (
        <div className="example-rules-field">
          <div className="field-label">Link to rules</div>
          {rules.length === 0 ? (
            <p className="example-rules-empty">Add at least one rule first, then choose it here.</p>
          ) : (
            <ul className="example-rules-list" role="group" aria-label="Rules this example illustrates">
              {rules.map((r) => {
                const [, num] = r.id.split("_");
                const checked = exampleRuleIds.has(r.id);
                return (
                  <li key={r.id}>
                    <label className="example-rule-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleExampleRule(r.id)}
                      />
                      <span className="example-rule-id">#{num}</span>
                      <span className="example-rule-preview">{r.content}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {selectedType === "Example" && rules.length > 0 && exampleRuleIds.size === 0 && (
            <p className="example-rules-required" role="status">
              Select at least one rule to post this example.
            </p>
          )}
        </div>
      )}

      <div>
        <div className="field-label">Content</div>
        <textarea
          id="content-input"
          className="compose-textarea"
          placeholder="Type your note… (Ctrl+Enter to post)"
          maxLength={600}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div id="char-count">{content.length} / 600</div>
      </div>

      <button id="post-btn" disabled={!canPost} onClick={handlePost}>
        POST NOTE
      </button>

      <hr className="divider" />

      <div>
        <div className="field-label">Filter board</div>
        <div className="filter-row">
          {FILTERS.map((filter) => (
            <button
              key={filter}
              className={`filter-chip${activeFilter === filter ? " active" : ""}`}
              onClick={() => onFilterChange(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <hr className="divider" />

      <div>
        <div className="field-label">
          Connected&nbsp;
          <span className="user-count">{connectedUsers.length}</span>
        </div>
        <ul className="user-list">
          {connectedUsers.length === 0 ? (
            <li className="user-list-empty">no one yet</li>
          ) : (
            connectedUsers.map((name) => (
              <li
                key={name}
                className={`user-list-item${name === currentAuthor ? " user-list-item--you" : ""}`}
              >
                <span className="user-dot" />
                {name}
                {name === currentAuthor && <span className="user-you-badge">you</span>}
              </li>
            ))
          )}
        </ul>
      </div>
    </aside>
  );
}
