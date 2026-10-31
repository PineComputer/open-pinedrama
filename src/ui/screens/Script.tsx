import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { Decision, FileItem, ReviewView, ScreenplayVersion, ScriptPage, SubmissionView } from "../../shared/types.ts";
import { api, ApiError, useResource } from "../api.ts";
import { Missing } from "../components/Missing.tsx";
import { Segmented } from "../components/Segmented.tsx";
import { Submission, useSubmission } from "../components/Submission.tsx";
import { EXTRACTED, textName } from "../extract.ts";
import { fountainLines } from "../fountainLines.ts";
import { Icon, type IconName } from "../icons.tsx";
import { useT } from "../i18n.ts";
import { errorText } from "../labels.ts";
import { homeLink, useRoute } from "../place.ts";
import { Unreadable, isDocument, useDocumentText, useText } from "../viewing.tsx";

type View = "fountain" | "original" | "compare";

/**
 * The maker's decision on the version that waits (D62; Codex round 4, F3): Accept and Send back side by side as peers,
 * each opening the one field it needs, then one submission to the setup session, its state the shared Submission's
 * (D25). The engine takes a decision once under its submission id (reviews.ts, decide).
 */
function Decide({ reviewId, version }: { reviewId: string; version: string }) {
  const { t } = useT();
  const [form, setForm] = useState<"accept" | "back">();
  const [words, setWords] = useState("");
  const submission = useRef(crypto.randomUUID());
  const { sending, send, check } = useSubmission({
    submit: () =>
      api(`/api/reviews/${reviewId}/decision`, { method: "POST", json: { submissionId: submission.current, items: [], words: words.trim(), verdict: form === "accept" ? "approve" : "revise" } satisfies Decision }),
    // The engine's word on that submission (GET /api/submissions/:id): none means nothing was taken.
    taken: async () => {
      try {
        await api<SubmissionView>(`/api/submissions/${encodeURIComponent(submission.current)}`);
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return false;
        throw error;
      }
    },
  });
  const locked = sending.state !== "idle" && sending.state !== "failed";
  const pick = (next: "accept" | "back") => {
    if (next !== form) (setForm(next), setWords(""));
  };
  const to = t("script.setup");
  return (
    <div className="sdecide">
      <div className="fbtns" role="group" aria-label={t("script.decision", { version })}>
        <button type="button" className="btn sm" aria-pressed={form === "accept"} disabled={locked} onClick={() => pick("accept")}>
          <Icon name="check" className="ic" />
          {t("script.accept")}
        </button>
        <button type="button" className="btn sm" aria-pressed={form === "back"} disabled={locked} onClick={() => pick("back")}>
          <Icon name="arrow-counter-clockwise" className="ic" />
          {t("script.sendBack")}
        </button>
      </div>
      {form && (
        <>
          <label className="sfield">
            <span>{t(form === "accept" ? "script.acceptWords" : "script.backWhy", { version })}</span>
            <textarea readOnly={locked} placeholder={t(form === "accept" ? "script.acceptHint" : "script.backHint")} value={words} onChange={(event) => setWords(event.target.value)} />
          </label>
          <div className="fbtns">
            {sending.state === "idle" && (
              <>
                <button type="button" className="btn sm primary" disabled={words.trim().length < 3} onClick={() => void send()}>
                  {t(form === "accept" ? "script.acceptVersion" : "script.backVersion", { version })}
                </button>
                <button type="button" className="btn sm ghost" onClick={() => setForm(undefined)}>
                  {t("dialog.cancel")}
                </button>
              </>
            )}
            <Submission sending={sending} to={to} kept={t("script.kept")} onSend={() => void send()} onCheck={() => void check()} />
          </div>
        </>
      )}
    </div>
  );
}

/** One version's row in the history (GitHub's pull-request timeline): its label selects it, and its review.md opens under it. */
function VersionRow({ version, shown, onShow }: { version: ScreenplayVersion; shown: boolean; onShow: () => void }) {
  const { t } = useT();
  const review = useText(shown ? version.review : undefined).text;
  const question = version.question;
  const waiting = question?.state === "open";
  const decided = question?.words !== undefined && !waiting;
  return (
    <li className={(waiting ? "you" : "done") + (shown ? " sel" : "")}>
      <span className={`dot ${waiting ? "you" : "accepted"}`} />
      <div className="fill">
        <span>
          <button type="button" className="hver" aria-pressed={shown} title={t("script.showVersion", { version: version.version })} onClick={onShow}>
            {version.version}
          </button>
          {" · "}
          {decided ? t(question.verdict === "revise" ? "script.sentBack" : "script.accepted", { words: question.words! }) : waiting ? <b>{t("script.waiting")}</b> : t("script.recorded")}
        </span>
        {question?.decidedAt && <time>{question.decidedAt.slice(11, 16)}</time>}
        {shown && version.review && (
          <details className="whatchanged">
            <summary>{t("script.whatChanged", { version: version.version })}</summary>
            <pre className="document plain">{review ?? t("loading")}</pre>
          </details>
        )}
        {waiting && <Decide key={question.reviewId} reviewId={question.reviewId} version={version.version} />}
      </div>
    </li>
  );
}

/** One line of the original with the version's lines it became, as drama-cli's screenplay validate records it (short_drama D172). */
interface OriginalLine {
  line: number;
  text: string;
  to: number[];
  kinds: string[];
}

/** validate.json's lines when they name the version's lines; none for a version recorded before the line map (short_drama D172). */
function lineMap(text: string | undefined): OriginalLine[] | undefined {
  if (text === undefined) return undefined;
  const { lines } = JSON.parse(text) as { lines?: unknown[] };
  return lines?.every((entry) => typeof entry === "object" && entry !== null && Array.isArray((entry as { to?: unknown }).to)) ? (lines as OriginalLine[]) : undefined;
}

/**
 * VS Code's side-by-side diff, aligned by drama-cli's record (D62; Codex round 4, F5): each original line is one row with
 * every line of the version it became beside it (one to many, many to one), the lines between two of them in their own
 * row, a hatched filler where a side has none. The rows come from validate.json's `to`, never a diff of ours.
 */
function Compare({ original, fountain, map, name, version }: { original: string; fountain: string; map: OriginalLine[]; name: string; version: string }) {
  const { t } = useT();
  const [picked, setPicked] = useState<number>();
  const left = original.split("\n");
  const right = fountain.split("\n");
  const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => a + k);
  const rows: { a: number[]; b: number[]; entry?: OriginalLine }[] = [];
  let o = 0;
  let f = 0;
  for (const entry of map) {
    const first = entry.to.length ? Math.min(...entry.to) : f + 1;
    const a = range(o + 1, entry.line - 1);
    const b = entry.to.length ? range(f + 1, first - 1) : [];
    if (a.length || b.length) rows.push({ a, b });
    const fresh = entry.to.filter((m) => m > f);
    // An original line whose letters went only into lines already beside an earlier one (two lines joined into one)
    // joins that row, so each line of the version shows once.
    const last = rows.at(-1);
    if (entry.to.length && !fresh.length && !a.length && !b.length && last?.entry) last.a.push(entry.line);
    else rows.push({ a: [entry.line], b: fresh, entry });
    o = entry.line;
    if (entry.to.length) f = Math.max(f, ...entry.to);
  }
  if (o < left.length || f < right.length) rows.push({ a: range(o + 1, left.length), b: range(f + 1, right.length) });
  // A line came back as it was when it became one line with its very text; anything else is a change, tinted.
  const changed = (entry: OriginalLine) => entry.to.length !== 1 || right[entry.to[0] - 1]?.trim() !== entry.text;
  const lit = new Set(map.find((entry) => entry.line === picked)?.to ?? []);
  useEffect(() => {
    if (picked !== undefined) document.getElementById(`dr-${picked}`)?.scrollIntoView({ block: "nearest" });
  }, [picked]);
  return (
    <div className="diffed" aria-label={t("script.compareOf", { version })}>
      <div className="dhead">{name}</div>
      <div className="dhead">
        screenplay.fountain <span className="tag">{version}</span>
      </div>
      {rows.map(({ a, b, entry }, index) => (
        <div key={index} className="drowpair" id={entry ? `dr-${entry.line}` : undefined}>
          <div className="dcell a">
            {a.length ? (
              a.map((n) => (
                <button key={n} type="button" className={`drow${entry && changed(entry) ? " chg del" : ""}${picked === n ? " on" : ""}`} disabled={!entry} onClick={() => setPicked(n)}>
                  <span className="ln">{n}</span>
                  <span className="tx">{left[n - 1]}</span>
                </button>
              ))
            ) : (
              <div className="dfill" title={t("script.noOriginalLine")} />
            )}
          </div>
          <div className="dcell b">
            {b.length ? (
              b.map((m) => (
                <div key={m} className={`drow${entry && changed(entry) ? " chg add" : ""}${lit.has(m) ? " on" : ""}`}>
                  <span className="ln">{m}</span>
                  <span className="tx">{right[m - 1]}</span>
                </div>
              ))
            ) : (
              <div className="dfill" title={t(entry ? "script.noneCameBack" : "script.noFountainLine")} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** drama-cli's episode number in a scene number, #<episode>-<scene># (short_drama doc/drama-cli/write-a-screenplay.md). */
const episodeOfScene = (text: string) => text.match(/#(\d+)-\d+#\s*$/)?.[1];

/**
 * The setup's question about the upload before any version was recorded (a synopsis, not a screenplay, say): the agent's
 * own words in the history, in place of "not recorded", and the way to answer them.
 */
function AskedRow({ reviewId }: { reviewId: string }) {
  const { t } = useT();
  const { data } = useResource<ReviewView>(`/api/reviews/${reviewId}`, ["reviews"]);
  return (
    <li className="you">
      <span className="dot you" />
      <div className="fill">
        <b>{t("script.asked")}</b>
        <details className="whatchanged" open>
          <summary>{t("script.askedWords")}</summary>
          <pre className="document plain">{data?.question ?? t("loading")}</pre>
        </details>
        <Link className="btn sm" to="/r/$reviewId" params={{ reviewId }}>
          {t("script.answer")}
        </Link>
      </div>
    </li>
  );
}

function ScriptBody({ dramaId, data, ep, rewriting, asking }: { dramaId: string; data: ScriptPage; ep?: string; rewriting: boolean; asking?: string }) {
  const { t } = useT();
  const { search } = useRoute();
  const navigate = useNavigate();
  const original: FileItem | undefined = data.inputs.find((file) => file.id === data.screenplayFile);
  // New drama sends a Word or PDF screenplay as its text and keeps the file it came from beside it, in the library
  // (NewDrama.tsx, start; extract.ts, textName): the original is then that text, and the file is linked, not copied.
  const source = original && data.inputs.find((file) => file !== original && EXTRACTED.test(file.name) && textName(file.name) === original.name);
  const shown = data.versions.find((version) => search.item === "screenplay" && version.version === search.version) ?? data.versions[0];
  const [picked, setPicked] = useState<View>();
  const fountain = useText(shown?.file).text;
  const mine = useDocumentText(original);
  // The compare reads the version's own record: the original as validate checked it, and validate's line map.
  const checked = useText(shown?.original).text;
  const validated = useText(shown?.validate).text;
  const map = lineMap(validated);
  const comparable = Boolean(map && shown?.original);
  const lines = fountain === undefined ? [] : fountainLines(fountain);
  // An episode's "Episode script" (its Canvas head, ?ep=EPxxx) opens the Fountain at that episode: the section before
  // its first scene, numbered by drama-cli.
  const first = ep ? lines.findIndex((line) => !line.gap && line.el === "heading" && Number(episodeOfScene(line.text)) === Number(ep.slice(2))) : -1;
  const section = first < 0 ? -1 : lines.findLastIndex((line, index) => index <= first && !line.gap && line.el === "section");
  const target = section >= 0 ? section : first;
  useEffect(() => {
    if (target >= 0) document.getElementById(`fl-${target}`)?.scrollIntoView({ block: "start" });
  }, [target, fountain]);
  const show = (version: ScreenplayVersion) => void navigate({ ...homeLink(dramaId, "screenplay", "canvas", version.version), replace: true });
  const editor = useRef<HTMLElement>(null);
  const choose = (next: View) => {
    setPicked(next);
    // The switched view starts at its top, in sight: the editor comes back into view when its top had scrolled away.
    if (editor.current && editor.current.getBoundingClientRect().top < 0) editor.current.scrollIntoView({ block: "start" });
    if (ep) void navigate({ to: "/d/$dramaId/script", params: { dramaId }, search: { item: search.item, version: search.version }, replace: true });
  };
  const VIEWS: [View, "script.viewOriginal" | "script.viewFountain" | "script.viewCompare", IconName][] = [
    ["original", "script.viewOriginal", "file-text"],
    ["fountain", "script.viewFountain", "film-strip"],
    ["compare", "script.viewCompare", "square-half"],
  ];
  const views = VIEWS.filter(([key]) => (key === "original" ? Boolean(original) : key === "fountain" ? Boolean(shown) : comparable));
  // The view picked, while this version has it; the Fountain otherwise, or the original when nothing was recorded.
  const view: View = !shown ? "original" : ep ? "fountain" : picked && views.some(([key]) => key === picked) ? picked : "fountain";
  return (
    <>
      <div className="scripthead">
        <div className="fill">
          <h2 className="pagetitle">{t("step.script")}</h2>
          <p className="muted pagesub">{t("script.subtitle")}</p>
        </div>
      </div>
      {ep && fountain !== undefined && target < 0 && (
        <div className="notice" role="status">
          <Icon name="info" className="ic" />
          <span>{t("script.noEpisode", { ep })}</span>
        </div>
      )}
      <div className="scriptlayout">
        <section className="scripthistory" aria-label={t("script.versions")}>
          <h3>
            <Icon name="stack" className="ic" />
            {t("script.versions")}
          </h3>
          <ol className="history">
            {rewriting && (
              <li className="work">
                <span className="dot work" />
                <div className="fill">
                  <span>{t("script.rewriting", { version: `v${data.versions.length + 1}` })}</span>
                </div>
              </li>
            )}
            {/* A question on a version is that version's row; one before any version is about the upload. */}
            {asking && !data.versions.length && <AskedRow reviewId={asking} />}
            {data.versions.map((version) => (
              <VersionRow key={version.version} version={version} shown={version === shown} onShow={() => show(version)} />
            ))}
            {original && (
              <li className="done">
                <span className="dot accepted" />
                <div className="fill">
                  {source ? (
                    <span>
                      {t("script.extractedFrom")}{" "}
                      <a className="link" href={`${source.url}&download=1`} title={t("episode.download")}>
                        {source.name}
                      </a>
                    </span>
                  ) : (
                    <span>{t("script.uploaded", { name: original.name })}</span>
                  )}
                  {/* A project set up before drama-cli recorded rewrites: the history says so where the versions would be. */}
                  {!data.versions.length && !rewriting && !asking && <small className="muted">{t("script.notRecorded")}</small>}
                </div>
              </li>
            )}
          </ol>
        </section>
        {/* One editor surface, VS Code's way: the open file's label, and the view switch beside it. */}
        <section ref={editor} className="editor" aria-label={t("step.script")}>
          <div className="edbar">
            {/* One line: in Compare the panes' own headers name both files, so the tab names the view, the pair in its title. */}
            <div className="edtab" title={view === "compare" ? `${original?.name ?? ""} ↔ screenplay.fountain` : undefined}>
              <Icon name={view === "original" ? "file-text" : view === "compare" ? "square-half" : "film-strip"} className="ic" />
              <b>{view === "compare" ? t("script.viewCompare") : view === "original" ? (original?.name ?? "") : "screenplay.fountain"}</b>
              {view !== "original" && shown && <span className="tag">{shown.version}</span>}
              {/* Read-only (VS Code's read-only editor): a change is asked of the agent in the sidebar (D70). */}
              <span className="ro" title={t("script.readOnlyWhy")}>
                <Icon name="lock-simple" className="ic" />
                {t("script.readOnly")}
              </span>
            </div>
            <span className="fill" />
            {/* The view switch is the editor's primary control, so each choice says its name beside its icon (Apple HIG:
                label an icon whose meaning isn't universal) on the design's Segmented, and only the views this version has. */}
            {views.length > 1 && <Segmented label={t("script.view")} value={view} options={views.map(([value, label, icon]) => ({ value, label: t(label), icon }))} onChange={choose} />}
          </div>
          {shown && !comparable && (shown.validate === undefined || validated !== undefined) && <p className="muted ednote">{t("script.noLineMap", { version: shown.version })}</p>}
          {view !== "compare" && comparable && original?.name.toLowerCase().endsWith(".fountain") && (
            <p className="muted ednote">{t("script.alreadyFountain", { version: shown!.version })}</p>
          )}
          {view === "fountain" ? (
            <div className="edbody scriptdoc">
              {fountain === undefined ? (
                <p className="quiet">{t("loading")}</p>
              ) : (
                <div className="fdoc">{lines.map((line, index) => (line.gap ? <div key={index} className="gap" /> : <div key={index} id={`fl-${index}`} className={`fl ${line.el}`}>{line.text}</div>))}</div>
              )}
            </div>
          ) : view === "compare" ? (
            checked === undefined || fountain === undefined || !map ? (
              <p className="quiet">{t("loading")}</p>
            ) : (
              <Compare original={checked} fountain={fountain} map={map} name={original?.name ?? "original.txt"} version={shown!.version} />
            )
          ) : (
            <div className="edbody scriptdoc">
              {!original ? (
                <p className="quiet">{t("script.none")}</p>
              ) : !isDocument(original) || mine.failed || mine.text === "" ? (
                <Unreadable file={original} failed={mine.failed} />
              ) : mine.text === undefined ? (
                <p className="quiet">{t("loading")}</p>
              ) : (
                <pre className="original">{mine.text}</pre>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/**
 * Script, the screenplay's one home, from the upload to the maker's acceptance (D62; design/screens.js, Script): the
 * versions drama-cli recorded, newest first, each with its review.md and the agent's question about it, and the selected
 * one in a read-only editor, as Fountain, as the maker's original, or the two compared. The selected version is the
 * URL's (?item=screenplay&version=vN, D48).
 */
export function Script({ dramaId, ep, rewriting = false, asking }: { dramaId: string; ep?: string; rewriting?: boolean; asking?: string }) {
  const { t } = useT();
  const { search } = useRoute();
  const { data, error } = useResource<ScriptPage>(`/api/dramas/${dramaId}/script`, [`drama:${dramaId}`]);
  if (error !== undefined && !data) return <p className="error">{errorText(error, t)}</p>;
  if (!data) return <p className="quiet">{t("loading")}</p>;
  // Script's own item is the screenplay, at a version drama-cli recorded; anything else a link names isn't here.
  if (search.item !== undefined && search.item !== "screenplay") return <Missing dramaId={dramaId} what={search.item} />;
  if (search.version !== undefined && !data.versions.some((version) => version.version === search.version))
    return <Missing dramaId={dramaId} what={`screenplay ${search.version}`} />;
  return <ScriptBody dramaId={dramaId} data={data} ep={ep} rewriting={rewriting} asking={asking} />;
}
