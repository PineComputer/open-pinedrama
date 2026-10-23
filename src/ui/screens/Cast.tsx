import { useState } from "react";
import type { CastGroup } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { useT } from "../i18n.ts";

function Figure({ group }: { group: CastGroup }) {
  const [index, setIndex] = useState(0);
  const file = group.files[Math.min(index, group.files.length - 1)];
  const [name, look] = group.subject.split("/");
  return (
    <figure className="figure" style={{ margin: 0 }}>
      <a className="frame" href={file.url} target="_blank" rel="noreferrer">
        <img src={file.url} alt={group.subject} loading="lazy" />
      </a>
      <figcaption>
        <div className="caption">
          <span className="who">{name}</span>
          <span className="quiet" style={{ fontSize: 13 }}>
            {[look ?? (file.look && file.look !== "base" ? file.look : undefined), file.version].filter(Boolean).join(" · ")}
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
      </figcaption>
    </figure>
  );
}

export function Cast({ dramaId, compact = false }: { dramaId: string; compact?: boolean }) {
  const { t } = useT();
  const { data } = useResource<CastGroup[]>(`/api/dramas/${dramaId}/cast`, [`drama:${dramaId}`]);
  const sections = [
    ["look", t("cast.characters")],
    ["location", t("cast.locations")],
    ["prop", t("cast.props")],
  ] as const;
  return (
    <div>
      {!compact && (
        <div className="work-head">
          <h2>{t("section.cast")}</h2>
        </div>
      )}
      {!data ? (
        <p className="quiet">{t("loading")}</p>
      ) : !data.length ? (
        <p className="empty-note">{t("cast.empty")}</p>
      ) : (
        <div className="world">
          {sections.map(([kind, label]) => {
            const groups = data.filter((group) => group.kind === kind);
            if (!groups.length) return null;
            return (
              <section key={kind}>
                <h3>
                  <span className="label">{label}</span>
                  <span className="faint num" style={{ fontSize: 13 }}>
                    {groups.length}
                  </span>
                </h3>
                <div className="figures">
                  {groups.map((group) => (
                    <Figure key={group.subject} group={group} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
