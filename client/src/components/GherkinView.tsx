/** Read-only Gherkin / Cucumber feature text with light syntax styling (no YAML required). */

function lineKind(line: string): string {
  const t = line.trim();
  if (t === "") return "blank";
  if (t.startsWith("#")) return "comment";
  if (/^@[\w.-]+/.test(t)) return "tag";
  if (/^Feature:/.test(t)) return "feature";
  if (/^(Background|Scenario|Scenario Outline):/.test(t)) return "scenario";
  if (/^(Given|When|Then|And|But)\s/.test(t)) return "step";
  if (/^\|/.test(t.trimStart())) return "table";
  if (/^Examples:\s*$/.test(t)) return "examples";
  return "text";
}

export default function GherkinView({ source }: { source: string }) {
  const lines = source.split(/\r?\n/);
  return (
    <div className="gherkin-view" aria-label="Gherkin feature">
      {lines.map((line, i) => (
        <div key={i} className={`gherkin-line gherkin-line--${lineKind(line)}`}>
          {line.length === 0 ? "\u00a0" : line}
        </div>
      ))}
    </div>
  );
}
