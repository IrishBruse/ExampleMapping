interface HeaderProps {
  connected: boolean;
  noteCount: number;
  currentAuthor: string;
  onAuthorChange: (author: string) => void;
}

export default function Header({
  connected,
  noteCount,
  currentAuthor,
  onAuthorChange,
}: HeaderProps) {
  return (
    <header>
      <div id="status-dot" className={connected ? "online" : ""} />
      <h1>MAPPING TOOL</h1>
      <div className="header-author">
        <label htmlFor="author-input" className="header-author-label">
          Name
        </label>
        <input
          type="text"
          id="author-input"
          className="header-author-input"
          placeholder="e.g. Alice"
          maxLength={32}
          value={currentAuthor}
          onChange={(e) => onAuthorChange(e.target.value)}
          autoComplete="nickname"
        />
      </div>
      <span id="note-count">
        {noteCount} note{noteCount !== 1 ? "s" : ""}
      </span>
    </header>
  );
}
