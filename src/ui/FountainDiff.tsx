// The Fountain review (P5.4), ported from design/screens.js: the maker's file beside the Fountain drama-cli recorded,
// compared line by line by jsdiff (diffLines). Each change, and each run of lines that came back as they were, is one
// group, so a click on a line marks it and what it became on the other side. The Fountain is printed as screenplay
// lines (fountain-js), each tied to the file's line it was written on.
import { diffLines } from "diff";
import { useMemo, useState } from "react";
import { fountainLines } from "./fountainLines.ts";
import { useT } from "./i18n.ts";

interface Line {
  n: number;
  text: string;
  group: number;
}

/** Both sides as numbered lines, each in the group jsdiff's part gives it: a removal and the addition after it are one. */
export function compare(original: string, fountain: string): { yours: Line[]; fountain: Line[]; changed: number; kept: number } {
  const yours: Line[] = [];
  const theirs: Line[] = [];
  let group = -1;
  let changed = 0;
  let kept = 0;
  const parts = diffLines(original.replace(/\r/g, ""), fountain.replace(/\r/g, ""));
  parts.forEach((part, index) => {
    if (!(part.added && parts[index - 1]?.removed)) group++;
    const lines = part.value.replace(/\n$/, "").split("\n");
    for (const text of lines) {
      if (!part.added) yours.push({ n: yours.length + 1, text, group });
      if (!part.removed) theirs.push({ n: theirs.length + 1, text, group });
    }
    if (part.removed) changed += lines.length;
    else if (!part.added) kept += lines.length;
  });
  return { yours, fountain: theirs, changed, kept };
}

function Panes({ compared, fountain }: { compared: ReturnType<typeof compare>; fountain: string }) {
  const { t } = useT();
  const printed = useMemo(() => fountainLines(fountain), [fountain]);
  const [picked, setPicked] = useState<number>();
  return (
    <div className="fpanes">
      <section className="fpane" aria-labelledby="fountain-yours">
        <h4 id="fountain-yours">{t("fountain.yours")}</h4>
        <ol className="orig">
          {compared.yours.map((line) => (
            <li key={line.n}>
              <button type="button" className={line.group === picked ? "on" : ""} aria-pressed={line.group === picked} onClick={() => setPicked(line.group)}>
                <span>{line.n}</span>
                {line.text}
              </button>
            </li>
          ))}
        </ol>
      </section>
      <section className="fpane fnt" aria-labelledby="fountain-rewrite">
        <h4>
          <span id="fountain-rewrite">{t("fountain.rewrite")}</span>
          <span className="tag">screenplay.fountain</span>
        </h4>
        <div className="fdoc">
          {printed.map((line, index) => {
            if (line.gap) return <div key={index} className="gap" />;
            const group = line.source === undefined ? undefined : compared.fountain[line.source]?.group;
            if (group === undefined) return <div key={index} className={`fl ${line.el}`}>{line.text}</div>;
            return (
              <button key={index} type="button" className={`fl ${line.el}${group === picked ? " on" : ""}`} aria-pressed={group === picked} onClick={() => setPicked(group)}>
                {line.text}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function FountainDiff({ original, fountain }: { original: string; fountain: string }) {
  const compared = useMemo(() => compare(original, fountain), [original, fountain]);
  return <Panes compared={compared} fountain={fountain} />;
}
