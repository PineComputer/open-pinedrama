// The Fountain review (P5.4), ported from design/screens.js: the maker's file beside the Fountain drama-cli recorded,
// compared line by line by jsdiff (diffLines). Each change, and each run of lines that came back as they were, is one
// group, so a click on a line marks it and what it became on the other side. The Fountain is printed as screenplay
// lines (fountain-js), each tied to the file's line it was written on. AcceptInWords: the answer to the agent's
// question, in the maker's words.
import { diffLines } from "diff";
import { Fountain } from "fountain-js";
import { useMemo, useState } from "react";
import { api, useAction } from "./api.ts";
import { fountainLines } from "./fountainLines.ts";
import { Icon } from "./icons.tsx";
import { useT } from "./i18n.ts";
import { errorText } from "./labels.ts";

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

/** Episodes ("# Episode 1" sections, as the upload's format tip asks) and scene headings, as fountain-js reads them. */
function counts(fountain: string): { episodes: number; scenes: number } {
  const tokens = new Fountain().parse(fountain, true).tokens;
  return {
    episodes: tokens.filter((token) => token.type === "section" && token.depth === 1).length,
    scenes: tokens.filter((token) => token.type === "scene_heading").length,
  };
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

/** The rewrite as it waits for the maker: what changed, the two sides, and the answer in their words. */
export function FountainReview({ original, fountain, reviewId }: { original: string; fountain: string; reviewId: string }) {
  const { t } = useT();
  const compared = useMemo(() => compare(original, fountain), [original, fountain]);
  const { episodes, scenes } = useMemo(() => counts(fountain), [fountain]);
  return (
    <div className="frev">
      <div className="frevhead">
        <div className="grow">
          <span className="kick">{t("fountain.kick")}</span>
          <h2>{t("fountain.title")}</h2>
          <p className="muted">
            {t("fountain.facts", { changed: compared.changed, kept: compared.kept })} {t("fountain.lede")}
          </p>
        </div>
        <div className="facts">
          <span>
            <b>{episodes}</b> {t(episodes === 1 ? "fountain.episode" : "fountain.episodes")}
          </span>
          <span>
            <b>{scenes}</b> {t(scenes === 1 ? "fountain.scene" : "fountain.scenes")}
          </span>
        </div>
      </div>
      <Panes compared={compared} fountain={fountain} />
      <AcceptInWords reviewId={reviewId} />
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
    <div className="faccept">
      <textarea aria-label={t("fountain.words")} placeholder={t("fountain.wordsHint")} value={words} onChange={(event) => setWords(event.target.value)} />
      <div className="fbtns">
        <button type="button" className="btn" disabled={!ready} onClick={() => void send.run()}>
          <Icon name="arrow-counter-clockwise" className="ic" />
          {t("fountain.sendBack")}
        </button>
        <button type="button" className="btn primary" disabled={!ready} onClick={() => void send.run()}>
          <Icon name="check" className="ic" />
          {t("fountain.accept")}
        </button>
      </div>
      <small className="muted">{send.error !== undefined ? errorText(send.error, t) : t(ready ? "fountain.recorded" : "fountain.needWords")}</small>
    </div>
  );
}
