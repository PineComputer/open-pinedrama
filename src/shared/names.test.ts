// The names a person reads: the drama's title, its people, places and props as the bible writes
// them (the screenplay's own script), and its episodes' titles, keyed by id.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { beatsOf, nameOf, NamesError, parseBibleNames } from "./names.ts";

function bible(): Record<string, any> {
  return JSON.parse(readFileSync(new URL("../../fixtures/status/bible.json", import.meta.url), "utf8"));
}

describe("a bible's names", () => {
  it("are its people, places, props and episodes by id, in the screenplay's script", () => {
    expect(parseBibleNames(bible())).toEqual({
      title: "T",
      characters: { lin: { name: "林", aliases: [] } },
      locations: { office: "办公室" },
      props: {},
      episodes: { EP001: "x" },
      logline: "l",
      tone: "t",
      beats: [{ event: "greeting", seconds: 10, lines: [1, 7] }],
      summaries: { EP001: "s" },
      endHooks: { EP001: "h" },
      seconds: { EP001: 10 },
      lines: { EP001: [1, 7] },
      descriptions: { locations: { office: "desks" }, props: {} },
    });
  });

  it("keep a person's other names, and a bible's props when it lists them", () => {
    const value = bible();
    value.characters[0].aliases = ["小林", "林老师"];
    value.props = [{ id: "letter", name: "信" }];
    const names = parseBibleNames(value);
    expect(names.characters.lin.aliases).toEqual(["小林", "林老师"]);
    expect(names.props).toEqual({ letter: "信" });
  });

  it("refuse a bible that doesn't read as drama-cli writes it, naming the field", () => {
    const value = bible();
    delete value.characters[0].name;
    expect(() => parseBibleNames(value)).toThrow(NamesError);
    expect(() => parseBibleNames(value)).toThrow(/characters\.0\.name/);
    expect(() => parseBibleNames("not a bible")).toThrow(NamesError);
  });

  it("refuse a beat without its screenplay lines, naming the field", () => {
    const value = bible();
    delete value.beats[0].lines;
    expect(() => parseBibleNames(value)).toThrow(/beats\.0\.lines/);
  });
});

describe("an episode's beats", () => {
  it("are the bible's beats whose lines lie within the episode's, in order", () => {
    const value = bible();
    value.episodes.push({ id: "EP002", title: "y", summary: "s2", est_seconds: 8, end_hook: "h2", lines: [8, 12] });
    value.beats.push({ lines: [8, 9], seconds: 5, event: "a" }, { lines: [10, 12], seconds: 3, event: "b" });
    const names = parseBibleNames(value);
    expect(beatsOf(names, "EP001").map((beat) => beat.event)).toEqual(["greeting"]);
    expect(beatsOf(names, "EP002").map((beat) => beat.event)).toEqual(["a", "b"]);
    expect(beatsOf(names, "EP003")).toEqual([]);
  });
});

describe("a character, location or prop as a person reads it", () => {
  const names = parseBibleNames(bible());

  it("is its name in the bible, with the look or time drama-cli adds after its id", () => {
    expect(nameOf(names, "character", "lin")).toBe("林");
    expect(nameOf(names, "character", "lin S1")).toBe("林 · S1");
    expect(nameOf(names, "location", "office Day")).toBe("办公室 · Day");
  });

  it("is the id drama-cli gives before a bible names it", () => {
    expect(nameOf(null, "prop", "letter")).toBe("letter");
    expect(nameOf(names, "prop", "letter")).toBe("letter");
  });
});
