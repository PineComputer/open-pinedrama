import type { Reviewing } from "../shared/types.ts";
import { useT } from "./i18n.ts";
import { RadioGroup, RadioGroupItem } from "./components/ui/radio-group.tsx";

const CHOICES: Reviewing[] = ["every", "key", "none"];

/**
 * What the maker reviews in a drama, in New drama and when tuning one: the studio approves the rest. Three rows, each
 * its label and hint, on the kit's RadioGroup like the preset cards (design 126de62: the segmented wrapped every label).
 */
export function ReviewingChoice({ value, onChange }: { value: Reviewing; onChange: (value: Reviewing) => void }) {
  const { t } = useT();
  return (
    <div className="field">
      <span className="label">{t("reviewing.label")}</span>
      <RadioGroup className="presets one gap-2" aria-label={t("reviewing.label")} value={value} onValueChange={(next) => onChange(next as Reviewing)}>
        {CHOICES.map((choice) => (
          <label key={choice} className="preset">
            <RadioGroupItem value={choice} />
            <span className="fill">
              <b>{t(`reviewing.${choice}`)}</b>
              <small>{t(`reviewing.${choice}Hint`)}</small>
            </span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
