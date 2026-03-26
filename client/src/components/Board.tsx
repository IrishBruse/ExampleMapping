import { useRef, useEffect, useMemo } from "react";
import type { Note } from "../types";
import NoteCard from "./NoteCard";

interface BoardProps {
  notes: Map<string, Note>;
  activeFilter: string;
  currentAuthor: string;
  onEdit: (id: string, content: string, ruleIds?: string[]) => void;
  onDelete: (id: string) => void;
}

function sortById(a: Note, b: Note): number {
  const [aT, aN] = a.id.split("_");
  const [bT, bN] = b.id.split("_");
  if (aT !== bT) return aT.localeCompare(bT);
  return parseInt(aN, 10) - parseInt(bN, 10);
}

function isAgentAuthor(note: Note): boolean {
  return note.author.trim().toLowerCase() === "agent";
}

export default function Board({
  notes,
  activeFilter,
  currentAuthor,
  onEdit,
  onDelete,
}: BoardProps) {
  const boardRef = useRef<HTMLElement>(null);
  const prevCountRef = useRef(0);

  const visible = useMemo(() => {
    const list = [...notes.values()];
    if (activeFilter === "All") return list;
    if (activeFilter === "Agent") return list.filter(isAgentAuthor);
    return list.filter((n) => n.type === activeFilter);
  }, [notes, activeFilter]);

  const stories = useMemo(
    () => visible.filter((n) => n.type === "Story").sort(sortById),
    [visible],
  );
  const rules = useMemo(
    () => visible.filter((n) => n.type === "Rule").sort(sortById),
    [visible],
  );
  const examples = useMemo(
    () => visible.filter((n) => n.type === "Example").sort(sortById),
    [visible],
  );
  const questions = useMemo(
    () => visible.filter((n) => n.type === "Question").sort(sortById),
    [visible],
  );

  const allRules = useMemo(
    () => [...notes.values()].filter((n) => n.type === "Rule").sort(sortById),
    [notes],
  );

  const useGroupedLayout =
    activeFilter === "All" &&
    (stories.length > 0 ||
      rules.length > 0 ||
      examples.length > 0 ||
      questions.length > 0);

  const totalVisible = visible.length;

  useEffect(() => {
    if (totalVisible > prevCountRef.current && boardRef.current) {
      const lastCard = boardRef.current.querySelector(".card:last-of-type");
      if (lastCard) {
        lastCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
    prevCountRef.current = totalVisible;
  }, [totalVisible]);

  const renderCard = (note: Note) => (
    <NoteCard
      key={note.id}
      note={note}
      currentAuthor={currentAuthor}
      onEdit={onEdit}
      onDelete={onDelete}
      allRules={allRules}
    />
  );

  const examplesLinkedToRule = (ruleId: string) =>
    examples.filter((ex) => (ex.ruleIds ?? []).includes(ruleId));

  return (
    <main id="board" ref={boardRef}>
      {totalVisible === 0 ? (
        <div id="empty-msg">
          {activeFilter === "Agent"
            ? "No notes by agent yet."
            : "No notes yet — post the first one ↗"}
        </div>
      ) : useGroupedLayout ? (
        <>
          {stories.length > 0 && (
            <section className="board-section board-section--story" aria-label="Stories">
              <h2 className="board-section-title">Story</h2>
              <div className="board-section-cards">{stories.map(renderCard)}</div>
            </section>
          )}
          {(rules.length > 0 || examples.length > 0) && (
            <section
              className="board-section board-section--rule-example"
              aria-label="Rules and examples"
            >
              <h2 className="board-section-title board-section-title--rule-example">
                Rules &amp; examples
              </h2>
              {rules.length === 0 ? (
                <div className="board-rule-rows board-rule-rows--examples-only">
                  <p className="board-column-empty board-column-empty--block">
                    No rules yet — add a rule, then link examples to it.
                  </p>
                  {examples.length > 0 && (
                    <div className="board-section-cards">{examples.map(renderCard)}</div>
                  )}
                </div>
              ) : (
                <div className="board-rule-rows">
                  {rules.map((rule) => {
                    const rowExamples = examplesLinkedToRule(rule.id);
                    return (
                      <div key={rule.id} className="board-rule-row" aria-label={`Rule ${rule.id}`}>
                        <div className="board-rule-row__rule">{renderCard(rule)}</div>
                        <div className="board-rule-row__examples">
                          {rowExamples.length === 0 ? (
                            <p className="board-rule-row__empty">
                              No example linked to this rule yet.
                            </p>
                          ) : (
                            rowExamples.map((ex) => (
                              <NoteCard
                                key={`${rule.id}-${ex.id}`}
                                note={ex}
                                currentAuthor={currentAuthor}
                                onEdit={onEdit}
                                onDelete={onDelete}
                                allRules={allRules}
                              />
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
          {questions.length > 0 && (
            <section className="board-section board-section--question" aria-label="Questions">
              <h2 className="board-section-title">Questions</h2>
              <div className="board-section-cards">{questions.map(renderCard)}</div>
            </section>
          )}
        </>
      ) : (
        [...visible].sort(sortById).map(renderCard)
      )}
    </main>
  );
}
