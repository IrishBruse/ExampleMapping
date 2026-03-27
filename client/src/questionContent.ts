/** Appended after the question body; not shown when the markdown is rendered. */
export const QUESTION_ANSWER_SEPARATOR = "\n## Answer\n";

export function splitQuestionContent(content: string): {
    question: string;
    answer: string;
} {
    const idx = content.indexOf(QUESTION_ANSWER_SEPARATOR);
    if (idx === -1) {
        return { question: content.trimEnd(), answer: "" };
    }
    return {
        question: content.slice(0, idx).trimEnd(),
        answer: content.slice(idx + QUESTION_ANSWER_SEPARATOR.length).trim(),
    };
}

/** Empty answer removes the marker and leaves only the question text. */
export function mergeQuestionContent(question: string, answer: string): string {
    const q = question.trimEnd();
    const a = answer.trim();
    if (!a) return q;
    return q + QUESTION_ANSWER_SEPARATOR + a;
}
