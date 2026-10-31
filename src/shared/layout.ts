// drama-cli's layout of a lineage export, as `drama-cli export comfyui` places its nodes (short_drama
// drama_cli/export.py, WIDTH, HEIGHT, GAP, PAD, TITLE and layout): the text stages in one column;
// the characters', the locations' and the props' pictures two to a row, one group under the other;
// each segment's pictures four to a row; each episode's cut alone. Replay writes its exports with it,
// and the canvas applies it to the stages it keeps of an episode, so they pack as drama-cli packs.

export const WIDTH = 300;
export const HEIGHT = 340;
const GAP = 60;
export const PAD = 20;
export const TITLE = 50;
const TEXT_HEIGHT = 30;

const SHARED = ["Text", "Characters", "Locations", "Props"];

export interface Placed {
  id: string;
  column: number;
  /** Its group's title (export.py, section). */
  section: string;
}

export interface Frame {
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Each stage's top-left corner and each group's frame, as export.py's layout makes them; strings sort as Python sorts them.
 * A stage's height may be its own (the canvas gives each picture its own ratio, D-entry pending): a row is as tall as its
 * tallest, and the rows and groups below move down by it, so drama-cli's columns, groups and order stay and nothing overlaps.
 * Without heights it is export.py's layout exactly.
 */
export function layout(stages: Placed[], heightOf: (id: string) => number = () => HEIGHT): { places: Map<string, [number, number]>; groups: Frame[] } {
  const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const members = new Map<string, Placed[]>();
  for (const stage of stages) members.set(stage.section, [...(members.get(stage.section) ?? []), stage]);
  const names = [...members.keys()];
  const places = new Map<string, [number, number]>();
  const groups: Frame[] = [];
  const place = (name: string, x: number, y: number, list: Placed[], perRow: number, w: number, h: (id: string) => number) => {
    const sorted = [...list].sort((a, b) => a.column - b.column || byCodePoint(a.id, b.id));
    let row = y;
    for (let start = 0; start < sorted.length; start += perRow) {
      const members = sorted.slice(start, start + perRow);
      members.forEach((stage, n) => places.set(stage.id, [x + n * (w + GAP), row]));
      row += Math.max(...members.map((stage) => h(stage.id))) + GAP;
    }
    const width = Math.min(list.length, perRow) * (w + GAP) - GAP;
    const height = row - GAP - y;
    groups.push({ title: name, x: x - PAD, y: y - TITLE - PAD, w: width + 2 * PAD, h: height + TITLE + 2 * PAD });
    return y + height + TITLE + 2 * PAD + GAP;
  };
  let y = place("Text", 0, TITLE + PAD, members.get("Text") ?? [], 1, WIDTH, () => TEXT_HEIGHT);
  // export.py places the Text group even when it is empty; a canvas that keeps no text stage starts its shared groups at the top.
  if (!members.has("Text")) {
    groups.pop();
    y = 0;
  }
  for (const name of ["Characters", "Locations", "Props"]) if (members.has(name)) y = place(name, 0, y + TITLE + PAD, members.get(name)!, 2, WIDTH, heightOf);
  let x = 2 * (WIDTH + GAP) + 2 * PAD + GAP;
  y = TITLE + PAD;
  for (const name of names.filter((one) => !SHARED.includes(one) && !one.endsWith(" cut")).sort(byCodePoint)) y = place(name, x, y, members.get(name)!, 4, WIDTH, heightOf) + TITLE + PAD;
  x += 4 * (WIDTH + GAP) + 2 * PAD + GAP;
  y = TITLE + PAD;
  for (const name of names.filter((one) => one.endsWith(" cut")).sort(byCodePoint)) y = place(name, x, y, members.get(name)!, 1, WIDTH, heightOf) + TITLE + PAD;
  return { places, groups };
}
