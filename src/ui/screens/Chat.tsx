import { Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatView } from "../../shared/types.ts";
import { api, useResource } from "../api.ts";
import { useT } from "../i18n.ts";

/** The agents' narration and questions, per session, and a box to answer, steer or ask. */
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
    list.current?.scrollTo({ top: list.current.scrollHeight });
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

  const placeholder = chat.data?.sends === "answer" ? t("chat.answer") : chat.data?.sends === "steer" ? t("chat.steer") : t("chat.run");

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <b>{t("chat.open")}</b>
        <span style={{ flex: 1 }} />
        <button className="btn ghost small" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <div className="drawer-tabs">
        {(sessions.data ?? []).map((session) => (
          <button key={session.sessionId} className={`btn small ${session.sessionId === active ? "" : "ghost"}`} onClick={() => setSelected(session.sessionId)}>
            {session.label}
            {session.sends === "answer" && <span className="dot" style={{ color: "var(--accent)" }} />}
          </button>
        ))}
      </div>
      <div className="messages" ref={list}>
        {!active && <p className="muted">{t("chat.none")}</p>}
        {(chat.data?.messages ?? []).map((message) => (
          <div key={message.id} className={`msg ${message.kind}`}>
            {message.text}
          </div>
        ))}
      </div>
      <div style={{ display: "grid" }}>
        {error && <p className="error" style={{ margin: "0 10px" }}>{error}</p>}
        <div className="composer">
          <textarea
            className="input"
            value={text}
            disabled={!active || chat.data?.sends === "none"}
            placeholder={placeholder}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void send();
            }}
          />
          <button className="btn primary" disabled={!text.trim()} onClick={send} title={t("chat.send")}>
            <Send size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
