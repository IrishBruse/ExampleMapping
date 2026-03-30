interface HeaderProps {
  connected: boolean;
  noteCount: number;
  currentAuthor: string;
  onAuthorChange: (author: string) => void;
  userColor: string;
  onUserColorChange: (color: string) => void;
}

export default function Header({
  connected,
  noteCount,
  currentAuthor,
  onAuthorChange,
  userColor,
  onUserColorChange,
}: HeaderProps) {
  return (
    <header>
      <div id="status-dot" className={connected ? "online" : ""} />
      <h1>EXAMPLE MAPPING</h1>
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
      <div className="header-author header-user-color">
        <label htmlFor="user-color-input" className="header-author-label">
          Color
        </label>
        <input
          type="color"
          id="user-color-input"
          className="header-user-color-input"
          value={userColor}
          onChange={(e) => onUserColorChange(e.target.value)}
          title="Your color on stickies and in Connected"
          aria-label="Your accent color"
        />
      </div>
      <span id="note-count">
        {noteCount} note{noteCount !== 1 ? "s" : ""}
      </span>
    </header>
  );
}
