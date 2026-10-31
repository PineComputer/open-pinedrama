/* The rest of the flow in the pro direction: Upload, Analyzing, Fountain review, Bible, Graph (lineage) and Cut,
   plus the setup steps and the stop cards. Uses the shell and helpers app.js exposes as window.PD. */
(() => {
  const { html, I, S, set, go, own, jump, openHome, openStage, openLineage, stageNode, Submission, submit, toast, money, Status, TopBar, StopBanner, ProjectChips, AgentPanel, SPENT_COVERS, useEffect, useRef } = window.PD;

  /* ───── stop cards: drama-cli's refusal shown as data ───── */
  function StopCard({ kind }) {
    const K = {
      redline: { icon: "warning", head: "Stopped · a red line in the screenplay", title: "EP007's bible range names a red line", code: "RedLine",
        said: "Bible bible/b0004 is not usable: red line: EP007 scene 4, a guard strikes Luca in the cell on screen. See bible/b0004/bible.md; report it to the person and pass their decision back with drama-cli bible --config drama-cli.cfg.yaml EP007-EP012 --feedback '<their decision>'",
        acts: [["Decide in your words", "primary"], ["Open the scene", ""]], note: "Only a red line in your screenplay stops for you. Other episodes carry on." },
      // A refusal drama-cli gives no code of its own (a bare Refused) is shown as it came, never matched on its words.
      budget: { icon: "info", head: "drama-cli refused", title: "The agent needs you to read this", code: "Refused",
        said: "Budget exceeded: spent 996.40 + reserved 3.20 + this 1.20 > budget 1000.00",
        acts: [["Answer the agent", "primary"], ["Stop the drama", "danger"]], note: "Work in flight is waited on and recorded, never sent again." },
      cap: { icon: "stack", head: "Stopped · limit reached", title: "EP004 seg06's storyboard reached its limit of new versions", code: "SetLimitExceeded.max_new_versions",
        said: "episodes/EP004/multi_panel_storyboard/seg06/line-art has had 3 new paid versions after its first, the limit defaults.max_new_versions (3); ask the person before making it again: they lift the limit for that item by raising defaults.max_new_versions in the config, then set it back; then run drama-cli storyboard --config drama-cli.cfg.yaml EP004 seg06",
        // drama-cli's action for a cap is ask_person (drama_cli/errors.py): the maker answers; the studio invents no one-time allowance.
        acts: [["Answer the agent", "primary"], ["See seg06's versions", ""]], note: "drama-cli asks you before it spends again. Say in your answer whether to raise the limit, as drama-cli describes, or to stop here; the agent follows drama-cli's steps." },
      // On Pine the provider keys are Pine's (doc/drama-cli/module.md): a refusal of access points to the Pine session's access,
      // never to a key the maker sets. drama-cli's AccessDenied.ModuleRuntime is ask_person (drama_cli/pine_runtime_client.py).
      env: { icon: "lock-simple", head: "Stopped · Pine access denied", title: "Pine refused this session's access", code: "AccessDenied.ModuleRuntime",
        said: "Pine returned HTTP 403: session or generation access is denied; restore access and check the active turn before continuing",
        acts: [["Check your Pine access", "primary"], ["Answer the agent", ""]], note: "Nothing new was generated. Requests already sent are checked, never sent again. You never handle provider keys on Pine." },
    }[kind];
    return html`<section class=${"stopcard " + kind} aria-label=${K.head}>
      <header>${I(K.icon)}<span>${K.head}</span><span class="grow"></span><span class="mono">${{ cap: "EP004", redline: "EP007" }[kind] || ""}</span></header>
      <div class="sbody"><h3>${K.title}</h3>
        <dl class="kv"><dt>Code</dt><dd class="mono">${K.code}</dd><dt>drama-cli said</dt><dd class="said mono">${K.said}</dd></dl>
        <div class="acts">${K.acts.map(([l, c]) => html`<button class=${"btn sm " + c} onClick=${() => toast("Prototype: " + l + ".")}>${l}</button>`)}<span class="subtle" style="font-size:11.5px">${K.note}</span></div>
        <span class="subtle" style="font-size:11px">The message is drama-cli's, as it wrote it (example values).</span></div></section>`;
  }

  /* ───── Upload ───── */
  function Upload() {
    const ready = S.file && S.preset;
    const pick = () => set({ file: { name: "bride-on-bail.docx", size: "212 KB", pages: 41 } });
    return html`<div class="main">
      <header class="top"><button class="ibtn" aria-label="Back" onClick=${() => go("home")}>${I("caret-left")}</button><div class="crumb"><span>Projects</span>${I("caret-right")}<b>New project</b></div><span class="grow"></span></header>
      <div class="scrollmain"><div class="wrap" style="max-width:1040px">
        <div class="greet"><div class="grow"><h1>New project</h1><p>Check the file, choose how it is made, and start. drama-cli's screenplay check is free; the agent's turns are billed from the start.</p></div></div>
        <div class="formgrid">
          <div class="fcol">
            <section class="panel"><h3>${I("file-text")}Screenplay</h3>
              ${S.file ? html`<div class="filerow">${I("file-text")}<span class="grow"><b>${S.file.name}</b><small>${S.file.size} · ${S.file.pages} pages · Word</small></span><button class="btn sm ghost" onClick=${() => set({ file: null })}>Replace</button></div>`
                : html`<button class=${"dropzone " + (S.over ? "over" : "")} onClick=${pick} onDragOver=${(e) => { e.preventDefault(); if (!S.over) set({ over: true }); }} onDragLeave=${() => set({ over: false })} onDrop=${(e) => { e.preventDefault(); set({ over: false }); pick(); }}>
                  <span class="plus">${I("upload")}</span><b>Drop your screenplay</b><small>Fountain, Word, PDF or plain text · or click to choose</small></button>`}
            </section>
            <section class="panel"><h3>${I("sliders-horizontal")}Preset</h3><p class="muted" style="margin-bottom:10px">How the drama is made: language, look and audience. You choose; it can't be changed later.</p>
              <div class="presets" role="radiogroup" aria-label="Preset">${P.presets.map((p, i) => html`<label class="preset"><button type="button" class="radio" role="radio" data-slot="radio-group-item" aria-checked=${String(S.preset === p.id)} data-state=${S.preset === p.id ? "checked" : "unchecked"} tabindex=${S.preset ? (S.preset === p.id ? 0 : -1) : (i === 0 ? 0 : -1)} onClick=${() => set({ preset: p.id })}></button>
                <span class="grow"><b>${p.t}</b><small>${p.d}</small><code>${p.id}</code></span></label>`)}</div></section>
            <section class="panel"><h3>${I("clock")}Episodes and budget</h3>
              <div class="fields">
                <label><span>Episode length</span><div class="seg">${["60", "90", "120"].map((v) => html`<button aria-pressed=${String(S.len === v)} onClick=${() => set({ len: v })}>${v} s</button>`)}</div></label>
                ${/* What the maker reviews; the studio approves the rest (the product's ReviewingChoice, its texts verbatim).
                     Like the preset cards, the product's DOM: a label holding the kit's Radix radio (WAI-ARIA APG radio group): one kit control, two uses. */ ""}
                <div class="field"><span>Your reviews</span>
                  <div class="presets one" role="radiogroup" aria-label="Your reviews">${[
                    ["every", "Every step", "You approve the leads' looks, the shared references, and each episode's storyboards, takes and cut."],
                    ["key", "Looks, photoreal storyboards, takes and cuts", "You approve the leads' looks and every photoreal storyboard, and watch every take and cut. The shared references and line-art storyboards go on as the agent makes them."],
                    ["none", "Photoreal storyboards, takes and cuts", "You approve every photoreal storyboard, watch every take and cut, and answer the agent's questions. The leads' looks, the shared references and line-art storyboards go on as the agent makes them."],
                  ].map(([v, l, hint]) => html`<label class="preset"><button type="button" class="radio" role="radio" data-slot="radio-group-item" aria-checked=${String(S.reviewing === v)} data-state=${S.reviewing === v ? "checked" : "unchecked"} tabindex=${S.reviewing === v ? 0 : -1} onClick=${() => set({ reviewing: v })}></button>
                    <span class="grow"><b>${l}</b><small>${hint}</small></span></label>`)}</div></div>
                <label><span>Budget</span><div class="inputwrap">$<input value=${S.budget} inputmode="decimal" onInput=${(e) => set({ budget: e.target.value })}/></div><small class="muted">${SPENT_COVERS} The drama stops and asks you when it is spent.</small></label>
              </div></section>
          </div>
          <aside class="panel next"><h3>What happens next</h3>
            <ol class="nextsteps">
              <li><b>The agent rewrites your file into Fountain and checks it</b><small>Minutes. drama-cli's check is free; the agent's turns are billed.</small></li>
              <li><b>You review what changed</b><small>Answer its questions, then accept in your own words.</small></li>
              <li><b>The agent writes the bible and draws the cast and places</b><small>You review the looks before any episode starts.</small></li>
              <li><b>Episodes: storyboards, then takes</b><small>You watch every video version (Take) and decide.</small></li></ol>
            <button class="btn lg primary" style="width:100%" disabled=${!ready} onClick=${() => { go("script"); set({ state: "scriptRewriting", sview: null }); }}>Start</button>
            <small class="muted">${ready ? "Starts the setup session." : !S.file ? "Add a screenplay to start." : "Choose a preset to start."}</small></aside>
        </div></div></div></div>`;
  }

  /* ───── Bible and Assets ───── */
  function ReviewBtns({ id }) {
    const v = S.cards[id];
    const setv = (val) => set({ cards: { ...S.cards, [id]: v === val ? undefined : val } });
    return html`<div class="cardacts"><button class=${"mini acc"} aria-pressed=${String(v === "accept")} onClick=${() => setv("accept")}>${I("check")}Accept</button>
      <button class="mini back" aria-pressed=${String(v === "back")} onClick=${() => setv("back")}>${I("arrow-counter-clockwise")}Send back</button>
      <button class="mini note" aria-pressed=${String(v === "note")} onClick=${() => setv("note")}>${I("note-pencil")}Accept with note</button></div>
      ${(v === "back" || v === "note") && html`<input class="why" placeholder=${v === "back" ? "Why it goes back (required)" : "Your note, kept with the accepted version"} value=${S.cardWhy[id] || ""} onInput=${(e) => set({ cardWhy: { ...S.cardWhy, [id]: e.target.value } })}/>`}`;
  }
  function Bible() {
    // IA draft (§16), named as drama-cli names it: Bible is the bible's home; Assets is the home of characters, locations and props, with its own tabs.
    const story = (S.stab || "bible") === "bible";
    // §16: a link lands here with its object picked (S.asel), marked and scrolled into view.
    useEffect(() => { if (S.asel) document.querySelector(`[data-asset="${S.asel}"]`)?.scrollIntoView({ block: "center" }); }, [S.asel, S.stab]);
    const picked = (id) => ({ "data-asset": id, "aria-current": S.asel === id ? "true" : undefined });
    /* Codex round 3 (fix 3): a link that names an older version (S.at.ver) shows that version on the card, with the
       current one beside it. Versions are numbered v1… in order and kept (drama-cli appends, never rewrites), so the
       strip lists v1 up to the current one. The sample holds only current pictures, and says so for an older one. */
    const kindOf = { cast: "look", scenes: "plate", props: "prop" }[S.stab];
    const versionsOf = (x) => { const [, pre, n] = x.ver.match(/^(.*?)v(\d+)$/); return Array.from({ length: Number(n) }, (_, i) => pre + "v" + (i + 1)); };
    const shownOf = (x) => (S.asel === x.id && S.at && S.at.ver && versionsOf(x).includes(S.at.ver) ? S.at.ver : x.ver);
    const head = (x) => { const shown = shownOf(x); return html`
      <div style="display:flex;align-items:baseline;gap:8px"><b class="grow">${x.name}</b><span class="mono subtle" style="font-size:11px">${shown}</span>
        ${shown !== x.ver && html`<span class="mono muted" style="font-size:11px">current ${x.ver}</span>`}</div>`; };
    /* J1: an asset's one home is its card here, opened as a detail beside the grid (as Lineage's inspector sits beside
       its graph): its versions, state, findings and review, its spec, and Lineage. The canvas and Lineage link to it. */
    const openCard = (id) => ({ role: "button", tabindex: 0, onClick: () => set({ asel: id, at: null }), onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); set({ asel: id, at: null }); } } });
    const AssetDetail = ({ x }) => { const shown = shownOf(x), all = versionsOf(x), cur = shown === x.ver, lin = lineageOf(x.id);
      const src = x.sheet || x.pic, kind = { cast: "Character", scenes: "Location", props: "Prop" }[S.stab];
      return html`<aside class="insp" aria-label=${x.name}>
        <div class="ihead"><div style="display:flex;align-items:center;gap:8px"><b class="grow">${x.name}</b><button class="ibtn" aria-label="Close" onClick=${() => set({ asel: null, at: null })}>${I("x")}</button></div>
          <small>${kind} · ${kindOf} ${shown}</small>
          <button class="btn sm" disabled=${!lin} title=${lin ? "" : "Lineage: this sample traces seg03 and what it reads"} onClick=${() => openLineage(lin, x.name + " · Assets")}>${I("tree-structure")}Lineage</button></div>
        <div class="iscroll">
          <div class="isec">${cur ? html`<img class="assetbig" src=${src} alt=""/>` : html`<p class="subtle">${shown}'s picture isn't in this sample.</p>`}
            ${x.views && html`<div class="viewstrip" role="group" aria-label="Views">${x.views.map((v, i) => html`<button aria-pressed=${String(i === 0)} onClick=${() => toast("Shows the " + v + " view large. This sample has the plate only.")}><img src=${src} alt=""/><small>${v}</small></button>`)}</div>`}</div>
          ${x.desc && html`<div class="isec"><p class=${"desc" + (S.more ? "" : " clamp3")}>${x.desc}</p><button class="linkbtn" onClick=${() => set({ more: !S.more })}>${S.more ? "Less" : "More"}</button></div>`}
          <div class="isec"><h4>Versions <span class="muted">${all.length}</span></h4>
            <div class="vstrip" role="group" aria-label=${"Versions of " + x.name}>${all.map((v) => html`<button aria-pressed=${String(v === shown)} onClick=${() => set({ at: { kind: kindOf, ver: v } })}>${v.replace(/^.* /, "")}</button>`)}</div>
            <p class="mono subtle" style="font-size:11.5px;margin:8px 0 6px">current ${x.ver} · ${x.accepted ? "accepted " + x.accepted : "none accepted"}</p>
            <div style="display:flex;gap:6px;flex-wrap:wrap">${cur ? Status(x.st === "stale" ? "accepted" : x.st) : shown === x.accepted ? Status("accepted") : html`<span class="subtle">Not the accepted version.</span>`}${x.problems && Status("stale", "Out of date")}</div></div>
          ${cur && x.problems && html`<div class="isec"><h4>Why it's out of date</h4>${x.problems.map((said) => html`<div class="finding warn">${I("warning")}<span>${said}</span></div>`)}<p class="subtle">The agent redraws it.</p></div>`}
          ${cur && x.st === "you" && html`<div class="isec"><h4>Your review</h4>${S.stab === "cast" && html`<div class="finding warn">${I("warning")}<span>warn · The blouse reads as purple; the bible says plum.</span></div>`}<${ReviewBtns} id=${x.id}/></div>`}
          ${cur && x.st === "back" && html`<div class="isec"><h4>Review</h4><div class="finding err">${I("warning-circle")}<span>Sent back by the agent: the observer found an error (a third hand). Redrawing.</span></div></div>`}
        </div></aside>`; };
    // An older version keeps its own state: accepted if status says so; the review and findings belong to the current one.
    const pic = (x, src, chip) => (shownOf(x) === x.ver
      ? html`<div class="pic"><img src=${src} alt=""/>${chip}</div>`
      : html`<div class="pic"><span class="empty">${shownOf(x)}'s picture isn't in this sample.</span>${shownOf(x) === x.accepted && Status("accepted")}</div>`);
    const asset = S.stab !== "bible" && { cast: P.cast, scenes: P.places, props: P.props }[S.stab].find((x) => x.id === S.asel);
    const open = ["margaret", "garden"], decided = open.filter((k) => S.cards[k] && (S.cards[k] !== "back" || (S.cardWhy[k] || "").trim())).length;
    return html`<div class="main">
      <${TopBar} crumbs=${(S.stab || "bible") === "bible" ? [own.drama(), "Bible"] : [own.drama(), own.assets(), ...(asset ? [own.tab(S.stab), asset.name + " · " + shownOf(asset)] : [own.tab(S.stab)[0]])]}/>
      <div class="body"><div class="scrollmain">
        <div class="bar2"><span class="grow"></span><${ProjectChips}/></div>
        <${StopBanner}/>
        <div style="padding:0 16px"><div class="tabsrow" style="margin:4px 0 18px">${story ? html`<div><h2 class="pagetitle">Bible</h2><p class="muted pagesub">The logline, and for each episode its title, summary, end hook and beats, written from your script.</p></div>` : html`<h2 class="pagetitle">${{ cast: "Characters", scenes: "Locations", props: "Props" }[S.stab]} <span class="muted">· ${{ cast: P.cast, scenes: P.places, props: P.props }[S.stab].length}</span></h2>`}
          <span class="grow"></span><span class="muted" style="font-size:12px">${story ? `${P.bible.version} · accepted · ${P.bible.written} written` : "Shared by every episode"}</span></div></div>
        ${/* The bible as drama-cli writes it (bible.json): the logline and the tone, then one row per episode with its title,
             summary, end hook and seconds; each episode's beats open under it (WAI-ARIA APG Disclosure), so the beats read as that episode's. */ ""}
        ${S.stab === "bible" && html`<div class="biblegrid">
          <section class="panel wide"><span class="kick">Logline</span><p class="logline">${P.bible.logline}</p>
            <span class="kick" style="margin-top:14px">Tone</span><p class="tone">${P.bible.tone}</p></section>
          <section class="panel wide"><h3>${I("film-strip")}Episodes<span class="grow"></span><span class="muted" style="font-size:11.5px;font-weight:500">${P.bible.eps.length} of 24 in this sample · the next range is written when EP007 starts</span></h3>
            <div class="delivwrap flush"><table class="deliv bibleeps"><thead><tr><th>Episode</th><th>Title</th><th>Summary</th><th>End hook</th><th>Seconds</th></tr></thead>
              <tbody>${P.bible.eps.map((e, i) => { const open = (S.beatsOpen || {})[e.code];
                return html`<tr><td><button class="disc" aria-expanded=${String(!!open)} aria-controls=${"beats-" + e.code} onClick=${() => set({ beatsOpen: { ...(S.beatsOpen || {}), [e.code]: !open } })}>${I(open ? "caret-down" : "caret-right")}<img src=${P.eps[i].cover} alt=""/><span class="mono">${e.code}</span></button></td>
                  <td><b>${e.title}</b></td><td class="wrap">${e.summary}</td><td class="wrap">${e.hook}</td><td class="mono">${e.seconds}</td></tr>
                  ${open && html`<tr class="beatsrow" id=${"beats-" + e.code}><td></td><td colspan="4"><span class="kick">Beats · ${e.beats.length}</span><ol class="beats">${e.beats.map(([sec, ev]) => html`<li>${ev} <span class="mono subtle">${sec} s</span></li>`)}</ol></td></tr>`}`; })}</tbody></table></div></section>
        </div>`}
        ${/* D56/D57: the tree navigates Assets; a card is the picture, the name, the version and where it stands. */ ""}
        ${S.stab !== "bible" && html`<div class="assetgrid">${{ cast: P.cast, scenes: P.places, props: P.props }[S.stab].map((x) => html`<article class=${"assetcard" + (S.asel === x.id ? " sel" : "")} ...${picked(x.id)} ...${openCard(x.id)}>
          ${pic(x, x.sheet || x.pic, x.st !== "accepted" ? Status(x.st) : Status("accepted"))}
          <div class="ctxt"><span class="cardname"><b>${x.name}</b></span><span class="mono subtle">${shownOf(x)}</span></div></article>`)}</div>`}
        ${S.stab !== "bible" && html`<div class="sendstrip"><span class="muted">Looks and plates · ${decided} of 2 decided</span><span class="grow"></span>
          <button class="btn primary sm" disabled=${decided < 2} onClick=${() => toast("Review sent: Margaret Cole and Garden wedding.")}>Send review</button></div>`}
      </div>${asset ? html`<${AssetDetail} x=${asset}/>` : html`<${AgentPanel}/>`}</div></div>`;
  }

  /* ───── Graph: lineage, read-only ───── */
  // `of` is the item a node is shown by on Canvas; `home` where the object lives (IA_PROPOSAL §16).
  const G = [
    { id: "sp", col: 0, row: 1, t: "Screenplay", v: "v2", k: "screenplay", pic: null, icon: "file-text", home: ["Script", { screen: "script" }] },
    { id: "bible", col: 1, row: 1, t: "Bible", v: "b0003", k: "bible", pic: null, icon: "book-open", home: ["Bible", { screen: "story", stab: "bible" }] },
    { id: "luca", col: 2, row: 0, t: "Luca Moreno", v: "S0 v2", k: "look", pic: "img/face-luca.jpg", of: "luca" },
    { id: "ethan", col: 2, row: 1, t: "Ethan Cole", v: "S0 v1", k: "look", pic: "img/face-ethan.jpg", of: "ethan" },
    { id: "apt", col: 2, row: 2, t: "Luca's apartment", v: "v2", k: "plate", pic: "img/plate-apartment.jpg", of: "apartment" },
    { id: "file", col: 2, row: 3, t: "Case file", v: "v1", k: "prop", pic: "img/prop-folder.jpg", stale: true, of: "file" },
    { id: "ep6seg03", col: 3, row: 1, t: "EP006 seg03 storyboard", v: "v1", k: "storyboard", pic: "img/board-seg03.jpg", stale: true, episode: "EP006", ep: "seg03" },
    { id: "take", col: 4, row: 1, t: "EP006 seg03 take", v: "t02", k: "take", pic: "img/still-s3t2.jpg", stale: true, episode: "EP006", ep: "seg03", of: "seg03" },
    { id: "cut", col: 5, row: 1, t: "EP006 cut", v: "v1", k: "cut", pic: "img/cover-ep6.jpg", stale: true, episode: "EP006", home: ["EP006 › Cut", { screen: "cut" }] },
  ];
  /* The Lineage an item opens on: seg03's node opens its take, the version that waits for you. */
  const lineageOf = (id, kind) => (G.find((n) => (n.of === id || n.ep === id) && (!kind || n.k === kind)) || {}).id;
  /* A2: whether the Lineage in view sits inside EP006: its item is the episode's (a storyboard, a take, the cut, wherever it
     was opened from: Cut, Delivery, Out of date), or it was opened from one of the episode's pages. The crumbs, Export and
     the agent panel all read this one answer. */
  const lineageInEpisode = () => { const sel = G.find((n) => n.id === S.gsel) || G.find((n) => n.id === "ep6seg03");
    return Boolean(sel.episode) || Boolean(S.from && ["canvas", "cut"].includes(S.from.screen)); };
  /* "← Back to …": where a link came from (S.from), with its selection. */
  function BackTo() {
    const f = S.from;
    if (!f) return null;
    const back = () => { set({ screen: f.screen, sel: f.sel, osel: f.osel, asel: f.asel, at: f.at, from: null }); try { history.replaceState(null, "", "#" + f.screen); } catch (e) { /* the hash is a convenience */ } };
    return html`<button class="btn sm ghost backto" onClick=${back}>${I("arrow-left")}Back to ${f.label}</button>`;
  }
  const GE = [["sp", "bible"], ["bible", "luca"], ["bible", "ethan"], ["bible", "apt"], ["bible", "file"], ["luca", "ep6seg03"], ["ethan", "ep6seg03"], ["apt", "ep6seg03"], ["file", "ep6seg03"], ["ep6seg03", "take"], ["take", "cut"]];
  function Graph() {
    const W = 156, H = 112, GX = 34, GY = 22, pos = (n) => ({ x: 24 + n.col * (W + GX), y: 24 + n.row * (H + GY) });
    const by = Object.fromEntries(G.map((n) => [n.id, n])), sel = by[S.gsel] || by.ep6seg03;
    const up = new Set(), down = new Set();
    const walk = (id, dir, acc) => GE.forEach(([a, b]) => { const [f, t] = dir ? [a, b] : [b, a]; if (f === id && !acc.has(t)) { acc.add(t); walk(t, dir, acc); } });
    walk(sel.id, false, up); walk(sel.id, true, down);
    const cols = ["Screenplay", "Bible", "Looks, plates, props", "Storyboards", "Takes", "Cut"];
    // A2: the crumbs, the inspector and the picked node name one object. The crumbs say where it belongs (round 3), never
    // where Lineage was opened from; that is Back to's, and Export and the agent follow lineageInEpisode.
    const tab = sel.of && { look: "cast", plate: "scenes", prop: "props" }[sel.k];
    const crumbs = [own.drama(), ...(sel.episode ? [own.ep()] : tab ? [own.assets(), own.tab(tab)] : sel.home ? [[sel.home[0], () => set({ ...sel.home[1], from: null })]] : []), sel.t.replace(/^EP006 /, "") + " · " + sel.v, "Lineage"];
    // Lineage is a view of relations, not a home (§16): the inspector links to where the object lives.
    const at = { kind: sel.k, ver: sel.v };
    const home = sel.ep ? ["EP006 · " + sel.ep, { screen: "canvas", sel: stageNode(sel.ep, at), at }] : sel.home && [sel.home[0], { ...sel.home[1], at }];
    const label = "Lineage · " + sel.t;
    return html`<div class="main">
      <${TopBar} crumbs=${crumbs}/>
      <${StopBanner}/>
      <div class="body"><div class="scrollmain">
        <div class="bar2"><span class="grow"></span><${ProjectChips}/></div>
        <div class="graphwrap" role="group" aria-label="Graph" tabindex="0"><div class="graph" style=${`width:${24 * 2 + 6 * W + 5 * GX}px;height:${24 * 2 + 4 * H + 3 * GY + 24}px`}>
          ${cols.map((c, i) => html`<span class="gcol" style=${`left:${24 + i * (W + GX)}px`}>${c}</span>`)}
          <svg class="gwires" width="100%" height="100%">${GE.map(([a, b]) => { const A = pos(by[a]), B = pos(by[b]); const x1 = A.x + W, y1 = A.y + H / 2 + 24, x2 = B.x, y2 = B.y + H / 2 + 24, m = (x1 + x2) / 2;
            const on = (a === sel.id || up.has(a)) && (b === sel.id || up.has(b)) || (a === sel.id || down.has(a)) && (b === sel.id || down.has(b));
            return html`<path class=${(on ? "on " : "") + (by[b].stale && by[a].stale || a === "file" ? "stale" : "")} d=${`M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`}/>`; })}</svg>
          ${G.map((n) => { const p = pos(n), rel = n.id === sel.id ? "sel" : up.has(n.id) ? "up" : down.has(n.id) ? "down" : "dim";
            return html`<button class=${"gnode " + rel + (n.stale ? " stale" : "")} style=${`left:${p.x}px;top:${p.y + 24}px;width:${W}px;height:${H}px`} aria-pressed=${String(n.id === sel.id)} onClick=${() => set({ gsel: n.id })}>
              <span class="gpic">${n.pic ? html`<img src=${n.pic} alt=""/>` : I(n.icon)}</span>
              <span class="gtxt"><b>${n.t}</b><span class="mono">${n.v}</span>${n.stale ? html`<span class="st stale"><i></i>Out of date</span>` : html`<span class="st accepted"><i></i>Accepted</span>`}</span></button>`; })}
        </div></div>
        <div class="glegend"><span><i class="l up"></i>Made from (upstream)</span><span><i class="l down"></i>Made from it (downstream)</span><span><i class="l stale"></i>Out of date</span><span class="subtle">Read-only. Click a version to trace it.</span></div>
      </div>
      <aside class="insp"><div class="ihead"><b>${sel.t}</b><small>${sel.k} · ${sel.v}</small>
        ${sel.of && !sel.ep ? html`<button class="btn sm" onClick=${() => openHome(sel.of, label, at)}>Open in Assets</button>`
          : home ? html`<button class="btn sm" onClick=${() => { set({ ...home[1], from: { screen: "graph", label } }); try { history.replaceState(null, "", "#" + home[1].screen); } catch (e) { /* the hash is a convenience */ } }}>Open in ${home[0]}</button>` : null}</div>
        <div class="iscroll">
          ${sel.pic && html`<div class="isec"><img src=${sel.pic} alt="" style="width:100%;border-radius:10px;max-height:240px;object-fit:cover;object-position:top"/></div>`}
          <div class="isec"><h4>State</h4>${sel.stale ? html`<div class="finding warn">${I("warning")}<span>${sel.id === "file" ? "Changed file: bible/v3/bible.json" : "Made from Case file v1, which is out of date."} The agent redraws it.</span></div>` : html`<span class="muted">Fresh: made from the accepted versions.</span>`}</div>
          <div class="isec"><h4>Made from <span class="muted">${up.size}</span></h4>${[...up].map((id) => html`<button class="lrow" onClick=${() => set({ gsel: id })}>${by[id].t}<span class="mono subtle">${by[id].v}</span></button>`)}</div>
          <div class="isec"><h4>Made from it <span class="muted">${down.size}</span></h4>${[...down].map((id) => html`<button class="lrow" onClick=${() => set({ gsel: id })}>${by[id].t}<span class="mono subtle">${by[id].v}</span></button>`)}${!down.size && html`<span class="muted">Nothing yet.</span>`}</div>
        </div></aside></div></div>`;
  }

  /* ───── Out of date: what drama-cli calls stale and what was made from it, one row per item, each opening its one home
     (IA §16; D21). Grouped by the session that redoes them (E: the agent panel speaks to one session): the setup's for
     the assets, each episode's for its own. The same set as the sidebar's count: src/ui/shell/tree.ts, dramaTree(…).outOfDate,
     what drama-cli calls stale plus shared/lineage.ts, madeFromStale. ───── */
  // `why` is drama-cli's reason, its `problems` verbatim; `from` is for an item drama-cli calls fresh that was made from an
  // out-of-date version, said in our own words ("Made from …, which is out of date"), since the export gives no reason for it.
  const OOD = [
    { id: "walter", group: "Assets", kind: "Character", icon: "user", t: "Walter Cole", v: "S0 v3", full: "Walter Cole S0 v3", why: "Changed file: bible/v3/bible.json", home: () => openHome("walter", "Out of date") },
    { id: "file", group: "Assets", kind: "Prop", icon: "cube", t: "Case file", v: "v1", full: "Case file v1", why: "Changed file: bible/v3/bible.json", gid: "file", home: () => openHome("file", "Out of date") },
    { id: "ep6seg03", group: "EP006", kind: "Storyboard", icon: "squares-four", t: "seg03", v: "v1", full: "seg03 storyboard v1", from: "Case file v1", gid: "ep6seg03", home: () => openStage("seg03", { kind: "storyboard", ver: "v1" }, "Out of date") },
    { id: "take", group: "EP006", kind: "Take", icon: "play", t: "seg03", v: "t02", full: "seg03 take t02", from: "seg03 storyboard v1", gid: "take", home: () => openStage("seg03", { kind: "take", ver: "t02" }, "Out of date") },
    { id: "cut", group: "EP006", kind: "Cut", icon: "scissors", t: "EP006 cut", v: "v1", full: "EP006 cut v1", from: "seg03 take t02", gid: "cut", home: () => jump({ screen: "cut", at: { kind: "cut", ver: "v1" } }, "Out of date") },
  ];
  /* The Out of date row of a segment's stage version, if it has one. */
  // The sample's out-of-date storyboard is the line-art one.
  const outOfDateAt = (seg, at) => OOD.find((r) => r.t === seg && r.kind.toLowerCase() === at.kind && r.v === at.ver && (!at.style || at.style === "line-art"));
  function OutOfDate() {
    const items = S.state === "fresh" ? [] : OOD;
    // Leaving for a home or Lineage marks the row (its own key, apart from Canvas's pick), so Back returns to it.
    const leave = (r, to) => { set({ osel: r.id }); to(); };
    const owner = (g) => (g === "Assets" ? "the setup's agent" : g + "'s agent");
    // A redo remakes items, which spends: it asks first with its impact (§15), and is one submission to the owner's session
    // (§14.6), its state the shared Submission's (app.js). The button shows only while nothing is submitted; after a refusal
    // Submission's Send again is the one action, and it asks again.
    const redo = (g, rows) => set({ dialog: { title: `Ask ${owner(g)} to redo ${rows.length} items?`,
      body: `${owner(g)[0].toUpperCase() + owner(g).slice(1)} will remake ${rows.length} items: ${rows.map((r) => r.full).join(", ")}. It spends from the project's budget; the earlier versions stay.`,
      ok: "Ask to redo", cancel: "Not now", run: () => submit("redo:" + g) } });
    const state = (g, rows) => ((S.subs || {})["redo:" + g]
      ? html`<${Submission} id=${"redo:" + g} to=${owner(g)} onSend=${() => redo(g, rows)}/>`
      : html`<button class="btn sm" onClick=${() => redo(g, rows)}>Ask ${owner(g)} to redo them</button>`);
    const row = (r) => html`<tr class=${S.osel === r.id ? "sel" : ""}>
      <td><span class="delivep">${I(r.icon)}<span><button class="linkbtn" onClick=${() => leave(r, r.home)}>${r.t}</button><small>${r.kind}</small></span></span></td>
      <td class="mono">${r.v}</td>
      <td class="why">${r.why || `Made from ${r.from}, which is out of date.`}</td>
      <td class="act"><button class="ibtn" title=${r.gid ? "Lineage" : "Lineage: this sample traces seg03 and what it reads"} aria-label="Lineage" disabled=${!r.gid} onClick=${() => leave(r, () => openLineage(r.gid, "Out of date"))}>${I("tree-structure")}</button></td></tr>`;
    const group = (g, head) => { const rows = items.filter((r) => r.group === g); return rows.length ? html`
      <tr class="grp"><td colspan="3"><b>${head}</b></td><td class="act">${state(g, rows)}</td></tr>
      ${rows.map(row)}` : null; };
    return html`<div class="main">
      <${TopBar} crumbs=${[own.drama(), "Out of date"]}/>
      <div class="body"><div class="scrollmain">
        <div class="bar2"><span class="delivsum">${items.length ? html`<b>${items.length} items</b> are out of date. The agent that made each one redoes it.` : "Nothing is out of date."}</span></div>
        <${StopBanner}/>
        ${items.length > 0 && html`<div class="delivwrap"><table class="deliv ood"><thead><tr><th>Item</th><th>Version</th><th>Why</th><th aria-label="Lineage"></th></tr></thead>
          <tbody>${group("Assets", "Assets")}${["EP006"].map((ep) => group(ep, "Episodes · " + ep))}</tbody></table></div>`}
      </div><${AgentPanel}/></div></div>`;
  }

  /* ───── Cut: EPxxx › Cut, the one home of an episode's cut (IA §16). Review and Edit are two separate things:
     notes and a verdict go back to the agent with the review; an edit is a draft of drama-cli's edit spec
     (drama_cli/edit.py: each clip's take, in, out and audio, source or silence, in order) that Apply hands to the agent. ───── */
  const cutBase = () => P.cut.segs.map(([seg, take, d]) => ({ seg, take, in: 0, out: d, audio: "source" }));
  // The sample draft opens with one real edit: seg03 starts 1.2 s in (its first take went back as too wide at the start).
  const cutSeed = () => cutBase().map((x) => (x.seg === "seg03" ? { ...x, in: 1.2 } : x));
  const sameClip = (a, b) => a.seg === b.seg && a.take === b.take && a.in === b.in && a.out === b.out && a.audio === b.audio;
  // The draft's changes against its base, one line each: take, in, out, sound, and the order.
  function cutDiff(base, ed) {
    const out = [];
    ed.forEach((x) => {
      const b = base.find((y) => y.seg === x.seg);
      if (!b) return out.push([x.seg, "added"]);
      if (b.take !== x.take) out.push([x.seg, `take ${b.take} → ${x.take}`]);
      if (b.in !== x.in) out.push([x.seg, `in ${b.in.toFixed(1)} → ${x.in.toFixed(1)} s`]);
      if (b.out !== x.out) out.push([x.seg, `out ${b.out.toFixed(1)} → ${x.out.toFixed(1)} s`]);
      if (b.audio !== x.audio) out.push([x.seg, x.audio === "silence" ? "sound → silence" : "sound → the take's own"]);
    });
    if (ed.map((x) => x.seg).join() !== base.map((b) => b.seg).join()) out.push(["Order", ed.map((x) => x.seg).join(" → ")]);
    return out;
  }
  function Cut() {
    const vref = useRef(null), c = P.cut, tab = S.cutTab || "review";
    useEffect(() => { const el = vref.current; if (!el) return; if (S.cutPlaying) el.play().catch(() => set({ cutPlaying: false })); else el.pause(); });
    const seek = (t) => { if (vref.current) vref.current.currentTime = t; set({ cutT: t }); };
    const fmt = (t) => "0:" + String(Math.floor(t)).padStart(2, "0");
    // Review: notes, a verdict and its reason. Undo restores the state before the last step; Reset restores the start.
    const rev = { notes: S.cutNotes || c.notes, v: S.cutV, why: S.cutWhy };
    const revStart = { notes: c.notes, v: null, why: "" };
    const revChanged = rev.notes !== c.notes || rev.v || rev.why;
    const revHist = S.cutRevHist || [];
    const revDo = (patch) => set({ cutRevHist: [...revHist, rev], ...patch });
    const revSet = (r) => set({ cutNotes: r.notes, cutV: r.v, cutWhy: r.why });
    const sent = S.cutSent;
    const seen = S.cutSeen || 0, watched = seen >= c.dur - 0.25;
    // Edit: the draft spec, its base (cut v1, or cut v2 once re-checked against it), and where Apply has got to.
    const rebased = S.state === "cutnewer" && S.cutRebased;
    const base = rebased ? c.newer.clips.map(([seg, take, i, o]) => ({ seg, take, in: i, out: o, audio: "source" })) : cutBase();
    const baseV = rebased ? c.newer.v : c.base.v;
    const ed = S.cutEd || cutSeed();
    const edHist = S.cutEdHist || [];
    const edDo = (next) => set({ cutEdHist: [...edHist, ed], cutEd: next });
    const put = (i, patch) => edDo(ed.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    const move = (i, d) => { const n = [...ed]; [n[i], n[i + d]] = [n[i + d], n[i]]; edDo(n); set({ cutSel: i + d }); };
    const diff = cutDiff(base, ed);
    const takeOf = (seg, take) => (c.takes[seg] || []).find(([t]) => t === take) || [take, 0, "", ""];
    const blocked = (S.state === "cutnewer" && !rebased) || S.state === "cutinputs";
    const dur = tab === "edit" ? ed.reduce((a, x) => a + (x.out - x.in), 0) : c.dur;
    // Apply is one submission to EP006's agent (the shared Submission: sending → sent, or unknown → checked, or not
    // submitted → Send again). What follows sent is the turn's, read from the session's status: at work only when the
    // status says so, then cut v2 waiting, or drama-cli's refusal of the edit, which is a result, not a failed send.
    const sub = (S.subs || {}).cutApply;
    const apply = () => submit("cutApply");
    // What was sent stays as sent (B2): the draft is read only until it comes back not submitted or refused.
    const edLocked = !!sub && sub !== "failed" && S.cutTurn !== "refused";
    useEffect(() => {
      if (sub !== "sent" || S.cutTurn) return;
      const a = setTimeout(() => set({ cutTurn: "work" }), 1500);
      const b = setTimeout(() => set({ cutTurn: S.state === "cutrefused" ? "refused" : "ready" }), 5000);
      return () => { clearTimeout(a); clearTimeout(b); };
    }, [sub]);
    const discard = () => { set({ cutEd: cutBase(), cutEdHist: [], cutRebased: false, cutCheck: null, cutCompare: false }); toast("Draft discarded. Nothing was applied."); };
    let acc = 0;
    return html`<div class="main">
      <${TopBar} crumbs=${[own.drama(), own.ep(), "Cut " + c.base.v]}/>
      <${StopBanner}/>
      <div class="room is-cut">
        <section class="stage">
          <div class="screen"><div class="player">
            <video ref=${vref} src=${c.src} poster="img/still-s1t2.jpg" muted playsinline preload="metadata" onTimeUpdate=${(e) => { const t = e.target.currentTime; set({ cutT: t, cutSeen: Math.max(seen, t) }); }} onEnded=${() => set({ cutPlaying: false, cutSeen: c.dur })}></video>
            <span class="tag2">EP006 · cut ${c.base.v}</span>
            ${!S.cutPlaying && html`<button class="bigplay" aria-label="Play" onClick=${() => set({ cutPlaying: true })}><i>${I("play")}</i></button>`}</div></div>
          <div class="cuttl">
            <div class="controls" style="border-top:0;padding:0 0 8px"><button class="pp" aria-label=${S.cutPlaying ? "Pause" : "Play"} onClick=${() => set({ cutPlaying: !S.cutPlaying })}>${I(S.cutPlaying ? "pause" : "play")}</button>
              <span class="t">${S.cutT.toFixed(1)}s <small>/ ${c.dur.toFixed(1)}s</small></span><span class="grow"></span><span class="muted" style="font-size:11.5px">9:16 · 480p · subtitles from the screenplay · muted in this prototype</span></div>
            ${tab === "edit" && html`<p class="draftnote">${I("scissors")}<span>Your draft, ${dur.toFixed(1)} s, drawn from its spec. The picture above stays cut ${baseV} until the agent builds the draft.</span></p>`}
            <div class="tl" onClick=${(e) => { if (tab === "edit") return; const r = e.currentTarget.getBoundingClientRect(); seek(Math.max(0, Math.min(c.dur, ((e.clientX - r.left) / r.width) * c.dur))); }}>
              <div class="tlsegs">${tab === "edit"
                ? ed.map((x, i) => { const left = acc, d = x.out - x.in; acc += d; const b = base.find((y) => y.seg === x.seg), chg = !b || !sameClip(b, x);
                  return html`<button class=${"tlseg edit" + (S.cutSel === i ? " on" : "") + (chg ? " chg" : "")} style=${`left:${(left / dur) * 100}%;width:${(d / dur) * 100}%;background-image:url(${takeOf(x.seg, x.take)[2]})`} onClick=${(e) => { e.stopPropagation(); set({ cutSel: i }); }}>
                    <i class="hdl l"></i><i class="hdl r"></i><span>${x.seg} · ${x.take}${x.audio === "silence" ? html` ${I("speaker-slash")}` : ""}${chg ? " · edited" : ""}</span></button>`; })
                : c.segs.map(([s, t, d, pic], i) => { const left = acc; acc += d; return html`<button class=${"tlseg" + (S.cutSel === i ? " on" : "")} style=${`left:${(left / c.dur) * 100}%;width:${(d / c.dur) * 100}%;background-image:url(${pic})`} onClick=${(e) => { e.stopPropagation(); set({ cutSel: i }); seek(left); }}><span>${s} · ${t}</span></button>`; })}</div>
              ${tab === "review" && rev.notes.map((n) => html`<span class="pin" style=${`left:${(n.t / c.dur) * 100}%`} title=${n.text}>${I("note-pencil")}</span>`)}
              ${tab === "review" && html`<span class="head" style=${`left:${(S.cutT / c.dur) * 100}%`}></span>`}</div>
            <div class="tracks">
              <div class="trk"><span class="trk-h">Sound</span><div class="trk-lane wave">${Array.from({ length: 96 }, (_, i) => html`<i style=${`height:${18 + Math.round(70 * Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11)))}%`}></i>`)}</div></div>
              <div class="trk"><span class="trk-h">${I("chats")}Lines <small class="muted" title="Spread over each segment; drama-cli's asr-align gives the real times">Approximate</small></span><div class="trk-lane">${c.lines.map(([t, d, text]) => html`<button class="line" style=${`left:${(t / c.dur) * 100}%;width:${(d / c.dur) * 100}%`} title=${text} onClick=${() => seek(t)}>${text}</button>`)}</div></div>
            </div>
          </div>
        </section>
        <aside class="insp"><div class="ihead"><b>EP006 · cut ${c.base.v}</b><small>${c.dur} s of 90 s planned · 2 of 4 segments in this sample</small>
          <div class="seg" role="tablist" aria-label="Review or edit" style="margin-top:10px">${[["review", "Review", "note-pencil"], ["edit", "Edit", "scissors"]].map(([k, l, ic]) =>
            html`<button role="tab" aria-selected=${String(tab === k)} aria-pressed=${String(tab === k)} onClick=${() => set({ cutTab: k, cutSel: k === "edit" ? (S.cutSel ?? 1) : S.cutSel })}>${I(ic)}${l}${k === "edit" && diff.length ? html` <span class="cnt">${diff.length}</span>` : ""}</button>`)}</div></div>
          ${tab === "review" ? html`
          <div class="iscroll">
            <div class="isec"><h4>Notes at a time <span class="muted">${rev.notes.length}</span></h4>
              ${rev.notes.map((n, i) => html`<div class="noterow"><button class="mono tbtn" onClick=${() => seek(n.t)}>${fmt(n.t)}</button><span class="grow">${n.text}</span>${!sent && html`<button class="ibtn" aria-label="Remove note" onClick=${() => revDo({ cutNotes: rev.notes.filter((_, j) => j !== i) })}>${I("x")}</button>`}</div>`)}
              ${!sent && html`<div class="addnote"><span class="mono">${fmt(S.cutT)}</span><input placeholder="Add a note at the playhead…" value=${S.noteDraft} onInput=${(e) => set({ noteDraft: e.target.value })}
                onKeyDown=${(e) => { if (e.key === "Enter" && S.noteDraft.trim()) revDo({ cutNotes: [...rev.notes, { t: S.cutT, text: S.noteDraft.trim() }].sort((a, b) => a.t - b.t), noteDraft: "" }); }}/></div>`}
              <p class="muted" style="margin:8px 0 0;font-size:11.5px">Notes go to the agent with Send back. To change the cut yourself, use Edit.</p></div>
            ${S.cutSel != null && c.segs[S.cutSel] && (() => { const [seg, take, d] = c.segs[S.cutSel]; return html`<div class="isec"><h4>Properties <span class="muted">${seg}</span></h4>
              <dl class="kv"><dt>Segment</dt><dd>${seg}</dd><dt>Take</dt><dd>${take}</dd><dt>Model</dt><dd>${c.spec.model}</dd><dt>Duration</dt><dd class="mono">${d} s</dd><dt>Picture</dt><dd>${c.spec.ratio} · ${c.spec.resolution} · ${c.spec.fps} fps</dd></dl>
              <div style="display:flex;gap:8px;margin-top:10px"><button class="btn sm" onClick=${() => set({ cutTab: "edit" })}>${I("scissors")}Edit this clip</button><button class="btn sm ghost" onClick=${() => go("canvas")}>${I("flow-arrow")}Open on Canvas</button><button class="btn sm ghost" onClick=${() => openLineage("cut", "EP006 › Cut v1")}>${I("tree-structure")}Lineage</button></div></div>`; })()}
            <div class="isec"><h4>Made from</h4>${c.segs.map(([s, t, d]) => html`<div class="lrow static">${s} · take ${t}<span class="mono muted">${d} s</span></div>`)}</div>
            <div class="isec" style="border-bottom:0"><h4>What happens</h4><p class="muted" style="font-size:12.5px;line-height:1.55">You watch every cut and decide; no model checks a cut for you. Send back, and your notes go to the agent, which plans the cut again: drama-cli's edit calls no paid model, and Pine bills the agent's turns. Accept, and this is EP006's delivered cut, listed in Delivery.</p></div>
          </div>
          <div class="verdict">${sent ? html`
            <${Submission} id="cutReview" to="EP006's agent" kept="Your review is kept." onSend=${() => submit("cutReview")}/>
            ${(S.subs || {}).cutReview === "sent" && html`<div class=${"sentcard " + sent}>${I(sent === "accept" ? "check-circle" : "paper-plane-tilt")}<span class="grow"><b>${sent === "accept" ? "Accepted · EP006 cut v1 is delivered" : "Sent back · waiting for the agent"}</b>
              <small>${sent === "accept" ? "It is listed in Delivery." : `Your ${rev.notes.length} notes and reason went with it. A new cut comes back here for review.`}</small></span>
              ${sent === "accept" && html`<button class="btn sm" onClick=${() => go("delivery")}>Open Delivery</button>`}</div>`}` : html`
            <div class="vrow" style="grid-template-columns:1fr 1fr">
              <button class="vbtn acc" aria-pressed=${String(rev.v === "accept")} disabled=${!watched} title=${watched ? "Accept" : "Watch the cut to the end first"} onClick=${() => revDo({ cutV: rev.v === "accept" ? null : "accept" })}>${I("check")}Accept cut</button>
              <button class="vbtn back" aria-pressed=${String(rev.v === "back")} onClick=${() => revDo({ cutV: rev.v === "back" ? null : "back" })}>${I("arrow-counter-clockwise")}Send back</button></div>
            <span class="hint">${I(watched ? "check-circle" : "clock")}${watched ? "Watched to the end." : `Watched ${Math.round((seen / c.dur) * 100)}% · Accept unlocks at the end, as for a take.`}</span>
            ${rev.v === "back" && html`<textarea placeholder="Why it goes back (required). Your timed notes go with it." value=${rev.why} onFocus=${() => set({ cutRevHist: [...revHist, rev] })} onInput=${(e) => set({ cutWhy: e.target.value })}></textarea>`}
            <div class="draftbar"><span>${revChanged ? html`<b>Your review is a draft</b>` : "No review yet"}</span><span class="grow"></span>
              <button class="btn sm ghost" title="Undo your last step" disabled=${!revHist.length} onClick=${() => set({ cutRevHist: revHist.slice(0, -1), ...{ cutNotes: revHist[revHist.length - 1].notes, cutV: revHist[revHist.length - 1].v, cutWhy: revHist[revHist.length - 1].why } })}>Undo</button>
              <button class="btn sm ghost" title="Back to how the review started" disabled=${!revChanged} onClick=${() => { revSet(revStart); set({ cutRevHist: [] }); }}>Reset</button>
              <button class="btn sm primary" disabled=${!rev.v || (rev.v === "back" && !rev.why.trim())} onClick=${() => { set({ cutSent: rev.v, cutPlaying: false }); submit("cutReview"); }}>Send review</button></div>`}</div>`
          : html`
          <div class="iscroll" inert=${edLocked}>${edLocked && html`<p class="draftnote" style="margin:10px 0 0">${I("lock-simple")}<span>This edit is sent; it is read only. A new edit starts once cut v2 is in, or from this draft if it comes back.</span></p>`}
            <div class="isec"><h4>Based on <span class="muted">cut ${baseV}</span></h4>
              ${S.state === "cutnewer" && !rebased && html`<div class="basewarn">${I("warning")}<span class="grow"><b>A newer cut exists</b><small>Cut ${c.newer.v} came in after you started this draft on cut ${c.base.v}. Nothing your draft uses has changed.</small></span></div>`}
              ${S.state === "cutinputs" && html`<div class="basewarn err">${I("warning")}<span class="grow"><b>Your draft's inputs changed</b><small>seg03 · t02, which your draft trims, is no longer accepted: its storyboard changed after you accepted it. There is no newer cut.</small></span></div>`}
              ${rebased && html`<div class="baseok">${I("check-circle")}<span class="grow"><b>Re-checked against cut ${c.newer.v}</b><small>Your ${diff.length === 1 ? "change applies" : diff.length + " changes apply"} to it as before; it is your draft's base now.</small></span></div>`}
              ${S.state === "cutinputs" && S.cutCheck && html`<div class="basewarn err"><span class="grow"><b>Re-checked: Apply waits</b><small>seg03 has no accepted take now, so your trim of it can't be built. Keep the draft until seg03's new take is accepted, or discard it.</small></span></div>`}
              ${blocked && html`<div style="display:flex;gap:8px;margin-top:8px">
                <button class="btn sm" aria-pressed=${String(!!S.cutCompare)} onClick=${() => set({ cutCompare: !S.cutCompare })}>${I("eye")}Compare</button>
                <button class="btn sm" disabled=${S.state === "cutinputs" && S.cutCheck} onClick=${() => S.state === "cutnewer"
                  ? set({ cutRebased: true, cutCompare: false, cutEdHist: [], cutEd: c.newer.clips.map(([seg, take, i, o]) => { const nb = { seg, take, in: i, out: o, audio: "source" }; const x = ed.find((y) => y.seg === seg), ob = cutBase().find((y) => y.seg === seg); return x && ob && !sameClip(x, ob) ? x : nb; }) })
                  : set({ cutCheck: true })}>${I("check")}Re-check</button>
                <button class="btn sm ghost" onClick=${discard}>Discard draft</button></div>`}
              ${S.cutCompare && html`<table class="cmp"><thead><tr><th></th><th>${S.state === "cutnewer" ? `Cut ${c.base.v} · your base` : "When you started"}</th><th>${S.state === "cutnewer" ? `Cut ${c.newer.v} · now` : "Now"}</th></tr></thead><tbody>
                ${S.state === "cutnewer"
                  ? c.newer.clips.map(([seg, take, i, o]) => { const b = cutBase().find((y) => y.seg === seg); return html`<tr class=${b ? "" : "add"}><td>${seg}</td><td>${b ? `${b.take} · ${b.in}–${b.out} s` : "—"}</td><td>${take} · ${i}–${o} s</td></tr>`; })
                  : html`<tr><td>seg01</td><td>t02 · accepted</td><td>t02 · accepted</td></tr><tr class="add"><td>seg03</td><td>t02 · accepted</td><td>t02 · out of date</td></tr>`}</tbody></table>`}
              <details class="basedet"><summary>What the draft rests on</summary><dl class="kv"><dt>Cut</dt><dd class="mono">${baseV} · ${rebased ? c.newer.sha : c.base.sha}</dd>${c.base.inputs.map(([k, h]) => html`<dt>${k}</dt><dd class="mono">sha256 ${h}…</dd>`)}</dl></details></div>
            <div class="isec"><h4>Clips in order <span class="muted">${ed.length}</span></h4>
              ${ed.map((x, i) => { const b = base.find((y) => y.seg === x.seg), chg = !b || !sameClip(b, x); return html`<div class=${"cliprow" + (S.cutSel === i ? " on" : "")}>
                <button class="clipmain" onClick=${() => set({ cutSel: i })}><img src=${takeOf(x.seg, x.take)[2]} alt=""/><span class="grow"><b>${x.seg} · ${x.take}</b><small class="mono">${x.in.toFixed(1)}–${x.out.toFixed(1)} s${x.audio === "silence" ? " · silence" : ""}</small></span>${chg && html`<span class="chgdot" title="Edited"></span>`}</button>
                <button class="ibtn" aria-label=${"Move " + x.seg + " earlier"} disabled=${i === 0} onClick=${() => move(i, -1)}>${I("caret-up")}</button>
                <button class="ibtn" aria-label=${"Move " + x.seg + " later"} disabled=${i === ed.length - 1} onClick=${() => move(i, 1)}>${I("caret-down")}</button></div>`; })}</div>
            ${ed[S.cutSel] && (() => { const x = ed[S.cutSel], i = S.cutSel, len = takeOf(x.seg, x.take)[1]; return html`<div class="isec"><h4>Clip <span class="muted">${x.seg}</span></h4>
              <div class="propedit">
                <span class="muted">Take</span><div class="takes">${(c.takes[x.seg] || []).map(([t, d, p, st]) => html`<button class=${"take" + (t === x.take ? " on" : "")} aria-pressed=${String(t === x.take)} disabled=${st !== "accepted"} title=${st === "accepted" ? "Accepted" : "Sent back: only accepted takes go in a cut"} onClick=${() => put(i, { take: t, in: 0, out: d })}><img src=${p} alt=""/><b>${t}</b><small>${st === "accepted" ? html`<span class="mono">${d} s</span>` : "Sent back"}</small></button>`)}</div>
                <span class="muted">In</span><input class="mono" type="number" step="0.1" min="0" max=${x.out - 0.1} value=${x.in} onChange=${(e) => put(i, { in: Math.max(0, Math.min(x.out - 0.1, Number(e.target.value))) })}/>
                <span class="muted">Out</span><input class="mono" type="number" step="0.1" min=${x.in + 0.1} max=${len} value=${x.out} onChange=${(e) => put(i, { out: Math.min(len, Math.max(x.in + 0.1, Number(e.target.value))) })}/>
                <span class="muted">Sound</span><div class="seg">${["source", "silence"].map((a) => html`<button aria-pressed=${String(x.audio === a)} onClick=${() => put(i, { audio: a })}>${a === "source" ? "Take's sound" : "Silence"}</button>`)}</div>
                <p class="muted">Phase 1 edits what drama-cli's edit takes: an accepted take, the order, in and out, and the take's sound or silence. A start off a keyframe is re-encoded when the agent builds it.</p></div></div>`; })()}
            <div class="isec" style="border-bottom:0"><h4>Changes <span class="muted">${diff.length} against cut ${baseV}</span></h4>
              ${diff.length ? diff.map(([k, d]) => html`<div class="lrow static"><span>${k}</span><span class="mono">${d}</span></div>`) : html`<p class="muted" style="margin:0;font-size:12.5px">No edits. The draft matches cut ${baseV}.</p>`}
              <p class="muted" style="margin:8px 0 0;font-size:11.5px">Your timed notes are not edits: they stay on Review.</p></div>
          </div>
          <div class="verdict">${sub ? html`
            <${Submission} id="cutApply" to="EP006's agent" kept="Your edit is kept." onSend=${apply}/>
            ${sub === "sent" && html`<div class=${"sentcard " + (S.cutTurn || "waiting")}>${I(S.cutTurn === "ready" ? "check-circle" : S.cutTurn === "refused" ? "x-circle" : S.cutTurn === "work" ? "circle-notch" : "clock")}<span class="grow">
              <b>${{ waiting: "Waiting for EP006's session", work: "Building cut v2", ready: "Cut v2 waits for your review", refused: "drama-cli refused the edit" }[S.cutTurn || "waiting"]}</b>
              <small>${{ waiting: "Its status shows when it starts on your edit.", work: "EP006's session is at work: drama-cli edit build EP006, then edit validate. drama-cli's edit calls no paid model; Pine bills the agent's turns.", ready: "Made from your edit of cut " + baseV + ". Watch it and decide, as for any cut.", refused: "Clip 2 has no audio; explicitly choose silence. Nothing was built and nothing was spent; your draft is kept." }[S.cutTurn || "waiting"]}</small></span>
              ${S.cutTurn === "ready" && html`<button class="btn sm primary" onClick=${() => toast("Opens EP006 › Cut v2. This sample has only cut v1.")}>Open cut v2</button>`}
              ${S.cutTurn === "refused" && html`<button class="btn sm" onClick=${() => set({ subs: { ...S.subs, cutApply: undefined }, cutTurn: null, cutSel: 1 })}>Back to the draft</button>`}</div>`}` : html`
            <div class="draftbar" style="border-top:0;margin-top:0;padding-top:0"><span>${diff.length ? html`<b>Draft · ${diff.length} edit${diff.length > 1 ? "s" : ""}</b>` : "No edits"}</span><span class="grow"></span>
              <button class="btn sm ghost" title="Undo your last edit" disabled=${!edHist.length} onClick=${() => set({ cutEd: edHist[edHist.length - 1], cutEdHist: edHist.slice(0, -1) })}>Undo</button>
              <button class="btn sm ghost" title=${"Back to cut " + baseV + " with no edits"} disabled=${!diff.length} onClick=${() => edDo(base)}>Reset</button>
              <button class="btn sm primary" disabled=${!diff.length || blocked} title=${blocked ? "Compare and re-check the draft first" : "The agent builds it; cut v2 comes back for review"} onClick=${apply}>${I("paper-plane-tilt")}Apply</button></div>`}</div>`}
        </aside></div></div>`;
  }

  /* ───── Delivery: Project › Delivery, the one home of the accepted cuts across episodes (IA §16). A row links to its
     episode's Cut, which plays it; there is no second player here. ───── */
  function Delivery() {
    const open = (e, v) => (e.code === "EP006" ? go("cut") : toast(`Opens ${e.code} › Cut ${v}. Only EP006's cut opens in this sample.`));
    const delivered = P.eps.filter((e) => e.cut && e.cut.accepted), waiting = P.eps.filter((e) => e.cut && e.cut.st === "you");
    return html`<div class="main">
      <${TopBar} crumbs=${[own.drama(), "Delivery"]}/>
      <div class="body"><div class="scrollmain">
        <div class="bar2"><span class="delivsum"><b>${delivered.length} of ${P.project.episodes}</b> episodes delivered · ${waiting.length} cuts wait for you</span><span class="grow"></span>
          <button class="btn sm" disabled=${!delivered.length} onClick=${() => toast(`Downloads the ${delivered.length} accepted cut${delivered.length > 1 ? "s" : ""} as one zip, each file named by episode and cut version.`)}>${I("download-simple")}Download accepted (${delivered.length})</button></div>
        <${StopBanner}/>
        <div class="delivwrap"><table class="deliv"><thead><tr><th>Episode</th><th>Delivered cut</th><th>Latest cut</th><th>Status</th><th aria-label="Download"></th></tr></thead>
          <tbody>${P.eps.slice(0, 8).map((e) => { const c = e.cut; return html`<tr>
            <td><span class="delivep">${e.cover ? html`<img src=${e.cover} alt=""/>` : html`<span class="noimg"></span>`}<span><b class="mono">${e.code}</b><small>${e.title}</small></span></span></td>
            <td>${c && c.accepted ? html`<button class="linkbtn" onClick=${() => open(e, c.accepted)}>Cut ${c.accepted}</button> <span class="mono muted">${c.acceptedDur} s</span>` : html`<span class="muted">—</span>`}</td>
            <td>${c ? html`<button class="linkbtn" onClick=${() => open(e, c.latest)}>Cut ${c.latest}</button> <span class="mono muted">${c.latestDur} s</span>${e.code === "EP006" && html` <button class="ibtn" title="Lineage" aria-label="Lineage" onClick=${() => openLineage("cut", "Delivery")}>${I("tree-structure")}</button>`}` : html`<span class="muted">No cut yet</span>`}</td>
            <td>${c ? (c.st === "you" ? Status("you", "Cut " + c.latest + " needs you") : Status("accepted", "Delivered")) : html`<span class="muted">${e.now}</span>`}</td>
            <td class="act">${c && c.accepted && html`<button class="btn sm ghost" onClick=${() => toast(`Downloads ${e.code}-cut-${c.accepted}.mp4, the accepted cut.`)}>${I("download-simple")}Download</button>`}</td></tr>`; })}
            <tr class="more"><td colspan="5">EP009–EP024 · 16 episodes in line, no cut yet</td></tr></tbody></table></div>
      </div><${AgentPanel}/></div></div>`;
  }

  /* ───── Script: the screenplay's home (IA draft, A3) ─────
     The accepted Fountain, read; your original beside it on demand. A rewrite waiting for you is a review: it opens in
     Fountain review, not here. */
  /* ───── Script: the screenplay's one home, from the upload to your acceptance (D62) ─────
     merecdesperez44323-lab: "script, 这个part就把用户上传、drama-cli修改、revise、变成fountain， 用户确认， 这些在这个part都搞定，
     包括对比啥的， 改了啥". So the setup's Analyzing and Fountain review fold in here: they were steps ② to ④ of one thing.
     The sample is The Stepmother's real files (P.script); its states are the Prototype controls' "Script: …" states. */
  const SCRIPT_STATES = { scriptRewriting: "rewriting", scriptFailed: "failed", scriptYou: "you", scriptOriginal: "original" };
  const scriptState = () => SCRIPT_STATES[S.state] || "accepted";
  // drama-cli's screenplay check (drama_cli/screenplay.py, _slug's scene_time rule), with this sample's values: what the
  // check says when a rewrite keeps the original's "MORNING".
  const CHECK_FAILED = "line 3 · scene_time · the scene heading's time is 'MORNING': write DAY or NIGHT, and put a finer time in the action after it";
  // The Script row in the project tree says the same, as an episode row does (now-line + dot, the five maker states).
  const scriptRow = () => ({ rewriting: ["Rewriting", "work"], failed: ["Rewriting", "work"], you: ["Waiting for you", "you"], accepted: ["Accepted", "accepted"], original: ["Original only", "accepted"] })[scriptState()];
  function Script() {
    const sc = P.script, st = scriptState();
    const fl = sc.fountain, map = sc.map;
    const hasFountain = st !== "rewriting" && st !== "original";
    // An episode's "Episode script" (Segments) opens Script's document scrolled to that episode's section.
    const epNum = S.scriptEp ? Number(S.scriptEp.replace(/\D/g, "")) : null;
    const view = S.scriptEp && hasFountain ? "fountain" : S.sview && (hasFountain || S.sview === "original") ? S.sview : hasFountain ? "fountain" : "original";
    const sectionAt = epNum && fl.findIndex((l) => l.el === "section" && Number(l.text.replace(/\D/g, "")) === epNum);
    const target = sectionAt !== null && sectionAt >= 0 ? sectionAt : null;
    useEffect(() => { if (target !== null && view === "fountain") document.getElementById("fl-" + target)?.scrollIntoView({ block: "start", behavior: "smooth" }); }, [S.scriptEp, view]);
    // What changed is drama-cli's record, review.md's line map, never a diff of our own: an original line it rewrote, and
    // the Fountain lines it became.
    const changed = new Set(map.filter((r) => !r.same).map((r) => r.o));
    const became = new Set(map.filter((r) => !r.same).flatMap((r) => r.to.map((n) => n - 1)));
    const lit = S.ssel ? new Set((map.find((r) => r.o === S.ssel) || { to: [] }).to.map((n) => n - 1)) : new Set();
    const Line = (l, i) => (l.gap ? html`<div class="gap"></div>` : html`<div id=${"fl-" + i} class=${"fl " + l.el + (lit.has(l.source) ? " on" : "")}>${l.text}</div>`);
    // VS Code's diff editor: two panes, line numbers in the gutter, a changed row tinted, the panes scrolling together.
    const sync = (from) => (e) => { const other = e.currentTarget.parentElement.querySelector(from === "a" ? ".dpane.b" : ".dpane.a"); const a = e.currentTarget;
      if (other && !other.dataset.syncing) { a.dataset.syncing = "1"; other.scrollTop = (a.scrollTop / Math.max(1, a.scrollHeight - a.clientHeight)) * (other.scrollHeight - other.clientHeight); requestAnimationFrame(() => delete a.dataset.syncing); } };
    const origLines = sc.original.split("\n");
    const fountainRows = sc.fountainText.split("\n");
    const review = html`<details class="whatchanged"><summary>What changed</summary><pre class="document plain">${sc.review}</pre></details>`;
    // The history, newest on top (GitHub's pull-request timeline; Figma's and Google Docs' version history): each step as
    // drama-cli recorded it, drama-cli's own words where it refused.
    const events = {
      rewriting: [["work", "v1 · the agent is rewriting your file into Fountain", null], ["done", "Original uploaded · " + sc.file, "17:31"]],
      failed: [["work", "v2 · the agent revises it, then drama-cli checks again", null],
        ["err", html`v1 · check failed: <code>${CHECK_FAILED}</code> <span class="subtle">(example values)</span>`, "17:38"], ["done", "Original uploaded · " + sc.file, "17:31"]],
      you: [["you", html`v1 · check passed · <b>waiting for you</b>`, "17:38", true], ["done", "Original uploaded · " + sc.file, "17:31"]],
      accepted: [["done", "v1 · accepted in your words: “Yes, this is my script.”", "17:40"], ["done", "v1 · check passed (drama-cli screenplay check)", "17:38", true], ["done", "Original uploaded · " + sc.file, "17:31"]],
      original: [["done", "Original uploaded · " + sc.file, "17:31"]],
    }[st];
    const History = html`<ol class="history">${events.map(([kind, text, at, withReview]) => html`<li class=${kind}>
        <span class="dot ${kind === "you" ? "you" : kind === "work" ? "work" : kind === "err" ? "redline" : "accepted"}"></span>
        <div class="grow"><span>${text}</span>${at && html`<time>${at}</time>`}
          ${withReview && review}
          ${kind === "you" && html`<button class="btn sm primary" onClick=${() => set({ sview: "compare", saccept: true })}>Accept</button>`}</div></li>`)}</ol>`;
    return html`<div class="main">
      <${TopBar} crumbs=${[own.drama(), "Script"]}/>
      <div class="body"><div class="scrollmain">
        <div class="bar2"><span class="grow"></span><${ProjectChips}/></div>
        <${StopBanner}/>
        <div class="scripthead"><div class="grow"><h2 class="pagetitle">Script</h2>
          <p class="muted pagesub">Your screenplay from upload to acceptance: the agent rewrites it into Fountain, drama-cli checks it, and you accept it. Sample: ${sc.project}'s real files.</p></div></div>
        ${S.scriptEp && hasFountain && !target && html`<div class="notice" role="status">${I("info")}<span><b>${S.scriptEp} isn't in this sample's screenplay.</b> The sample is The Stepmother's two episodes; for a real project Script opens at ${S.scriptEp}'s section.</span></div>`}
        ${st === "original" && html`<div class="notice" role="status">${I("info")}<span><b>Only the original was recorded for this project.</b> It was set up before drama-cli kept the rewrite, its check and your acceptance, so there are none to show.</span></div>`}
        <div class="scriptlayout">
          <section class="panel scripthistory" aria-label="Versions"><h3>${I("stack")}Versions</h3>
            ${st === "accepted" ? html`<details><summary>Accepted v1 · 3 steps</summary>${History}</details>` : History}</section>
          ${st === "you" && S.saccept && html`<div class="faccept">
            <textarea placeholder="Accept the rewrite in your own words, e.g. “Yes, this is my script.” (required)" value=${S.words} onInput=${(e) => set({ words: e.target.value })}></textarea>
            <div class="fbtns"><button class="btn" onClick=${() => toast("Sent back to the agent with your words.")}>${I("arrow-counter-clockwise")}Send back</button>
              <button class="btn primary" disabled=${S.words.trim().length < 3} onClick=${() => { toast("Rewrite accepted, with your words. The agent starts the bible."); set({ state: "normal", saccept: false }); }}>${I("check")}Accept the rewrite</button></div>
            <small class="muted">${S.words.trim().length < 3 ? "Accepting needs your own words." : "Your words are recorded with the accepted file."}</small></div>`}
          <div class="scriptmain">
          ${/* VS Code's editor title area: the open file as a tab, its actions as icon buttons on the right (Apple HIG:
               an icon-only toolbar button has a tooltip and a name). */ ""}
          <div class="edbar"><div class="edtab" role="tab" aria-selected="true">${I(view === "original" ? "file-text" : view === "compare" ? "square-half" : "film-strip")}
              <b>${view === "compare" ? sc.file + " ↔ screenplay.fountain" : view === "original" ? sc.file : "screenplay.fountain"}</b>
              ${view !== "original" && html`<span class="tag">v1</span>`}
              ${/* Read-only for now (VS Code's read-only editor, files.readonly): a change goes through the agent, Send back
                   while a version waits for you, or ask the agent after acceptance; drama-cli checks the new version. */ ""}
              <span class="ro" title="Read-only: ask the agent for a change; it writes a new version that drama-cli checks and you accept">${I("lock-simple")}Read-only</span></div>
            <span class="grow"></span>
            ${[["original", "Show the original", "file-text"], ["fountain", "Show the Fountain", "film-strip"], ["compare", "Compare the original and the Fountain", "square-half"]].map(([k, l, ic]) =>
              html`<button class="ibtn" title=${!hasFountain && k !== "original" ? l + " · no Fountain recorded yet" : l} aria-label=${l} aria-pressed=${String(view === k)} disabled=${!hasFountain && k !== "original"} onClick=${() => set({ sview: k, scriptEp: null })}>${I(ic)}</button>`)}</div>
          ${view === "fountain" ? html`<section class="panel scriptdoc"><div class="fdoc">${fl.map(Line)}</div></section>`
            : view === "compare" ? html`<div class="diffed" aria-label="Changes: the original beside the Fountain">
                <div class="dpane a" onScroll=${sync("a")}><div class="dhead">${sc.file}</div>${origLines.map((t, i) => html`<button type="button" class=${"drow" + (changed.has(i + 1) ? " chg del" : "") + (S.ssel === i + 1 ? " on" : "")} onClick=${() => set({ ssel: i + 1 })}><span class="ln">${i + 1}</span><span class="tx">${t}</span></button>`)}</div>
                <div class="dpane b" onScroll=${sync("b")}><div class="dhead">screenplay.fountain <span class="tag">v1</span></div>${fountainRows.map((t, i) => html`<div class=${"drow" + (became.has(i) ? " chg add" : "") + (lit.has(i) ? " on" : "")}><span class="ln">${i + 1}</span><span class="tx">${t}</span></div>`)}</div>
                ${S.ssel && html`<p class="muted dnote">Line ${S.ssel} became: <code>${(map.find((r) => r.o === S.ssel) || { became: "a blank line" }).became}</code> · drama-cli's record (review.md)</p>`}</div>`
            : html`<section class="panel scriptdoc"><pre class="document plain">${sc.original}</pre></section>`}
        </div>
        </div>
      </div><${AgentPanel}/></div></div>`;
  }
  window.EXTRA = { BackTo, lineageOf, outOfDateAt, lineageInEpisode, outofdate: OutOfDate, script: Script, upload: Upload, story: Bible, graph: Graph, cut: Cut, delivery: Delivery, StopCard, scriptRow };
  window.PD.draw();
})();
