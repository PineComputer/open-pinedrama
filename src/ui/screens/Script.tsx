import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { Decision, FileItem, ScreenplayVersion, ScriptPage, SubmissionView } from "../../shared/types.ts";
import { api, ApiError, useResource } from "../api.ts";
import { Submission, useSubmission } from "../components/Submission.tsx";
import { FountainDiff } from "../FountainDiff.tsx";
import { fountainLines } from "../fountainLines.ts";
import { Icon, type IconName } from "../icons.tsx";
import { useT } from "../i18n.ts";
import { errorText } from "../labels.ts";
import { homeLink, useRoute } from "../place.ts";
import { useDocumentText, useText } from "../viewing.tsx";

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
      <div className="grow">
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

/** drama-cli's episode number in a scene number, #<episode>-<scene># (short_drama doc/drama-cli/write-a-screenplay.md). */
const episodeOfScene = (text: string) => text.match(/#(\d+)-\d+#\s*$/)?.[1];

function ScriptBody({ dramaId, data, ep }: { dramaId: string; data: ScriptPage; ep?: string }) {
  const { t } = useT();
  const { search } = useRoute();
  const navigate = useNavigate();
  const original: FileItem | undefined = data.inputs.find((file) => file.id === data.screenplayFile);
  const shown = data.versions.find((version) => search.item === "screenplay" && version.version === search.version) ?? data.versions[0];
  const [picked, setPicked] = useState<View>();
  const view: View = !shown ? "original" : ep ? "fountain" : (picked ?? "fountain");
  const fountain = useText(shown?.file).text;
  const mine = useDocumentText(original).text;
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
  const choose = (next: View) => {
    setPicked(next);
    if (ep) void navigate({ to: "/d/$dramaId/script", params: { dramaId }, search: { item: search.item, version: search.version }, replace: true });
  };
  const ACTIONS: [View, "script.showOriginal" | "script.showFountain" | "script.compare", IconName][] = [
    ["original", "script.showOriginal", "file-text"],
    ["fountain", "script.showFountain", "film-strip"],
    ["compare", "script.compare", "square-half"],
  ];
  return (
    <>
      <div className="scripthead">
        <div className="grow">
          <h2 className="pagetitle">{t("step.script")}</h2>
          <p className="muted pagesub">{t("script.subtitle")}</p>
        </div>
      </div>
      {!data.versions.length && (
        <div className="notice" role="status">
          <Icon name="info" className="ic" />
          <span>
            <b>{t("script.onlyOriginal")}</b> {t("script.onlyOriginalWhy")}
          </span>
        </div>
      )}
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
            {data.versions.map((version) => (
              <VersionRow key={version.version} version={version} shown={version === shown} onShow={() => show(version)} />
            ))}
            {original && (
              <li className="done">
                <span className="dot accepted" />
                <div className="grow">
                  <span>{t("script.uploaded", { name: original.name })}</span>
                </div>
              </li>
            )}
          </ol>
        </section>
        {/* One editor surface, VS Code's way: the open file as a tab, its actions as icon buttons (Apple HIG: a tooltip and a name). */}
        <section className="editor" aria-label={t("step.script")}>
          <div className="edbar">
            <div className="edtab" role="tab" aria-selected="true">
              <Icon name={view === "original" ? "file-text" : view === "compare" ? "square-half" : "film-strip"} className="ic" />
              <b>{view === "compare" ? `${original?.name ?? ""} ↔ screenplay.fountain` : view === "original" ? (original?.name ?? "") : "screenplay.fountain"}</b>
              {view !== "original" && shown && <span className="tag">{shown.version}</span>}
              {/* Read-only (VS Code's read-only editor): a change is asked of the agent in the sidebar (D70). */}
              <span className="ro" title={t("script.readOnlyWhy")}>
                <Icon name="lock-simple" className="ic" />
                {t("script.readOnly")}
              </span>
            </div>
            <span className="grow" />
            {ACTIONS.map(([key, label, icon]) => {
              const off = (key !== "original" && !shown) || (key !== "fountain" && !original);
              return (
                <button key={key} type="button" className="ibtn" title={t(label)} aria-label={t(label)} aria-pressed={view === key} disabled={off} onClick={() => choose(key)}>
                  <Icon name={icon} className="ic" />
                </button>
              );
            })}
          </div>
          {view === "fountain" ? (
            <div className="edbody scriptdoc">
              {fountain === undefined ? (
                <p className="quiet">{t("loading")}</p>
              ) : (
                <div className="fdoc">{lines.map((line, index) => (line.gap ? <div key={index} className="gap" /> : <div key={index} id={`fl-${index}`} className={`fl ${line.el}`}>{line.text}</div>))}</div>
              )}
            </div>
          ) : view === "compare" ? (
            mine === undefined || fountain === undefined ? <p className="quiet">{t("loading")}</p> : <FountainDiff original={mine} fountain={fountain} />
          ) : (
            <div className="edbody scriptdoc">{mine === undefined ? <p className="quiet">{t(original ? "loading" : "script.none")}</p> : <pre className="original">{mine}</pre>}</div>
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
export function Script({ dramaId, ep }: { dramaId: string; ep?: string }) {
  const { t } = useT();
  const { data, error } = useResource<ScriptPage>(`/api/dramas/${dramaId}/script`, [`drama:${dramaId}`]);
  if (error !== undefined && !data) return <p className="error">{errorText(error, t)}</p>;
  if (!data) return <p className="quiet">{t("loading")}</p>;
  return <ScriptBody dramaId={dramaId} data={data} ep={ep} />;
}
