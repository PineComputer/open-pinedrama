import { useState } from "react";
import type { DramaView } from "../../shared/types.ts";
import { api, formatMoney, useResource } from "../api.ts";
import { type TKey, useT } from "../i18n.ts";
import { lookLabel } from "../labels.ts";
import { Link } from "../router.tsx";
import { Board, SetupPanel } from "./Board.tsx";
import { Cast } from "./Cast.tsx";
import { Chat } from "./Chat.tsx";
import { Crew } from "./Crew.tsx";
import { InboxList } from "./Inbox.tsx";

const SECTIONS: [string, TKey][] = [
  ["board", "section.board"],
  ["cast", "section.cast"],
  ["crew", "section.crew"],
  ["inbox", "section.inbox"],
];

/** How many episodes run at once, on how many per Computer, within what budget: changed in place. */
function Tune({ drama, onDone }: { drama: DramaView; onDone: () => void }) {
  const { t } = useT();
  const [parallel, setParallel] = useState(drama.parallel);
  const [perComputer, setPerComputer] = useState(drama.perComputer);
  const [budget, setBudget] = useState(String(drama.money.budget ?? ""));
  const save = async () => {
    await api(`/api/dramas/${drama.id}`, { method: "PATCH", json: { parallel, perComputer, budget: Number(budget) || null } });
    onDone();
  };
  return (
    <div className="tune">
      <div className="field">
        <label className="label" htmlFor="parallel">
          {t("new.parallel")}
        </label>
        <input id="parallel" className="line-input num" type="number" min={1} max={50} value={parallel} onChange={(event) => setParallel(Number(event.target.value))} />
      </div>
      <div className="field">
        <span className="label">{t("new.perComputer")}</span>
        <div className="options">
          {[1, 2, 3].map((n) => (
            <button key={n} className={perComputer === n ? "on" : ""} onClick={() => setPerComputer(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="budget">
          {t("new.budget")}
        </label>
        <input id="budget" className="line-input num" value={budget} onChange={(event) => setBudget(event.target.value.replace(/[^\d.]/g, ""))} />
      </div>
      <div style={{ display: "flex", gap: 14 }}>
        <button className="btn ink small" onClick={save}>
          {t("tune.save")}
        </button>
        <button className="link" onClick={onDone}>
          {t("tune.cancel")}
        </button>
      </div>
    </div>
  );
}

export function Drama({ id, tab }: { id: string; tab: string }) {
  const { t } = useT();
  const { data: drama, error } = useResource<DramaView>(`/api/dramas/${id}`, [`drama:${id}`]);
  const [talking, setTalking] = useState(false);
  const [tuning, setTuning] = useState(false);

  if (error) return <main className="page"><p className="error">{error}</p></main>;
  if (!drama) return <main className="page quiet">{t("loading")}</main>;

  const { episodes, money } = drama;
  const spentShare = money.budget ? Math.min(100, (money.agent / money.budget) * 100) : 0;

  return (
    <div className="drama-page">
      <aside className="rail">
        <div>
          <Link to="/" className="back">
            ← {t("rail.back")}
          </Link>
          <h1 style={{ marginTop: 14 }}>{drama.title}</h1>
          <div className="about">
            {drama.format} · {lookLabel(drama.look, t)}
          </div>
        </div>
        <nav className="sections">
          {SECTIONS.map(([key, label], index) => (
            <Link key={key} to={key === "board" ? `/d/${id}` : `/d/${id}/${key}`} className={tab === key ? "on" : ""}>
              <span className="n">{String(index + 1).padStart(2, "0")}</span>
              <span className="name">{t(label)}</span>
              {key === "inbox" && drama.waiting > 0 ? <span className="count">{drama.waiting}</span> : <span />}
            </Link>
          ))}
        </nav>
        <div className="ledger">
          {episodes.total > 0 && (
            <>
              <div className="row">
                <span>{t("ledger.atWork")}</span>
                <span className="num">{episodes.working}</span>
              </div>
              <div className="row">
                <span>{t("ledger.waiting")}</span>
                <span className={`num ${episodes.waiting ? "seal-text" : ""}`}>{episodes.waiting}</span>
              </div>
              <div className="row">
                <span>{t("ledger.finished")}</span>
                <span className="num">
                  {episodes.done} / {episodes.total}
                </span>
              </div>
            </>
          )}
          <div className="row" title={money.unpriced ? t("ledger.unpriced", { n: money.unpriced }) : undefined}>
            <span>{t("ledger.spent")}</span>
            <span className="num">
              {formatMoney(money.agent)}
              {money.budget ? <span className="quiet"> {t("ledger.budget", { budget: formatMoney(money.budget) })}</span> : null}
            </span>
          </div>
          {money.budget ? (
            <div className="spend">
              <span style={{ width: `${spentShare}%` }} />
            </div>
          ) : null}
        </div>
        {tuning ? (
          <Tune drama={drama} onDone={() => setTuning(false)} />
        ) : (
          <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
            <button className="link" onClick={() => setTuning(true)}>
              {t("rail.tune")}: {t("rail.tuneValue", { p: drama.parallel, c: drama.perComputer })}
            </button>
            <button className="btn small" onClick={() => setTalking((open) => !open)}>
              {t("rail.talk")}
            </button>
          </div>
        )}
      </aside>

      <section>
        {tab === "board" && (drama.status === "setup" || (drama.status === "stopped" && !drama.episodeRows.length) ? <SetupPanel drama={drama} /> : <Board drama={drama} />)}
        {tab === "cast" && <Cast dramaId={id} />}
        {tab === "crew" && <Crew drama={drama} />}
        {tab === "inbox" && (
          <>
            <div className="work-head">
              <h2>{t("inbox.title")}</h2>
            </div>
            <InboxList dramaId={id} />
          </>
        )}
      </section>
      {talking && <Chat dramaId={id} onClose={() => setTalking(false)} />}
    </div>
  );
}
