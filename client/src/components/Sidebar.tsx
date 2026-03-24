import { useState } from "react";
import type { NoteType } from "../types";

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
  onPost: (author: string, type: string, content: string) => void;
}

export default function Sidebar({
  currentAuthor,
  onAuthorChange,
  activeFilter,
  onFilterChange,
  onPost,
}: SidebarProps) {
  const [selectedType, setSelectedType] = useState<NoteType>("Story");
  const [content, setContent] = useState("");

  const canPost = currentAuthor.trim().length > 0 && content.trim().length > 0;

  const handlePost = () => {
    if (!canPost) return;
    onPost(currentAuthor, selectedType, content.trim());
    setContent("");
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
      </div>

      <div>
        <div className="field-label">Content</div>
        <textarea
          id="content-input"
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
    </aside>
  );
}
