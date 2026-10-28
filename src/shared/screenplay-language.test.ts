import { describe, expect, it } from "vitest";
import { presetLanguage } from "./presets.ts";
import { detectScreenplayLanguage } from "./screenplay-language.ts";

describe("the screenplay's structure", () => {
  it("is English for INT./EXT. headings and Episode headings, whatever the dialogue", () => {
    const text = `# Episode 1

INT. EMERGENCY ROOM - DAY #1-1#

MARA
三号床，准备除颤！

EXT. HOSPITAL ENTRANCE - NIGHT #1-2#`;
    expect(detectScreenplayLanguage(text)).toEqual({ language: "en", en: 3, zh: 0 });
  });

  it("is Chinese for drama-cli's Chinese Fountain", () => {
    const text = `# 第1集

.内景 急诊室 - 日 #1-1#

@林晚
三号床，准备除颤！

.外景 医院门口 - 夜 #1-2#`;
    expect(detectScreenplayLanguage(text)).toEqual({ language: "zh", en: 0, zh: 3 });
  });

  it("is Chinese for the industry form with English dialogue", () => {
    // The form of the person's test upload (28 October 2026): Chinese structure, English lines.
    const text = `第一集
1-1  夜  内  华丽宴会厅
出场人物：Sabrina Donovan、Nathan Hardwick
▲ 金碧辉煌的宴会厅内。
Sabrina Donovan（低声）: "I heard Sabrina Donovan has never been seen in public."
1-2日外酒店门口`;
    expect(detectScreenplayLanguage(text)).toEqual({ language: "zh", en: 0, zh: 5 });
  });

  it("is undecided for prose, and for a tie", () => {
    expect(detectScreenplayLanguage("She walks into the hall. 她走进大厅。").language).toBeUndefined();
    expect(detectScreenplayLanguage("INT. HALL - DAY\n.内景 大厅 - 日").language).toBeUndefined();
  });
});

describe("a preset's language", () => {
  it("is its name's BCP 47 prefix", () => {
    expect(presetLanguage("zh-cn-live-sfw")).toBe("zh");
    expect(presetLanguage("en-us-live-sfw")).toBe("en");
    expect(presetLanguage("")).toBeUndefined();
    expect(presetLanguage("ja-jp-anime-sfw")).toBeUndefined();
  });
});
