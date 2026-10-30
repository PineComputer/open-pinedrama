// The names a person reads: the drama's title, its people, places and props as the bible writes
// them (the screenplay's own script), and its episodes' titles, keyed by id.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nameOf, NamesError, parseBibleNames } from "./names.ts";

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
      beats: ["greeting"],
      summaries: { EP001: "s" },
    });
  });

  it("leave the logline out when the bible does", () => {
    const value = bible();
    delete value.logline;
    expect(parseBibleNames(value).logline).toBeUndefined();
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
