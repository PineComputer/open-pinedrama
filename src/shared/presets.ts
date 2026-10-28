// The preset templates New drama shows. One with a preset is drama-cli's bundled preset of that
// name (`drama-cli preset list`); one without is shown greyed: not supported yet. The studio offers
// only the presets named here, so a preset drama-cli adds is offered once someone adds it.

export const TEMPLATES: readonly { key: string; preset?: string }[] = [
  { key: "zh-drama", preset: "zh-cn-live-sfw" },
  { key: "en-drama", preset: "en-us-live-sfw" },
  { key: "anime-drama" },
  { key: "3d-drama" },
  { key: "ad" },
  { key: "custom" },
];

/** The presets a drama may use. */
export const PRESETS: readonly string[] = TEMPLATES.flatMap((template) => (template.preset ? [template.preset] : []));

/**
 * The language a preset writes in: its name's BCP 47 prefix (`<bcp47>-<form>-<rating>`, as
 * zh-cn-live-sfw). The studio's screenplay language when the screenplay shows no structure.
 */
export function presetLanguage(preset: string): "zh" | "en" | undefined {
  const prefix = preset.split("-")[0];
  return prefix === "zh" || prefix === "en" ? prefix : undefined;
}
