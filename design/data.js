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
    // EP006 on the canvas: scenes, segments, the references each one reads, its board and its latest take. Per segment,
    // for the canvas's stage nodes: shots (breakdown.json's Shot fields: [time, size, angle, camera, visual, audio]),
    // photo and photoSt (the photoreal storyboard and its state; the sample reuses a still), refs ([name, picture, asset id
    // or null for the segment's own blocking or first-frame reference]).
    scenes: [
      { n: 1, place: "apartment", time: "Night", segs: [
        { id: "seg01", s: 27, cast: ["luca", "ivy"], board: null, take: "t02", still: img("still-s1t2"), accepted: null, st: "you", shots: [["0-5s", "medium shot", "eye level", "static", "Luca in the hallway, the blanket folded over his arm.", "Room tone."], ["5-12s", "medium shot", "eye level", "static", "He folds it again as he talks.", "Dialogue: {I said the couch is fine.}"], ["12-27s", "wide shot", "eye level", "slow push in", "The living room behind him, Ivy at the window.", "Room tone."]], photo: img("still-s1t1"), photoSt: "accepted", refs: [["Luca Moreno", img("face-luca"), "luca"], ["Ivy Bell", img("face-ivy"), "ivy"], ["Luca's apartment · Night", img("plate-apartment"), "apartment"], ["First frame v2", img("still-s1t2"), null]], text: "[0-5s] MS: Luca in the hallway, the blanket folded over his arm.\n[5-12s] MS: he folds it again as he talks: {I said the couch is fine.}\n[12-27s] WS: the living room behind him, Ivy at the window.",
          // What drama-cli's spec.json and request.json for t02 say: the take's prompt, its references in order (Image 1, 2, …), its settings, and the versions with what the person decided.
          spec: { model: "sd25", ratio: "9:16", resolution: "480p", seconds: 27,
            images: [img("board-seg02"), img("plate-apartment"), img("cast-luca"), img("cast-ivy")],
            prompt: "Image 1: the storyboard, for the shot structure and camera rhythm; do not adopt its sketch style.\nImage 2: Luca's apartment at night, for the room's layout and the light's direction.\nImage 3: Luca Moreno, base look. Image 4: Ivy Bell, base look.\n[0-9s] Medium shot, Luca in the hallway with the blanket folded over his arm, as Image 3; behind him the living room of Image 2.\n[9-18s] He steps in; Ivy, as Image 4, looks up from the sofa. Dialogue (Luca): {I folded it the way you like.}\n[18-27s] Close-up on Ivy, a small smile.",
            versions: [["t02", "you", ""], ["t01", "back", "He should hold the blanket folded before he speaks."]] } },
        { id: "seg02", s: 15, cast: ["ivy"], board: img("board-seg02"), take: "t01", still: null, accepted: "t01", st: "accepted", shots: [["0-6s", "close-up", "eye level", "static", "Ivy turns from the window.", "Room tone."], ["6-15s", "medium shot", "eye level", "pan right", "She crosses to the couch and takes the blanket from him.", "Room tone."]], photo: img("still-s1t1"), photoSt: "accepted", refs: [["Ivy Bell", img("face-ivy"), "ivy"], ["Luca's apartment · Night", img("plate-apartment"), "apartment"]], text: "[0-6s] CU: Ivy turns from the window.\n[6-15s] MS: she crosses to the couch and takes the blanket from him." } ] },
      { n: 2, place: "apartment", time: "Day", segs: [
        { id: "seg03", s: 28, cast: ["luca", "ethan"], board: img("board-seg03"), take: "t02", still: img("still-s3t2"), accepted: "t01", st: "you", shots: [["0-8s", "close-up", "eye level", "static", "Luca's face as the door opens.", "Room tone."], ["8-20s", "medium close-up", "eye level", "static", "Ethan sets the case file on the table.", "Dialogue: {Sign it, or I file tomorrow.}"], ["20-28s", "medium shot", "eye level", "slow pull out", "Neither of them sits.", "Room tone."]], photo: img("still-s3t1"), photoSt: "accepted", refs: [["Luca Moreno", img("face-luca"), "luca"], ["Ethan Cole", img("face-ethan"), "ethan"], ["Luca's apartment · Day", img("plate-apartment"), "apartment"], ["Case file", img("prop-folder"), "file"], ["Blocking v1", img("board-seg03"), null]], text: "[0-8s] CU: Luca's face as the door opens.\n[8-20s] OTS: Ethan sets the case file on the table.\n[20-28s] MS: neither of them sits." },
        { id: "seg04", s: 22, cast: ["luca", "ethan"], board: img("board-seg04"), take: "t02", still: null, accepted: "t02", st: "accepted", shots: [["0-10s", "wide shot", "eye level", "static", "The kitchen, morning light.", "Room tone."], ["10-22s", "medium shot", "eye level", "static", "Ethan reads the terms aloud; Luca does not look up.", "Dialogue: {Separate rooms. No other partners.}"]], photo: img("still-s3t2"), photoSt: "accepted", refs: [["Luca Moreno", img("face-luca"), "luca"], ["Ethan Cole", img("face-ethan"), "ethan"], ["Luca's apartment · Day", img("plate-apartment"), "apartment"]], text: "[0-10s] WS: the kitchen, morning light.\n[10-22s] MS: Ethan reads the terms aloud; Luca does not look up." } ] },
    ],
    // The take review: the person watches every take and decides.
    takes: [
      { id: "seg01-t02", seg: "seg01", take: "t02", dur: 5, clip: "clips/take-s1t2.mp4", poster: img("still-s1t2"), prev: { take: "t01", clip: "clips/take-s1t1.mp4", poster: img("still-s1t1"), said: "He should hold the blanket folded before he speaks." },
        shots: ["MS Luca in the hallway, the blanket over his arm", "MS he folds it as he talks", "WS the living room behind him"], scene: "Scene 1 · Luca's apartment · Night" },
      { id: "seg03-t02", seg: "seg03", take: "t02", dur: 10, clip: "clips/take-s3t2.mp4", poster: img("still-s3t2"), prev: { take: "t01", clip: "clips/take-s3t1.mp4", poster: img("still-s3t1"), said: "Too wide at the start; we lose Luca's face." },
        shots: ["WS Ethan at the table, Luca standing", "MS Luca reads the page", "CU the case file"], scene: "Scene 2 · Luca's apartment · Day" },
    ],
    projects: [
      { t: "Bride on Bail", st: "you", lab: "4 need you", ago: "4 min ago", format: "9:16", cover: img("cover-ep1") },
      { t: "The Contract Groom", st: "accepted", lab: "Done", ago: "2 days ago", format: "9:16", cover: img("cover-groom") },
      { t: "Visiting Hours", st: "work", lab: "Working", ago: "12 min ago", format: "9:16", cover: null },
      { t: "Last Toast", st: "redline", lab: "Needs you", ago: "1 h ago", format: "9:16", cover: img("cover-guest") },
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
  /* Script (design, D62): The Stepmother's real files, as replay records them (fixtures/replay/samples/en): the
     original upload, v1 of drama-cli's Fountain rewrite as fountain-js 1.2.4 printed it, and its review.md
     with the line map drama-cli writes in it. */
  script: {"project": "The Stepmother", "file": "stepmother.md", "original": "# The Stepmother (sample screenplay)\n\nEPISODE 1\n\nINT. TENEMENT FLAT - MORNING\nLIN XIAOYU stands in the doorway with an old suitcase. Inside, WEI ZHEN ladles porridge for his younger siblings without looking up.\nWEI ZHEN: So you're the one my father married?\nLIN XIAOYU: I'm Lin Xiaoyu. From today, I run this house.\nWei Zhen sets the bowl down hard.\nWEI ZHEN: This house doesn't need running.\n\nEPISODE 2\n\nEXT. FACTORY GATE - DUSK\nLin waits outside the gatehouse. Wei Zhen wheels his bicycle out, sees her, and turns away.\nLIN XIAOYU: I paid your sister's school fees.\nHe stops.\nWEI ZHEN: Who asked you to?\n", "fountainText": "# Episode 1\n\nINT. TENEMENT FLAT - DAY #1-1#\n\nLIN XIAOYU stands in the doorway with an old suitcase. Inside, WEI ZHEN ladles porridge for his younger siblings without looking up.\n\nWEI ZHEN\nSo you're the one my father married?\n\nLIN XIAOYU\nI'm Lin Xiaoyu. From today, I run this house.\n\nWei Zhen sets the bowl down hard.\n\nWEI ZHEN\nThis house doesn't need running.\n\n# Episode 2\n\nEXT. FACTORY GATE - NIGHT #2-1#\n\nLin waits outside the gatehouse. Wei Zhen wheels his bicycle out, sees her, and turns away.\n\nLIN XIAOYU\nI paid your sister's school fees.\n\nHe stops.\n\nWEI ZHEN\nWho asked you to?\n", "fountain": [{"el": "section", "text": "# Episode 1", "source": 0}, {"gap": true}, {"el": "heading", "text": "INT. TENEMENT FLAT - DAY #1-1#", "source": 2}, {"gap": true}, {"el": "action", "text": "LIN XIAOYU stands in the doorway with an old suitcase. Inside, WEI ZHEN ladles porridge for his younger siblings without looking up.", "source": 4}, {"gap": true}, {"el": "character", "text": "WEI ZHEN", "source": 6}, {"el": "dialogue", "text": "So you're the one my father married?", "source": 7}, {"gap": true}, {"el": "character", "text": "LIN XIAOYU", "source": 9}, {"el": "dialogue", "text": "I'm Lin Xiaoyu. From today, I run this house.", "source": 10}, {"gap": true}, {"el": "action", "text": "Wei Zhen sets the bowl down hard.", "source": 12}, {"gap": true}, {"el": "character", "text": "WEI ZHEN", "source": 14}, {"el": "dialogue", "text": "This house doesn't need running.", "source": 15}, {"gap": true}, {"el": "section", "text": "# Episode 2", "source": 17}, {"gap": true}, {"el": "heading", "text": "EXT. FACTORY GATE - NIGHT #2-1#", "source": 19}, {"gap": true}, {"el": "action", "text": "Lin waits outside the gatehouse. Wei Zhen wheels his bicycle out, sees her, and turns away.", "source": 21}, {"gap": true}, {"el": "character", "text": "LIN XIAOYU", "source": 23}, {"el": "dialogue", "text": "I paid your sister's school fees.", "source": 24}, {"gap": true}, {"el": "action", "text": "He stops.", "source": 26}, {"gap": true}, {"el": "character", "text": "WEI ZHEN", "source": 28}, {"el": "dialogue", "text": "Who asked you to?", "source": 29}], "review": "# A rewrite of the screenplay, to read before accepting it\n\nThe original: `inputs/screenplay.md`. The rewrite: `screenplay/v1/screenplay.fountain`.\n\n## Removed from the original\n\n- 1: # The Stepmother (sample screenplay)\n\n## Added by the rewrite\n\nNone.\n\n## Put in notes, never produced\n\nNone.\n\n## What the rewrite reads as\n\nscreenplay/v1/screenplay.fountain: 2 episodes, 2 scenes, 6 dialogue blocks; speakers: WEI ZHEN 4, LIN XIAOYU 2\n\n## Each line of the original, with what the rewrite made of it\n\n`line | the original | what it became` (`-`: none of its letters came back).\n\n```text\n1 | # The Stepmother (sample screenplay) | -\n3 | EPISODE 1 | 1: # Episode 1\n5 | INT. TENEMENT FLAT - MORNING | 3: INT. TENEMENT FLAT - DAY #1-1#\n6 | LIN XIAOYU stands in the doorway with an old suitcase. … | 5: (unchanged)\n7 | WEI ZHEN: So you're the one my father married? | 7-8: WEI ZHEN / So you're the one my father married?\n8 | LIN XIAOYU: I'm Lin Xiaoyu. From today, I run this house. | 10-11: LIN XIAOYU / I'm Lin Xiaoyu. From today, I run this house.\n9 | Wei Zhen sets the bowl down hard. | 13: (unchanged)\n10 | WEI ZHEN: This house doesn't need running. | 15-16: WEI ZHEN / This house doesn't need running.\n12 | EPISODE 2 | 18: # Episode 2\n14 | EXT. FACTORY GATE - DUSK | 20: EXT. FACTORY GATE - NIGHT #2-1#\n15 | Lin waits outside the gatehouse. … | 22: (unchanged)\n16 | LIN XIAOYU: I paid your sister's school fees. | 24-25: LIN XIAOYU / I paid your sister's school fees.\n17 | He stops. | 27: (unchanged)\n18 | WEI ZHEN: Who asked you to? | 29-30: WEI ZHEN / Who asked you to?\n```\n", "map": [{"o": 1, "to": [], "same": false, "became": "-"}, {"o": 3, "to": [1], "same": false, "became": "1: # Episode 1"}, {"o": 5, "to": [3], "same": false, "became": "3: INT. TENEMENT FLAT - DAY #1-1#"}, {"o": 6, "to": [5], "same": true, "became": "5: (unchanged)"}, {"o": 7, "to": [7, 8], "same": false, "became": "7-8: WEI ZHEN / So you're the one my father married?"}, {"o": 8, "to": [10, 11], "same": false, "became": "10-11: LIN XIAOYU / I'm Lin Xiaoyu. From today, I run this house."}, {"o": 9, "to": [13], "same": true, "became": "13: (unchanged)"}, {"o": 10, "to": [15, 16], "same": false, "became": "15-16: WEI ZHEN / This house doesn't need running."}, {"o": 12, "to": [18], "same": false, "became": "18: # Episode 2"}, {"o": 14, "to": [20], "same": false, "became": "20: EXT. FACTORY GATE - NIGHT #2-1#"}, {"o": 15, "to": [22], "same": true, "became": "22: (unchanged)"}, {"o": 16, "to": [24, 25], "same": false, "became": "24-25: LIN XIAOYU / I paid your sister's school fees."}, {"o": 17, "to": [27], "same": true, "became": "27: (unchanged)"}, {"o": 18, "to": [29, 30], "same": false, "became": "29-30: WEI ZHEN / Who asked you to?"}]},
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
    { el: "trans", tx: "CUT TO:", from: [6], why: "Transition in Fountain form." },
    { gap: 1 },
    { el: "heading", tx: "INT. LUCA'S APARTMENT - ? #6-2#", from: [7], ask: true, why: "“morning” is not Day or Night as written; tell the agent which." },
    { gap: 1 },
    { el: "action", tx: "ETHAN COLE sets a case file on the table.", from: [8] },
    { gap: 1 },
    { el: "character", tx: "ETHAN", from: [9], why: "Cue and line split." },
    { el: "dialogue", tx: "Read it before you sign.", from: [9] },
  ],
  // The bible as drama-cli writes it (bible.json, drama_cli/schemas/bible.py): the logline, the tone, and per episode its
  // title, summary, end hook and seconds; the beats are the bible's, each [seconds, event], grouped under the episode whose
  // lines hold them (both carry their screenplay lines). Sample words for the prototype.
  bible: {
    // drama-cli accepts only a bible that covers the whole accepted screenplay (short_drama doc/drama-cli/long-screenplays.md);
    // the sample lists 6 of its 24 episodes.
    version: "b0003", accepted: "b0003", covers: "EP001–EP024",
    logline: "To keep her inheritance, a florist marries the stranger she bailed out of county jail, and his lawyer brother wants the marriage annulled before the trust pays out.",
    tone: "Glossy legal romance, fast and teasing; kisses and no more.",
    eps: [
      { code: "EP001", title: "The Wedding", summary: "Ivy walks down the aisle to a man she met that morning.", seconds: 39, hook: "Margaret Cole stands up when the Reverend asks for objections.",
        beats: [[12, "Ivy pays Luca's bail on the morning of her own wedding."], [18, "The Coles learn the groom is out on bail."], [9, "Ivy says yes before Margaret can finish."]] },
      { code: "EP002", title: "Booked", summary: "How Luca came to be in a cell, told at the front desk.", seconds: 30, hook: "The arresting officer's name is the Coles' family lawyer's.",
        beats: [[12, "Sgt. Dunn reads Luca's charge aloud."], [18, "Luca won't say where he was that night."]] },
      { code: "EP003", title: "Out on Bail", summary: "Walking out of county with a wife he never asked for.", seconds: 30, hook: "Ethan is waiting at the jail's door.",
        beats: [[12, "Luca asks why she paid."], [18, "Ivy tells him about the trust."]] },
      { code: "EP004", title: "The Contract", summary: "Three lines on a page, and Ethan reading over their shoulders.", seconds: 30, hook: "Ethan photographs the last line.",
        beats: [[12, "A contract: separate rooms, no other partners, divorce when the trust is released."], [18, "Both sign; neither reads it twice."]] },
      { code: "EP005", title: "Separate Rooms", summary: "The first night, and the blanket on the couch.", seconds: 30, hook: "Luca hears Ivy crying through the wall.",
        beats: [[12, "Luca takes the couch."], [18, "Ivy brings him a blanket and doesn't leave."]] },
      { code: "EP006", title: "Night Shift", summary: "Ethan sets the case file on the table.", seconds: 30, hook: "The file holds a photo of Luca with someone else's name on it.",
        beats: [[12, "Ethan builds the case for annulment."], [18, "He brings the file to the apartment at night."]] },
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
