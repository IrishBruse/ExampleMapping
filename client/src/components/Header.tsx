interface HeaderProps {
  connected: boolean;
  noteCount: number;
}

export default function Header({ connected, noteCount }: HeaderProps) {
  return (
    <header>
      <div id="status-dot" className={connected ? "online" : ""} />
      <h1>MAPPING TOOL</h1>
      <span id="note-count">
        {noteCount} note{noteCount !== 1 ? "s" : ""}
      </span>
    </header>
  );
}
