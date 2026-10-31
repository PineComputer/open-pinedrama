/* Sample content for the pro-direction prototype. The project, its people, places and lines are invented.
   Pictures are stills and muted clips from our own earlier test runs, renamed for this sample. */
window.P = (() => {
  const img = (n) => "img/" + n + ".jpg";
  const titles = ["The Wedding", "Booked", "Out on Bail", "The Contract", "Separate Rooms", "Night Shift", "Visiting Hours", "The Lawyer",
    "Character Witness", "Plea", "The Ring Returned", "Cold Coffee", "The Hearing", "Margaret's Offer", "Second Ceremony", "House Arrest",
    "The Alibi", "Walter Knows", "Parole", "The Toast", "Two Keys", "Open Court", "Verdict", "Bride on Bail"];
  const covers = ["cover-ep1", "cover-ep2", "cover-ep3", "cover-ep4", "cover-ep5", "cover-ep6", "cover-ep7", "cover-ep8"];
  // stage strip: breakdown, blocking, storyboards, takes, cut. d done, w at work, y waits for the person
  const eps = titles.map((t, i) => {
    const code = "EP" + String(i + 1).padStart(3, "0");
    const base = { code, title: t, n: i + 1, spent: 0, strip: ["", "", "", "", ""], now: "In line, #" + (i - 5), status: "line", cover: covers[i] ? img(covers[i]) : null };
    const set = [
      { status: "you", strip: ["d", "d", "d", "d", "y"], now: "Cut v2 waits for you", spent: 14.8, cut: { accepted: "v1", acceptedDur: 86, latest: "v2", latestDur: 84, st: "you" } },
      { status: "you", strip: ["d", "d", "d", "y", ""], now: "2 takes wait for you", spent: 11.4 },
      { status: "work", strip: ["d", "d", "d", "w", ""], now: "Shooting 4 takes", spent: 8.9 },
      { status: "you", strip: ["d", "d", "y", "", ""], now: "6 storyboards wait for you", spent: 2.1 },
      { status: "work", strip: ["d", "w", "", "", ""], now: "Blocking seg03", spent: 1.2 },
      { status: "you", strip: ["d", "d", "d", "y", ""], now: "2 takes wait for you", spent: 2.8, cut: { accepted: null, latest: "v1", latestDur: 15, st: "you" } },
    ][i];
    return set ? { ...base, ...set } : { ...base, strip: i < 8 ? ["d", "", "", "", ""] : ["", "", "", "", ""] };
  });
  return {
    project: { title: "Bride on Bail", episodes: 24, spec: "9:16 · 480p", preset: "en-us-live-sfw", spent: 41.2, inflight: 7.2, budget: 1000 },
    eps,
    cast: [
      { id: "ivy", name: "Ivy Bell", role: "Lead · base look", ver: "S0 v1", st: "accepted", sheet: img("cast-ivy"), face: img("face-ivy") },
      { id: "luca", name: "Luca Moreno", role: "Lead · base look", ver: "S0 v2", accepted: "S0 v2", st: "accepted", sheet: img("cast-luca"), face: img("face-luca") },
      { id: "ethan", name: "Ethan Cole", role: "Base look", ver: "S0 v1", accepted: "S0 v1", st: "accepted", sheet: img("cast-ethan"), face: img("face-ethan") },
      { id: "margaret", name: "Margaret Cole", role: "Base look", ver: "S0 v3", accepted: "S0 v2", st: "you", warn: 1, sheet: img("cast-margaret"), face: img("face-margaret") },
      { id: "walter", name: "Walter Cole", role: "Base look", ver: "S0 v3", accepted: "S0 v3", st: "stale", problems: ["Changed file: bible/v3/bible.json"], sheet: img("cast-walter"), face: img("face-walter") },
      { id: "dunn", name: "Sgt. Ray Dunn", role: "Base look", ver: "S0 v1", accepted: "S0 v1", st: "accepted", sheet: img("cast-dunn"), face: img("face-dunn") },
      { id: "hale", name: "Reverend Hale", role: "Base look", ver: "S0 v1", accepted: null, st: "work", sheet: img("cast-hale"), face: img("face-hale") },
      { id: "tess", name: "Tess Park", role: "Base look", ver: "S0 v1", accepted: null, st: "back", err: 1, sheet: img("cast-tess"), face: img("face-tess") },
    ],
    places: [
      { id: "apartment", name: "Luca's apartment", desc: "A one-bedroom walk-up over a laundromat: a sofa bed, a desk under the window, case files stacked by the door.", ver: "v2", accepted: "v2", st: "accepted", pic: img("plate-apartment"), views: ["floor plan", "front", "back", "left side", "right side"], times: [["Night", "v1"]] },
      { id: "house", name: "Cole house · living room", desc: "The Coles' living room: a fireplace, family photographs on the mantel, a bay window onto the street.", ver: "v5", accepted: "v5", st: "accepted", pic: img("plate-house"), views: ["floor plan", "front", "back", "left side", "right side"], times: [["Day", "v2"], ["Night", "v1"]] },
      { id: "garden", name: "Garden wedding", desc: "A rented garden set for a small wedding: white chairs in rows, an arch of roses, a string quartet's stands.", ver: "v1", accepted: null, st: "you", pic: img("plate-garden"), views: ["floor plan", "front", "back", "left side", "right side"], times: [["Day", "v1"]] },
      { id: "desk", name: "County jail · front desk", desc: "The jail's front desk behind bulletproof glass, a bench for visitors, a clock over the door.", ver: "v1", accepted: "v1", st: "accepted", pic: img("plate-desk"), views: ["floor plan", "front", "back", "left side", "right side"], times: [["Day", "v1"]] },
      { id: "cell", name: "County jail · cell", desc: "A two-bunk cell, a steel toilet, a slit window high in the back wall.", ver: "v1", accepted: "v1", st: "accepted", pic: img("plate-cell"), views: ["floor plan", "front", "back", "left side", "right side"], times: [["Day", "v1"]] },
      { id: "street", name: "Jail street", desc: "The street outside the county jail: a bail bonds office, a bus stop, parked cruisers.", ver: "v1", accepted: "v1", st: "accepted", pic: img("plate-street"), views: ["floor plan", "front", "back", "left side", "right side"], times: [["Day", "v1"]] },
    ],
    props: [{ id: "file", name: "Case file", desc: "A worn manila folder, the case number in marker on its tab, papers sticking out.", ver: "v1", accepted: "v1", st: "accepted", pic: img("prop-folder") }],
    // What drama-cli's status says each one's accepted version is ("accepted", null for none): never inferred from the current one.
    // EP006 on the canvas: scenes, segments, the references each one reads, its board and its latest take
    scenes: [
      { n: 1, place: "apartment", time: "Night", segs: [
        { id: "seg01", s: 27, cast: ["luca", "ivy"], board: null, take: "t02", still: img("still-s1t2"), accepted: null, st: "you", text: "[0-5s] MS: Luca in the hallway, the blanket folded over his arm.\n[5-12s] MS: he folds it again as he talks: {I said the couch is fine.}\n[12-27s] WS: the living room behind him, Ivy at the window.",
          // What drama-cli's spec.json and request.json for t02 say: the take's prompt, its references in order (Image 1, 2, …), its settings, and the versions with what the person decided.
          spec: { model: "sd25", ratio: "9:16", resolution: "480p", seconds: 27,
            images: [img("board-seg02"), img("plate-apartment"), img("cast-luca"), img("cast-ivy")],
            prompt: "Image 1: the storyboard, for the shot structure and camera rhythm; do not adopt its sketch style.\nImage 2: Luca's apartment at night, for the room's layout and the light's direction.\nImage 3: Luca Moreno, base look. Image 4: Ivy Bell, base look.\n[0-9s] Medium shot, Luca in the hallway with the blanket folded over his arm, as Image 3; behind him the living room of Image 2.\n[9-18s] He steps in; Ivy, as Image 4, looks up from the sofa. Dialogue (Luca): {I folded it the way you like.}\n[18-27s] Close-up on Ivy, a small smile.",
            versions: [["t02", "you", ""], ["t01", "back", "He should hold the blanket folded before he speaks."]] } },
        { id: "seg02", s: 15, cast: ["ivy"], board: img("board-seg02"), take: "t01", still: null, accepted: "t01", st: "accepted", text: "[0-6s] CU: Ivy turns from the window.\n[6-15s] MS: she crosses to the couch and takes the blanket from him." } ] },
      { n: 2, place: "apartment", time: "Day", segs: [
        { id: "seg03", s: 28, cast: ["luca", "ethan"], board: img("board-seg03"), take: "t02", still: img("still-s3t2"), accepted: "t01", st: "you", text: "[0-8s] CU: Luca's face as the door opens.\n[8-20s] OTS: Ethan sets the case file on the table.\n[20-28s] MS: neither of them sits." },
        { id: "seg04", s: 22, cast: ["luca", "ethan"], board: img("board-seg04"), take: "t02", still: null, accepted: "t02", st: "accepted", text: "[0-10s] WS: the kitchen, morning light.\n[10-22s] MS: Ethan reads the terms aloud; Luca does not look up." } ] },
    ],
    // The take review: the person watches every take and decides.
    takes: [
      { id: "seg01-t02", seg: "seg01", take: "t02", dur: 5, clip: "clips/take-s1t2.mp4", poster: img("still-s1t2"), prev: { take: "t01", clip: "clips/take-s1t1.mp4", poster: img("still-s1t1"), said: "He should hold the blanket folded before he speaks." },
        shots: ["MS Luca in the hallway, the blanket over his arm", "MS he folds it as he talks", "WS the living room behind him"], scene: "Scene 1 · Luca's apartment · Night" },
      { id: "seg03-t02", seg: "seg03", take: "t02", dur: 10, clip: "clips/take-s3t2.mp4", poster: img("still-s3t2"), prev: { take: "t01", clip: "clips/take-s3t1.mp4", poster: img("still-s3t1"), said: "Too wide at the start; we lose Luca's face." },
        shots: ["WS Ethan at the table, Luca standing", "MS Luca reads the page", "CU the case file"], scene: "Scene 2 · Luca's apartment · Day" },
    ],
    projects: [
      { t: "Bride on Bail", m: "1 of 24 episodes cut", st: "you", lab: "4 need you", spent: "$41.20", p: 12, cover: img("cover-ep1"), tags: ["Romance", "Legal"] },
      { t: "The Contract Groom", m: "12 of 12 episodes cut", st: "accepted", lab: "Done", spent: "$212.60", p: 100, cover: img("cover-groom"), tags: ["Romance"] },
      { t: "Visiting Hours", m: "Analyzing · step 3 of 5", st: "work", lab: "Working", spent: "$0.40", p: 4, cover: img("cover-ep7"), tags: ["Drama"] },
      { t: "Last Toast", m: "EP007 stopped", st: "redline", lab: "Needs you", spent: "$96.10", p: 30, cover: img("cover-guest"), tags: ["Family"] },
    ],
  };
})();

/* Setup, story, lineage and cut content for the remaining screens. Invented, like the rest. */
Object.assign(window.P, {
  presets: [
    { id: "en-us-live-sfw", t: "English · live action · general audience", d: "Vertical live-action drama in English, for all ages." },
    { id: "zh-cn-live-sfw", t: "Chinese · live action · general audience", d: "Vertical live-action drama in Chinese, for all ages." },
    { id: "en-us-anime-sfw", t: "English · anime · general audience", d: "Anime look, English dialogue." },
    { id: "en-us-ad", t: "English · short ad", d: "A 15–60 s ad from a brief and a product." },
  ],
  setupSteps: [
    { t: "Read", c: "bride-on-bail.docx", time: "0:14", done: true },
    { t: "Wrote screenplay.md in Fountain", time: "1:48", done: true },
    { t: "Checked it", c: "drama-cli screenplay validate", time: "0:19", done: true },
    { t: "Fixed 2 cue lines and checked again", time: "0:26", done: true },
    { t: "1 question for you: a heading with no time of day", time: "0:03", done: true },
  ],
  orig: ["EPISODE 6", "lucas apartment, late", "Luca comes in with a blanket over his arm. Ivy is at the counter.", "LUCA: You can have the bed.",
    "IVY (not turning) We said separate rooms.", "-- cut to --", "the apartment, morning", "Ethan sets a case file on the table.", "ETHAN: Read it before you sign."],
  fountain: [
    { el: "section", tx: "# Episode 6", from: [1], why: "Episode line written as a Fountain section." },
    { gap: 1 },
    { el: "heading", tx: "INT. LUCA'S APARTMENT - NIGHT #6-1#", from: [2], why: "Scene heading in Fountain form, numbered. “late” read as Night." },
    { gap: 1 },
    { el: "action", tx: "LUCA MORENO comes in with a blanket over his arm. IVY BELL is at the counter.", from: [3], why: "Names in capitals at their first appearance." },
    { gap: 1 },
    { el: "character", tx: "LUCA", from: [4], why: "Cue and line split, the way Fountain reads dialogue." },
    { el: "dialogue", tx: "You can have the bed.", from: [4] },
    { gap: 1 },
    { el: "character", tx: "IVY", from: [5], why: "Cue, direction and line split." },
    { el: "paren", tx: "(not turning)", from: [5] },
    { el: "dialogue", tx: "We said separate rooms.", from: [5] },
    { gap: 1 },
    { el: "transition", tx: "CUT TO:", from: [6], why: "Transition in Fountain form." },
    { gap: 1 },
    { el: "heading", tx: "INT. LUCA'S APARTMENT - ? #6-2#", from: [7], ask: true, why: "“morning” is not Day or Night as written; tell the agent which." },
    { gap: 1 },
    { el: "action", tx: "ETHAN COLE sets a case file on the table.", from: [8] },
    { gap: 1 },
    { el: "character", tx: "ETHAN", from: [9], why: "Cue and line split." },
    { el: "dialogue", tx: "Read it before you sign.", from: [9] },
  ],
  bible: {
    logline: "To keep her inheritance, a florist marries the stranger she bailed out of county jail, and his lawyer brother wants the marriage annulled before the trust pays out.",
    beats: ["Ivy pays Luca's bail on the morning of her own wedding.", "The Coles learn the groom is out on bail.", "A contract: separate rooms, no other partners, divorce when the trust is released.", "Ethan builds the case for annulment.", "Luca's charge turns out to be someone else's."],
    eps: [
      ["EP001", "The Wedding", "Ivy walks down the aisle to a man she met that morning."],
      ["EP002", "Booked", "How Luca came to be in a cell, told at the front desk."],
      ["EP003", "Out on Bail", "Walking out of county with a wife he never asked for."],
      ["EP004", "The Contract", "Three lines on a page, and Ethan reading over their shoulders."],
      ["EP005", "Separate Rooms", "The first night, and the blanket on the couch."],
      ["EP006", "Night Shift", "Ethan sets the case file on the table."],
    ],
  },
  names: { ivy: ["Ivy", "Mrs. Moreno"], luca: ["Luca", "the groom"], ethan: ["Ethan", "Counsel"], margaret: ["Margaret", "Mrs. Cole"], walter: ["Walter"], dunn: ["Sgt. Dunn", "Ray"], hale: ["the Reverend"], tess: ["Tess"] },
  cut: { dur: 15, src: "clips/cut-ep6.mp4", segs: [["seg01", "t02", 5, "img/still-s1t2.jpg"], ["seg03", "t02", 10, "img/still-s3t2.jpg"]],
    // What drama-cli made each take from (its spec.json), and the breakdown's lines at their times in the cut.
    spec: { model: "Seedance 2.5", resolution: "480p", ratio: "9:16", fps: 24 },
    // Each segment's takes, with length, poster and drama-cli status: an edit picks among the accepted ones only.
    takes: { seg01: [["t01", 6, "img/still-s1t1.jpg", "back"], ["t02", 5, "img/still-s1t2.jpg", "accepted"]],
      seg03: [["t01", 11, "img/still-s3t1.jpg", "back"], ["t02", 10, "img/still-s3t2.jpg", "accepted"]],
      seg04: [["t02", 22, "img/board-seg04.jpg", "accepted"]] },
    // What the edit draft rests on: the cut it started from and each input's sha256 (drama_cli/edit.py pins both).
    base: { v: "v1", sha: "3f9a2c1e", inputs: [["seg01 · t02", "a41c09d2"], ["seg03 · t02", "7be3f015"]] },
    // A newer cut the agent made after the draft began: seg04's take was accepted, so the agent added it.
    newer: { v: "v2", sha: "c07d51ab", clips: [["seg01", "t02", 0, 5], ["seg03", "t02", 0, 10], ["seg04", "t02", 0, 22]] },
    lines: [[0.6, 2.2, "Luca: You kept it."], [3.4, 1.6, "Ethan: Every page."], [6.2, 2.8, "Luca: Then read me the last one."], [11.4, 2.4, "Ethan: It ends with your name."]],
    notes: [{ t: 3.2, text: "Hold on the blanket a beat longer." }, { t: 11, text: "The cut to the file is too early." }] },
});
