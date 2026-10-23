import { useEffect, useRef, useState } from "react";
import type { ChatView } from "../../shared/types.ts";
import { api, useResource } from "../api.ts";
import { useT } from "../i18n.ts";

/** The agents' narration and questions, per session, and a line to answer, steer or ask. */
export function Chat({ dramaId, onClose }: { dramaId: string; onClose: () => void }) {
  const { t } = useT();
  const sessions = useResource<ChatView[]>(`/api/dramas/${dramaId}/sessions`, [`drama:${dramaId}`]);
  const [selected, setSelected] = useState<string>();
  const active = selected ?? sessions.data?.[0]?.sessionId;
  const chat = useResource<ChatView>(active ? `/api/sessions/${active}/chat` : null, active ? [`session:${active}`] : []);
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [chat.data?.messages.length]);

  const send = async () => {
    if (!active || !text.trim()) return;
    setError(undefined);
    try {
      await api(`/api/sessions/${active}/chat`, { method: "POST", json: { text } });
      setText("");
      chat.reload();
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  const placeholder = chat.data?.sends === "answer" ? t("talk.answer") : chat.data?.sends === "steer" ? t("talk.steer") : t("talk.run");

  return (
    <aside className="talk">
      <div className="talk-head">
        <h2>{t("talk.title")}</h2>
        <span style={{ flex: 1 }} />
        <button className="link" onClick={onClose}>
          {t("talk.close")}
        </button>
      </div>
      <div className="talk-tabs">
        {(sessions.data ?? []).map((session) => (
          <button key={session.sessionId} className={`${session.sessionId === active ? "on" : ""} ${session.sends === "answer" ? "asks" : ""}`} onClick={() => setSelected(session.sessionId)}>
            {session.label}
            {session.sends === "answer" ? " ●" : ""}
          </button>
        ))}
      </div>
      <div className="lines" ref={list}>
        {!active && <p className="quiet">{t("talk.none")}</p>}
        {(chat.data?.messages ?? []).map((message) => (
          <div key={message.id} className={`said ${message.kind}`}>
            {message.text}
          </div>
        ))}
      </div>
      <div className="talk-foot">
        {error && <span className="error" style={{ fontSize: 13 }}>{error}</span>}
        <div className="row">
          <textarea
            className="line-area"
            style={{ minHeight: 44 }}
            value={text}
            disabled={!active || chat.data?.sends === "none"}
            placeholder={placeholder}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void send();
            }}
          />
          <button className="btn ink small" disabled={!text.trim()} onClick={send}>
            {t("talk.send")}
          </button>
        </div>
      </div>
    </aside>
  );
}
