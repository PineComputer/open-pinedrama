// FountainDiff (P5.4): the maker's file beside the Fountain drama-cli recorded, compared line by line by jsdiff
// (diffLines); each change, and each run of lines that came back as they were, is one group, so a click on a line
// marks it and what it became on the other side. AcceptInWords: the answer to the agent's question, in the maker's words.
import { diffLines } from "diff";
import { useMemo, useState } from "react";
import { api, useAction } from "./api.ts";
import { Button } from "./components/Button.tsx";
import { useT } from "./i18n.ts";
import { errorText } from "./labels.ts";

interface Line {
  n: number;
  text: string;
  group: number;
  changed: boolean;
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
      if (!part.added) yours.push({ n: yours.length + 1, text, group, changed: part.removed });
      if (!part.removed) theirs.push({ n: theirs.length + 1, text, group, changed: part.added });
    }
    if (part.removed) changed += lines.length;
    else if (!part.added) kept += lines.length;
  });
  return { yours, fountain: theirs, changed, kept };
}

function Pane({ id, title, tag, lines, picked, onPick }: { id: string; title: string; tag?: string; lines: Line[]; picked?: number; onPick: (group: number) => void }) {
  return (
    <section className="ds-fpane" aria-labelledby={id}>
      <h4 id={id}>
        {title} {tag && <span className="ds-tag">{tag}</span>}
      </h4>
      <ol>
        {lines.map((line) => (
          <li key={line.n}>
            <button type="button" aria-pressed={line.group === picked} className={line.changed ? "is-changed" : ""} onClick={() => onPick(line.group)}>
              <span className="n">{line.n}</span>
              <span className="tx">{line.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function FountainDiff({ original, fountain }: { original: string; fountain: string }) {
  const { t } = useT();
  const compared = useMemo(() => compare(original, fountain), [original, fountain]);
  const [picked, setPicked] = useState<number>();
  return (
    <div className="ds-fountaindiff">
      <p className="facts">{t("fountain.facts", { changed: compared.changed, kept: compared.kept })}</p>
      <div className="ds-fpanes">
        <Pane id="fountain-yours" title={t("fountain.yours")} lines={compared.yours} picked={picked} onPick={setPicked} />
        <Pane id="fountain-rewrite" title={t("fountain.rewrite")} tag="screenplay.fountain" lines={compared.fountain} picked={picked} onPick={setPicked} />
      </div>
    </div>
  );
}

/** The maker's answer to the rewrite: accepted, or sent back with what to change; either way in their own words. */
export function AcceptInWords({ reviewId, onSent }: { reviewId: string; onSent?: () => void }) {
  const { t } = useT();
  const [words, setWords] = useState("");
  const send = useAction(async () => {
    await api(`/api/reviews/${reviewId}/decision`, { method: "POST", json: { items: [], words: words.trim() } });
    onSent?.();
  });
  const ready = words.trim().length > 0 && !send.busy;
  return (
    <div className="ds-faccept">
      <label className="label" htmlFor="fountain-words">
        {t("fountain.words")}
      </label>
      <textarea id="fountain-words" placeholder={t("fountain.wordsHint")} value={words} onChange={(event) => setWords(event.target.value)} />
      <div className="acts">
        <Button variant="outline" icon="arrow-counter-clockwise" disabled={!ready} onClick={() => void send.run()}>
          {t("fountain.sendBack")}
        </Button>
        <Button variant="default" icon="check" disabled={!ready} onClick={() => void send.run()}>
          {t("fountain.accept")}
        </Button>
      </div>
      <small className="reason">{send.error !== undefined ? errorText(send.error, t) : t(ready ? "fountain.recorded" : "fountain.needWords")}</small>
    </div>
  );
}
