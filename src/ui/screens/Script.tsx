import { useState } from "react";
import type { FileItem, ScriptPage } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { useT } from "../i18n.ts";
import { errorText } from "../labels.ts";
import { FountainDiff, FountainReview } from "../FountainDiff.tsx";
import { DocumentView, useDocumentText, useText } from "../viewing.tsx";

/** A Fountain rewrite beside the maker's own file (P5.4): while the agent asks about it, the review that answers it. */
function Rewrite({ original, rewrite, reviewId }: { original: FileItem; rewrite: FileItem; reviewId?: string }) {
  const { t } = useT();
  const mine = useDocumentText(original);
  const fountain = useText(rewrite);
  if (mine.text === undefined || fountain.text === undefined) return <p className="quiet">{t("loading")}</p>;
  return reviewId ? <FountainReview original={mine.text} fountain={fountain.text} reviewId={reviewId} /> : <FountainDiff original={mine.text} fountain={fountain.text} />;
}

/**
 * Script, the screenplay's one home (IA §16; design/screens.js, Script): the screenplay drama-cli recorded, on its own or
 * beside the maker's original, and its versions with what the maker gave. The bible lives in Story and each breakdown in
 * its episode. While the agent's question about a rewrite is open, Script is that review (P5.4).
 */
export function Script({ dramaId }: { dramaId: string }) {
  const { t } = useT();
  const { data, error } = useResource<ScriptPage>(`/api/dramas/${dramaId}/script`, [`drama:${dramaId}`]);
  const [picked, setPicked] = useState<number>();
  const [beside, setBeside] = useState(false);
  if (error !== undefined && !data) return <p className="error">{errorText(error, t)}</p>;
  if (!data) return <p className="quiet">{t("loading")}</p>;
  const current = data.screenplay;
  // The screenplay the maker marked (a Word or PDF one as its text), to set beside a rewrite.
  const original: FileItem | undefined = data.inputs.find((file) => file.id === data.screenplayFile);
  const rewritten = current?.file && original && original.id !== current.file.id ? current.file : undefined;
  if (rewritten && original && current?.reviewId) return <Rewrite key={rewritten.id} original={original} rewrite={rewritten} reviewId={current.reviewId} />;
  const rows = [
    ...(current?.file ? [{ label: t(current.pending ? "script.pending" : "script.version", { version: current.version }), file: current.file }] : []),
    ...(current?.review ? [{ label: t("script.review", { version: current.version }), file: current.review }] : []),
    ...data.inputs.map((file) => ({ label: t("script.yours", { name: file.name }), file })),
  ];
  const shown = rows.find((row) => row.file.id === picked)?.file ?? current?.file;
  const pair = beside && rewritten && original && shown === rewritten;
  return (
    <>
      <div className="scripthead">
        <div className="grow">
          <h2 className="pagetitle">{t("step.script")}</h2>
          <p className="muted pagesub">{t("script.subtitle")}</p>
          {current?.file && <p className="muted">{t(current.pending ? "script.pending" : "script.version", { version: `${current.file.name} ${current.version}` })}</p>}
        </div>
        {rewritten && original && shown === rewritten && (
          <div className="seg" role="group" aria-label={t("script.show")}>
            <button type="button" aria-pressed={!beside} onClick={() => setBeside(false)}>
              {t("script.fountain")}
            </button>
            <button type="button" aria-pressed={beside} onClick={() => setBeside(true)}>
              {t("script.beside")}
            </button>
          </div>
        )}
      </div>
      {!shown ? (
        <p className="empty-note">{t("script.none")}</p>
      ) : pair ? (
        <Rewrite key={shown.id} original={original} rewrite={shown} />
      ) : (
        <section className="panel scriptdoc">
          <DocumentView key={shown.id} file={shown} />
        </section>
      )}
      {rows.length > 0 && (
        <section className="panel scriptversions" aria-label={t("script.versions")}>
          <h3>{t("script.versions")}</h3>
          {rows.map((row) => (
            <button key={row.file.id} type="button" className="lrow" aria-current={row.file === shown} onClick={() => (setPicked(row.file.id), setBeside(false))}>
              {row.label}
              <span className="mono subtle">{row.file.version ?? ""}</span>
            </button>
          ))}
        </section>
      )}
    </>
  );
}
