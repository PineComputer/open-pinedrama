import { useState } from "react";
import type { CastGroup } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { useT } from "../i18n.ts";

function CastCard({ group }: { group: CastGroup }) {
  const [index, setIndex] = useState(0);
  const file = group.files[Math.min(index, group.files.length - 1)];
  return (
    <div className="cast-card">
      <a className="pic" href={file.url} target="_blank" rel="noreferrer">
        <img src={file.url} alt={group.subject} loading="lazy" />
      </a>
      <div className="meta">
        <b>{group.subject}</b>
        <span style={{ flex: 1 }} />
        <span className="muted" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
          {file.version}
        </span>
      </div>
      {group.files.length > 1 && (
        <div className="versions">
          {group.files.map((version, i) => (
            <button key={version.id} className={i === index ? "on" : ""} onClick={() => setIndex(i)}>
              {version.version ?? i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Cast({ dramaId }: { dramaId: string }) {
  const { t } = useT();
  const { data } = useResource<CastGroup[]>(`/api/dramas/${dramaId}/cast`, [`drama:${dramaId}`]);
  if (!data) return <p className="muted">{t("loading")}</p>;
  if (!data.length) return <p className="empty">{t("cast.empty")}</p>;
  const sections = [
    ["look", t("cast.characters")],
    ["location", t("cast.locations")],
    ["prop", t("cast.props")],
  ] as const;
  return (
    <>
      {sections.map(([kind, label]) => {
        const groups = data.filter((group) => group.kind === kind);
        if (!groups.length) return null;
        return (
          <section key={kind}>
            <h2 className="section">{label}</h2>
            <div className="cast">
              {groups.map((group) => (
                <CastCard key={group.subject} group={group} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
