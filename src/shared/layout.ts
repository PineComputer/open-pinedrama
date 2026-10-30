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

/** Each stage's top-left corner and each group's frame, as export.py's layout makes them; strings sort as Python sorts them. */
export function layout(stages: Placed[]): { places: Map<string, [number, number]>; groups: Frame[] } {
  const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const members = new Map<string, Placed[]>();
  for (const stage of stages) members.set(stage.section, [...(members.get(stage.section) ?? []), stage]);
  const names = [...members.keys()];
  const places = new Map<string, [number, number]>();
  const groups: Frame[] = [];
  const place = (name: string, x: number, y: number, list: Placed[], perRow: number, [w, h]: [number, number]) => {
    [...list].sort((a, b) => a.column - b.column || byCodePoint(a.id, b.id)).forEach((stage, n) => places.set(stage.id, [x + (n % perRow) * (w + GAP), y + Math.floor(n / perRow) * (h + GAP)]));
    const width = Math.min(list.length, perRow) * (w + GAP) - GAP;
    const height = Math.ceil(list.length / perRow) * (h + GAP) - GAP;
    groups.push({ title: name, x: x - PAD, y: y - TITLE - PAD, w: width + 2 * PAD, h: height + TITLE + 2 * PAD });
    return y + height + TITLE + 2 * PAD + GAP;
  };
  let y = place("Text", 0, TITLE + PAD, members.get("Text") ?? [], 1, [WIDTH, TEXT_HEIGHT]);
  // export.py places the Text group even when it is empty; a canvas that keeps no text stage starts its shared groups at the top.
  if (!members.has("Text")) {
    groups.pop();
    y = 0;
  }
  for (const name of ["Characters", "Locations", "Props"]) if (members.has(name)) y = place(name, 0, y + TITLE + PAD, members.get(name)!, 2, [WIDTH, HEIGHT]);
  let x = 2 * (WIDTH + GAP) + 2 * PAD + GAP;
  y = TITLE + PAD;
  for (const name of names.filter((one) => !SHARED.includes(one) && !one.endsWith(" cut")).sort(byCodePoint)) y = place(name, x, y, members.get(name)!, 4, [WIDTH, HEIGHT]) + TITLE + PAD;
  x += 4 * (WIDTH + GAP) + 2 * PAD + GAP;
  y = TITLE + PAD;
  for (const name of names.filter((one) => one.endsWith(" cut")).sort(byCodePoint)) y = place(name, x, y, members.get(name)!, 1, [WIDTH, HEIGHT]) + TITLE + PAD;
  return { places, groups };
}
