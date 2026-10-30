// The drama-cli refusals a stop asks the maker about, read as drama-cli prints them, and the kind
// of stop each makes: a red line, a cap with the config key to raise, or a question to read.
import { describe, expect, it } from "vitest";
import { parseRefusals, RefusalError, stopKind, type Refusal } from "./refusal.ts";

const line = (error: Record<string, unknown>) => JSON.stringify({ error });

// As drama-cli words them (short_drama drama_cli/stages.py _limit_failure and the bible's RedLine, v0.7.4).
const CAP = {
  code: "SetLimitExceeded.max_new_versions",
  message: "lin has had 3 new paid versions, the limit defaults.max_new_versions (3); ask the person before drawing it again: they lift the limit for that item by raising defaults.max_new_versions in the config, then set it back; then run drama-cli cast look --config drama/drama-cli.cfg.yaml lin",
  param: "defaults.max_new_versions",
  action: "ask_person",
};
const RED_LINE = {
  code: "RedLine",
  message: "Bible v2 is not usable: lin is 15, below defaults.min_character_age (18). See drama/bible/v2/bible.md; report it to the person and pass their decision back with drama-cli bible ...",
  param: null,
  action: "ask_person",
};
// The take cap today (short_drama #664), and an upload the environment blocks (#666, as the M1 live check got it).
const TAKE_CAP_TODAY = { code: "Refused", message: "seg01 has had 3 new paid takes, the limit shoot.max_new_takes (3); ask the person before shooting it again", param: null, action: null };
const UPLOAD_BLOCKED = {
  code: "Refused",
  message: "Cannot determine Pine artifact access before provider submission; run pine-artifact status and fix its error before retrying",
  param: null,
  action: null,
};

describe("a stop's refusals", () => {
  it("are read one per line, as drama-cli printed each", () => {
    expect(parseRefusals(`${line(CAP)}\n${line(RED_LINE)}\n`)).toEqual([CAP, RED_LINE]);
    expect(parseRefusals(line(UPLOAD_BLOCKED))).toEqual([UPLOAD_BLOCKED]);
  });

  it.each([
    ["a line that isn't JSON", `${line(CAP)}\nnot json\n`, /line 2: the line/],
    ["a line with no error", `${JSON.stringify({ code: "RedLine" })}\n`, /line 1: error should be an object/],
    ["an error without a code", `${line({ ...CAP, code: "" })}\n`, /line 1: error\.code/],
    ["an action drama-cli doesn't have", `${line({ ...CAP, action: "shrug" })}\n`, /line 1: error\.action/],
    ["a param that isn't text", `${line({ ...CAP, param: 3 })}\n`, /line 1: error\.param/],
    ["a blank line between refusals", `${line(CAP)}\n\n${line(RED_LINE)}\n`, /line 2/],
    ["an empty file", "", /at least one refusal/],
  ])("refuse %s, naming the line and the field", (_what, text, problem) => {
    expect(() => parseRefusals(text)).toThrow(RefusalError);
    expect(() => parseRefusals(text)).toThrow(problem);
  });
});

describe("the kind of stop a refusal makes", () => {
  const kind = (refusal: Refusal) => stopKind(refusal);

  it("is a red line for a RedLine", () => {
    expect(kind(parseRefusals(line(RED_LINE))[0])).toEqual({ kind: "red-line" });
  });

  it("is a cap for a SetLimitExceeded, with the config key to raise", () => {
    expect(kind(parseRefusals(line(CAP))[0])).toEqual({ kind: "cap", key: "defaults.max_new_versions" });
  });

  it("is a cap for the take cap, once drama-cli gives it its code (#664)", () => {
    const fixed = { code: "SetLimitExceeded.max_new_takes", message: TAKE_CAP_TODAY.message, param: "shoot.max_new_takes", action: "ask_person" };
    expect(kind(parseRefusals(line(fixed))[0])).toEqual({ kind: "cap", key: "shoot.max_new_takes" });
  });

  it("is a question to read for the take cap as drama-cli words it today, a bare Refused (#664)", () => {
    expect(kind(parseRefusals(line(TAKE_CAP_TODAY))[0])).toEqual({ kind: "ask" });
  });

  it("is a question to read for an upload the environment blocks, a bare Refused today (#666)", () => {
    expect(kind(parseRefusals(line(UPLOAD_BLOCKED))[0])).toEqual({ kind: "ask" });
  });

  it("is a question to read for a provider's own limit, which isn't the config's", () => {
    expect(kind(parseRefusals(line({ code: "ProviderError.SetLimitExceeded", message: "Safe Experience Mode", param: null, action: "ask_person" }))[0])).toEqual({ kind: "ask" });
  });

  it("is a question to read for a cap that names no config key", () => {
    expect(kind(parseRefusals(line({ ...CAP, param: null }))[0])).toEqual({ kind: "ask" });
  });
});
