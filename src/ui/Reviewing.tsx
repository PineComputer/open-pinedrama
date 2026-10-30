import type { Reviewing } from "../shared/types.ts";
import { useT } from "./i18n.ts";
import { Segmented } from "./components/Segmented.tsx";

const CHOICES: Reviewing[] = ["every", "key", "none"];

/** What the maker reviews in a drama, in New drama and when tuning one: the studio approves the rest. */
export function ReviewingChoice({ value, onChange }: { value: Reviewing; onChange: (value: Reviewing) => void }) {
  const { t } = useT();
  return (
    <div className="field">
      <span className="label">{t("reviewing.label")}</span>
      <Segmented label={t("reviewing.label")} value={value} onChange={onChange} options={CHOICES.map((choice) => ({ value: choice, label: t(`reviewing.${choice}`) }))} />
      <p className="quiet small">{t(`reviewing.${value}Hint`)}</p>
    </div>
  );
}
