import { ArrowLeft, MessageSquare, Settings2 } from "lucide-react";
import { useState } from "react";
import type { DramaView } from "../../shared/types.ts";
import { api, formatMoney, useResource } from "../api.ts";
import { useT } from "../i18n.ts";
import { lookLabel } from "../labels.ts";
import { Link } from "../router.tsx";
import { Board, SetupPanel } from "./Board.tsx";
import { Cast } from "./Cast.tsx";
import { Chat } from "./Chat.tsx";
import { Crew } from "./Crew.tsx";
import { InboxList } from "./Inbox.tsx";

function Settings({ drama, onClose }: { drama: DramaView; onClose: () => void }) {
  const { t } = useT();
  const [parallel, setParallel] = useState(drama.parallel);
  const [perComputer, setPerComputer] = useState(drama.perComputer);
  const [budget, setBudget] = useState(String(drama.money.budget ?? ""));
  const save = async () => {
    await api(`/api/dramas/${drama.id}`, { method: "PATCH", json: { parallel, perComputer, budget: Number(budget) || null } });
    onClose();
  };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h3>{t("settings.title")}</h3>
        <div className="grid2">
          <div className="field">
            <label>{t("new.parallel")}</label>
            <input className="input" type="number" min={1} max={50} value={parallel} onChange={(event) => setParallel(Number(event.target.value))} />
          </div>
          <div className="field">
            <label>{t("new.budget")}</label>
            <input className="input" value={budget} onChange={(event) => setBudget(event.target.value.replace(/[^\d.]/g, ""))} />
          </div>
        </div>
        <div className="field">
          <label>{t("new.perComputer")}</label>
          <div className="segmented">
            {[1, 2, 3].map((n) => (
              <button key={n} className={perComputer === n ? "on" : ""} onClick={() => setPerComputer(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onClose}>
            {t("review.cancel")}
          </button>
          <button className="btn primary" onClick={save}>
            {t("settings.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Drama({ id, tab }: { id: string; tab: string }) {
  const { t } = useT();
  const { data: drama, error } = useResource<DramaView>(`/api/dramas/${id}`, [`drama:${id}`]);
  const [chat, setChat] = useState(false);
  const [settings, setSettings] = useState(false);

  if (error) return <main className="page"><p className="error">{error}</p></main>;
  if (!drama) return <main className="page muted">{t("loading")}</main>;

  const tabs = [
    ["board", t("tab.board")],
    ["cast", t("tab.cast")],
    ["crew", t("tab.crew")],
    ["inbox", t("tab.inbox")],
  ] as const;

  return (
    <main className="page">
      <div className="drama-head">
        <Link to="/" className="btn ghost small">
          <ArrowLeft size={16} />
        </Link>
        <h1>{drama.title}</h1>
        <span className="chip">{drama.format}</span>
        <span className="chip">{lookLabel(drama.look, t)}</span>
        <span style={{ flex: 1 }} />
        <div className="stats">
          {drama.episodes.total > 0 && <span>{t("card.episodes", { done: drama.episodes.done, total: drama.episodes.total })}</span>}
          {drama.waiting > 0 && <span style={{ color: "var(--accent)" }}>● {t("card.needYou", { n: drama.waiting })}</span>}
          <span>{t("card.atWork", { n: drama.computers })}</span>
          <span title={drama.money.unpriced ? t("money.unpriced", { n: drama.money.unpriced }) : undefined}>
            {t("money.agent")} <b>{formatMoney(drama.money.agent)}</b>
            {drama.money.budget ? ` ${t("money.budget", { budget: formatMoney(drama.money.budget) })}` : ""}
          </span>
        </div>
        <button className="btn small ghost" onClick={() => setSettings(true)} title={t("settings.title")}>
          <Settings2 size={15} />
        </button>
        <button className={`btn small ${chat ? "on" : ""}`} onClick={() => setChat((open) => !open)}>
          <MessageSquare size={15} />
          {t("chat.open")}
        </button>
      </div>
      <div className="tabs">
        {tabs.map(([key, label]) => (
          <Link key={key} to={`/d/${id}/${key === "board" ? "" : key}`.replace(/\/$/, "")} className={tab === key ? "on" : ""}>
            {label}
            {key === "inbox" && drama.waiting > 0 && <span className="chip accent">{drama.waiting}</span>}
          </Link>
        ))}
      </div>
      {tab === "board" && (drama.status === "setup" || (drama.status === "stopped" && !drama.episodeRows.length) ? <SetupPanel drama={drama} /> : <Board drama={drama} />)}
      {tab === "cast" && <Cast dramaId={id} />}
      {tab === "crew" && <Crew drama={drama} />}
      {tab === "inbox" && <InboxList dramaId={id} />}
      {chat && <Chat dramaId={id} onClose={() => setChat(false)} />}
      {settings && <Settings drama={drama} onClose={() => setSettings(false)} />}
    </main>
  );
}
