# User-Facing Improvements

## High Impact

1. **Fix Gherkin syntax highlighting on board cards** — `GherkinView` exists but Feature note cards render as plain `<pre>` text instead of using it. Wire it up in `NoteCard.tsx`.

2. **Enable Feature note creation from the UI** — The Feature type exists in the server and has CSS/limits defined, but it's excluded from the sidebar composer. Add it so users don't have to rely on the agent filesystem.

3. **Add a README / onboarding experience** — No documentation exists. New users won't know what Example Mapping is, what the note types mean, or how to use the tool.

4. **Keyboard shortcut hints** — `Ctrl+Enter` to post and `Escape` to cancel are undocumented. Show these in the UI (e.g., placeholder text or tooltip on the Post button).

## Medium Impact

5. **Undo/redo for note operations** — No way to recover a deleted note. At minimum, a brief "Undo delete" toast/snackbar.

6. **Search/filter by content** — Only type-based filtering exists. A text search across notes would help as boards grow.

7. **Board export/share** — No way to export the board state (e.g., as Markdown summary or JSON). Useful for documenting BDD sessions.

8. **Mobile/responsive improvements** — The 300px sidebar and 280px card widths will break on small screens. The only breakpoint is at 720px.

9. **Dark/light theme toggle** — Only a dark theme exists. Some users prefer light mode, especially in bright meeting rooms.

## Lower Impact

11. **Note ordering/sorting** — Notes appear in creation order. Allowing drag-to-reorder or sort by author/date would help organize large boards.

12. **Timestamps on cards** — Show when a note was created/last edited. Useful for session review.

13. **Bulk operations** — "Clear all notes" or "Archive session" to start fresh without manually deleting files.

14. **User presence indicators on cards** — Show which users are viewing (not just editing) a note.

15. **Connection status feedback** — The status dot exists but there's no toast or notification when you disconnect/reconnect, which could mean lost changes.
