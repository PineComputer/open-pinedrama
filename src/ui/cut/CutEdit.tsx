// The maker's edit of the cut under review (design/screens.js, Cut, its Edit tab; Codex's IA re-review D1–D4): a
// draft of drama-cli edit's cut plan, apart from the review's notes. Phase 1 changes what that plan takes: each clip's
// take, its in and out, its own sound or silence, and the order (short_drama doc/drama-cli/review.md, "Build and
// inspect a cut"). The draft is bound to the cut it was made on and to each take's file; Apply sends it once, as the
// cut review's decision, which the engine checks and turns into the goal to build it (reviews.ts, editOf; goals.ts,
// editGoal).
import { useRef, useState } from "react";
import type { CutClip, Decision, EditedClip, FileItem, ReviewView } from "../../shared/types.ts";
import { api } from "../api.ts";
import { Submission, useSubmission } from "../components/Submission.tsx";
import { Icon } from "../icons.tsx";
import { useT } from "../i18n.ts";

const same = (a: EditedClip, b: EditedClip) => a.segment === b.segment && a.take === b.take && a.in === b.in && a.out === b.out && a.audio === b.audio;

/** The draft's changes against its base, one line each: take, in, out, sound, and the order. */
export function editChanges(base: EditedClip[], draft: EditedClip[]): { what: string; change: string }[] {
  const out: { what: string; change: string }[] = [];
  for (const clip of draft) {
    const was = base.find((other) => other.segment === clip.segment);
    if (!was) continue;
    if (was.take !== clip.take) out.push({ what: clip.segment, change: `take ${was.take} → ${clip.take}` });
    if (was.in !== clip.in) out.push({ what: clip.segment, change: `in ${was.in.toFixed(1)} → ${clip.in.toFixed(1)} s` });
    if (was.out !== clip.out) out.push({ what: clip.segment, change: `out ${was.out.toFixed(1)} → ${clip.out.toFixed(1)} s` });
    if (was.audio !== clip.audio) out.push({ what: clip.segment, change: clip.audio === "silence" ? "sound → silence" : "sound → the take's own" });
  }
  if (draft.map((clip) => clip.segment).join() !== base.map((clip) => clip.segment).join()) out.push({ what: "Order", change: draft.map((clip) => clip.segment).join(" → ") });
  return out;
}

/** The newest file of a segment's take that the episode returned. */
const takeFile = (files: FileItem[], segment: string, take: string) => files.filter((file) => file.kind === "take" && file.segment === segment && file.version === take).at(-1);

export function CutEdit({ review, file, clips, files, code }: { review: ReviewView; file: FileItem; clips: CutClip[]; files: FileItem[]; code: string }) {
  const { t } = useT();
  const item = review.reviewItems[0];
  // The base: the cut as drama-cli's plan of it lists it, each clip bound to the take file it was built from.
  const base: EditedClip[] = clips.map((clip) => ({ segment: clip.segment, take: clip.take, sha: takeFile(files, clip.segment, clip.take)?.sha ?? "", in: clip.in, out: clip.out, audio: clip.audio === "silence" ? "silence" : "source" }));
  const [draft, setDraft] = useState<EditedClip[]>();
  const [history, setHistory] = useState<EditedClip[][]>([]);
  const [selected, setSelected] = useState(0);
  const [comparing, setComparing] = useState(false);
  const edit = draft ?? base;
  const changes = editChanges(base, edit);
  const step = (next: EditedClip[]) => {
    setHistory((past) => [...past, edit]);
    setDraft(next);
  };
  const put = (index: number, patch: Partial<EditedClip>) => step(edit.map((clip, k) => (k === index ? { ...clip, ...patch } : clip)));
  const move = (index: number, by: number) => {
    const next = [...edit];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    step(next);
    setSelected(index + by);
  };
  // What the draft rests on: the cut under review is still the episode's newest, and each take is the file chosen.
  const newer = files.filter((other) => other.kind === "cut" && other.id > file.id).at(-1);
  const changed = edit.filter((clip) => takeFile(files, clip.segment, clip.take)?.sha !== clip.sha);
  const blocked = Boolean(newer) || changed.length > 0;
  // One id for this Apply, kept for Send again: the engine takes a decision once (reviews.ts, decide).
  const submission = useRef(crypto.randomUUID());
  const decision = (): Decision => ({ submissionId: submission.current, words: "", items: [{ key: item.key, verdict: "revise", notes: [], base: item.files.map((f) => f.id) }], edit: { base: file.id, clips: edit } });
  const { sending, send, check } = useSubmission({
    submit: () => api(`/api/reviews/${review.id}/decision`, { method: "POST", json: decision() }),
    taken: async () => (await api<ReviewView>(`/api/reviews/${review.id}`)).state !== "open",
  });
  const locked = sending.state !== "idle" && sending.state !== "failed";
  const pinned = clips.some((clip) => clip.audio === "pinned");
  const clip = edit[selected];
  const choices = clip ? files.filter((other) => other.kind === "take" && other.segment === clip.segment) : [];
  const to = t("edit.to", { code });

  if (pinned) return <p className="isec muted">{t("edit.pinned")}</p>;
  return (
    <>
      <div className="iscroll" inert={locked}>
        {locked && (
          <p className="draftnote">
            <Icon name="lock-simple" className="ic" />
            <span>{t("edit.locked")}</span>
          </p>
        )}
        <div className="isec">
          <h4>
            {t("edit.basedOn")} <span className="muted">{file.version}</span>
          </h4>
          {newer && (
            <div className="basewarn">
              <Icon name="warning" className="ic" />
              <span className="fill">
                <b>{t("edit.newer")}</b>
                <small>{t("edit.newerWhy", { base: file.version ?? "", newer: newer.version ?? "" })}</small>
              </span>
            </div>
          )}
          {changed.length > 0 && (
            <div className="basewarn err">
              <Icon name="warning" className="ic" />
              <span className="fill">
                <b>{t("edit.inputs")}</b>
                <small>{t("edit.inputsWhy", { clips: changed.map((other) => `${other.segment} · ${other.take}`).join(", ") })}</small>
              </span>
            </div>
          )}
          {blocked && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {newer && (
                <button type="button" className="btn sm" aria-pressed={comparing} onClick={() => setComparing(!comparing)}>
                  <Icon name="eye" className="ic" />
                  {t("edit.compare")}
                </button>
              )}
              {changed.length > 0 && (
                <button
                  type="button"
                  className="btn sm"
                  disabled={changed.some((other) => !takeFile(files, other.segment, other.take))}
                  onClick={() => step(edit.map((other) => ({ ...other, sha: takeFile(files, other.segment, other.take)?.sha ?? other.sha })))}
                >
                  <Icon name="check" className="ic" />
                  {t("edit.recheck")}
                </button>
              )}
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => {
                  setDraft(undefined);
                  setHistory([]);
                }}
              >
                {t("edit.discard")}
              </button>
            </div>
          )}
          {comparing && newer && newer.cutPlan && "clips" in newer.cutPlan && (
            <table className="cmp">
              <thead>
                <tr>
                  <th />
                  <th>{t("edit.yourBase", { v: file.version ?? "" })}</th>
                  <th>{t("edit.now", { v: newer.version ?? "" })}</th>
                </tr>
              </thead>
              <tbody>
                {newer.cutPlan.clips.map((now) => {
                  const was = clips.find((other) => other.segment === now.segment);
                  return (
                    <tr key={now.segment} className={was ? "" : "add"}>
                      <td>{now.segment}</td>
                      <td>{was ? `${was.take} · ${was.in}–${was.out} s` : "—"}</td>
                      <td>{`${now.take} · ${now.in}–${now.out} s`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <details className="basedet">
            <summary>{t("edit.restsOn")}</summary>
            <dl className="kv">
              <dt>{t("kind.cut")}</dt>
              <dd className="mono">
                {file.version} · {file.sha.slice(0, 8)}
              </dd>
              {edit.map((other) => (
                <div key={other.segment} style={{ display: "contents" }}>
                  <dt>
                    {other.segment} · {other.take}
                  </dt>
                  <dd className="mono">sha256 {other.sha.slice(0, 8)}…</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
        <div className="isec">
          <h4>
            {t("edit.clips")} <span className="muted">{edit.length}</span>
          </h4>
          {edit.map((other, index) => {
            const was = base.find((b) => b.segment === other.segment);
            return (
              <div key={other.segment} className={`cliprow${index === selected ? " on" : ""}`}>
                <button type="button" className="clipmain" onClick={() => setSelected(index)}>
                  <span className="fill">
                    <b>
                      {other.segment} · {other.take}
                    </b>
                    <small className="mono">
                      {other.in.toFixed(1)}–{other.out.toFixed(1)} s{other.audio === "silence" ? ` · ${t("edit.silence").toLowerCase()}` : ""}
                    </small>
                  </span>
                  {(!was || !same(was, other)) && <span className="chgdot" title={t("edit.edited")} />}
                </button>
                <button type="button" className="ibtn" aria-label={t("edit.earlier", { segment: other.segment })} disabled={index === 0} onClick={() => move(index, -1)}>
                  <Icon name="caret-up" className="ic" />
                </button>
                <button type="button" className="ibtn" aria-label={t("edit.later", { segment: other.segment })} disabled={index === edit.length - 1} onClick={() => move(index, 1)}>
                  <Icon name="caret-down" className="ic" />
                </button>
              </div>
            );
          })}
        </div>
        {clip && (
          <div className="isec">
            <h4>
              {t("edit.clip")} <span className="muted">{clip.segment}</span>
            </h4>
            <div className="propedit">
              <span className="muted">{t("cut.takeLabel")}</span>
              <div className="takes">
                {choices.map((take) => (
                  <button key={take.id} type="button" className={`take${take.version === clip.take ? " on" : ""}`} aria-pressed={take.version === clip.take} onClick={() => put(selected, { take: take.version!, sha: take.sha })}>
                    <b>{take.version}</b>
                  </button>
                ))}
              </div>
              <label className="muted" htmlFor="edit-in">
                {t("edit.in")}
              </label>
              <input id="edit-in" className="mono" type="number" step="0.1" min={0} value={Number(clip.in.toFixed(3))} onChange={(event) => put(selected, { in: Math.max(0, Number(event.target.value)) })} />
              <label className="muted" htmlFor="edit-out">
                {t("edit.out")}
              </label>
              <input id="edit-out" className="mono" type="number" step="0.1" min={clip.in} value={Number(clip.out.toFixed(3))} onChange={(event) => put(selected, { out: Number(event.target.value) })} />
              <span className="muted">{t("edit.sound")}</span>
              <div className="seg">
                {(["source", "silence"] as const).map((audio) => (
                  <button key={audio} type="button" aria-pressed={clip.audio === audio} onClick={() => put(selected, { audio })}>
                    {t(audio === "source" ? "edit.source" : "edit.silence")}
                  </button>
                ))}
              </div>
              <p className="muted">{t("edit.phase1")}</p>
            </div>
          </div>
        )}
        <div className="isec" style={{ borderBottom: 0 }}>
          <h4>
            {t("edit.changes")} <span className="muted">{changes.length}</span>
          </h4>
          {changes.length ? (
            changes.map((change, index) => (
              <div key={index} className="lrow plain">
                <span>{change.what}</span>
                <span className="mono">{change.change}</span>
              </div>
            ))
          ) : (
            <p className="muted">{t("edit.noChanges", { v: file.version ?? "" })}</p>
          )}
          <p className="muted">{t("edit.notesNotEdits")}</p>
        </div>
      </div>
      <div className="verdict">
        <Submission sending={sending} to={to} kept={t("edit.kept")} onSend={() => void send()} onCheck={() => void check()} />
        {sending.state === "sent" && <p className="muted">{t("edit.after", { code })}</p>}
        {!locked && (
          <div className="draftbar" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
            <span>{changes.length ? <b>{t("edit.draft", { n: changes.length })}</b> : t("edit.none")}</span>
            <span className="fill" />
            <button
              type="button"
              className="btn sm ghost"
              disabled={!history.length}
              onClick={() => {
                setDraft(history.at(-1));
                setHistory(history.slice(0, -1));
              }}
            >
              {t("edit.undo")}
            </button>
            <button type="button" className="btn sm ghost" disabled={!changes.length} onClick={() => step(base)}>
              {t("edit.reset")}
            </button>
            <button type="button" className="btn sm primary" disabled={!changes.length || blocked || review.state !== "open"} title={blocked ? t("edit.blocked") : undefined} onClick={() => void send()}>
              <Icon name="paper-plane-tilt" className="ic" />
              {t("edit.apply")}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
