/* The rest of the flow in the pro direction: Upload, Analyzing, Fountain review, Story, Graph (lineage) and Cut,
   plus the setup steps and the stop cards. Uses the shell and helpers app.js exposes as window.PD. */
(() => {
  const { html, I, S, set, go, toast, money, Status, TopBar, StopBanner, SurfaceSwitch, ProjectChips, AgentPanel, SPENT_COVERS, useEffect, useRef } = window.PD;

  /* ───── setup steps (sidebar) ───── */
  function SetupSteps() {
    const fountain = S.screen === "fountain";
    const steps = [["Script", fountain ? "you" : "work", fountain ? "Your review" : "Checking the screenplay", fountain ? "fountain" : "analyzing"],
      ["Story", "line", "After your review"], ["Episodes", "line", "After the looks"], ["Cut", "line", "Per episode"]];
    return html`<ol class="setup">${steps.map(([t, st, d, sc], i) => html`<li class=${st}><button disabled=${!sc} aria-current=${String(S.screen === sc)} onClick=${() => sc && go(sc)}>
      <span class="n">${st === "accepted" ? I("check") : i + 1}</span><span><b>${t}</b><small>${d}</small></span></button></li>`)}</ol>`;
  }

  /* ───── stop cards: drama-cli's refusal shown as data ───── */
  function StopCard({ kind }) {
    const K = {
      redline: { icon: "warning", head: "Stopped · a red line in the screenplay", title: "EP007's bible range names a red line", code: "RedLine",
        said: "Bible bible/b0004 is not usable: red line: EP007 scene 4, a guard strikes Luca in the cell on screen. See bible/b0004/bible.md; report it to the person and pass their decision back with drama-cli bible --config drama-cli.cfg.yaml EP007-EP012 --feedback '<their decision>'",
        acts: [["Decide in your words", "primary"], ["Open the scene", ""]], note: "Only a red line in your screenplay stops for you. Other episodes carry on." },
      budget: { icon: "coins", head: "Stopped · budget", title: "The budget is spent", code: "Refused",
        said: "Budget exceeded: spent 996.40 + reserved 3.20 + this 1.20 > budget 1000.00",
        acts: [["Raise the budget", "primary"], ["Stop the drama", "danger"]], note: "Work in flight is waited on and recorded, never sent again." },
      cap: { icon: "stack", head: "Stopped · limit reached", title: "EP004 seg06's storyboard reached its limit of new versions", code: "SetLimitExceeded.max_new_versions",
        said: "episodes/EP004/multi_panel_storyboard/seg06/line-art has had 3 new paid versions after its first, the limit defaults.max_new_versions (3); ask the person before making it again: they lift the limit for that item by raising defaults.max_new_versions in the config, then set it back; then run drama-cli storyboard --config drama-cli.cfg.yaml EP004 seg06",
        acts: [["Allow one more version of seg06", "primary"], ["Review its versions", ""]], note: "Allowing raises the limit for this item, runs it once, then sets the limit back." },
      env: { icon: "lock-simple", head: "Stopped · credentials refused", title: "The video provider's credentials are missing", code: "InvalidParameter.env",
        said: "Missing credential: set ARK_API_KEY in ~/dramas/bride-on-bail/.env",
        acts: [["Open Computer settings", "primary"], ["Try again", ""]], note: "Nothing was sent or spent. The key is never shown here." },
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
      <header class="top"><button class="ibtn" aria-label="Back" onClick=${() => go("home")}>${I("caret-left")}</button><div class="crumb"><span>Dramas</span>${I("caret-right")}<b>New drama</b></div><span class="grow"></span></header>
      <div class="scrollmain"><div class="wrap" style="max-width:1040px">
        <div class="greet"><div class="grow"><h1>New drama</h1><p>Check the file, choose how it is made, and start. Nothing is spent until the agent writes the bible.</p></div></div>
        <div class="formgrid">
          <div class="fcol">
            <section class="panel"><h3>${I("file-text")}Screenplay</h3>
              ${S.file ? html`<div class="filerow">${I("file-text")}<span class="grow"><b>${S.file.name}</b><small>${S.file.size} · ${S.file.pages} pages · Word</small></span><button class="btn sm ghost" onClick=${() => set({ file: null })}>Replace</button></div>`
                : html`<button class=${"dropzone " + (S.over ? "over" : "")} onClick=${pick} onDragOver=${(e) => { e.preventDefault(); if (!S.over) set({ over: true }); }} onDragLeave=${() => set({ over: false })} onDrop=${(e) => { e.preventDefault(); set({ over: false }); pick(); }}>
                  <span class="plus">${I("upload")}</span><b>Drop your screenplay</b><small>Fountain, Word, PDF or plain text · or click to choose</small></button>`}
            </section>
            <section class="panel"><h3>${I("sliders-horizontal")}Preset</h3><p class="muted" style="margin-bottom:10px">How the drama is made: language, look and audience. You choose; it can't be changed later.</p>
              <div class="presets">${P.presets.map((p) => html`<button class="preset" aria-pressed=${String(S.preset === p.id)} onClick=${() => set({ preset: p.id })}>
                <span class="radio"></span><span class="grow"><b>${p.t}</b><small>${p.d}</small><code>${p.id}</code></span></button>`)}</div></section>
            <section class="panel"><h3>${I("clock")}Episodes and budget</h3>
              <div class="fields">
                <label><span>Episode length</span><div class="seg">${["60", "90", "120"].map((v) => html`<button aria-pressed=${String(S.len === v)} onClick=${() => set({ len: v })}>${v} s</button>`)}</div></label>
                <label><span>Budget</span><div class="inputwrap">$<input value=${S.budget} inputmode="decimal" onInput=${(e) => set({ budget: e.target.value })}/></div><small class="muted">${SPENT_COVERS} The drama stops and asks you when it is spent.</small></label>
              </div></section>
          </div>
          <aside class="panel next"><h3>What happens next</h3>
            <ol class="nextsteps">
              <li><b>The agent rewrites your file into Fountain and checks it</b><small>Free. Minutes.</small></li>
              <li><b>You review what changed</b><small>Answer its questions, then accept in your own words.</small></li>
              <li><b>The agent writes the bible and draws the cast and places</b><small>You review the looks before any episode starts.</small></li>
              <li><b>Episodes: storyboards, then takes</b><small>You watch every take and decide.</small></li></ol>
            <button class="btn lg primary" style="width:100%" disabled=${!ready} onClick=${() => { set({ ana: 0 }); go("analyzing"); }}>Start</button>
            <small class="muted">${ready ? "Starts the setup session." : !S.file ? "Add a screenplay to start." : "Choose a preset to start."}</small></aside>
        </div></div></div></div>`;
  }

  /* ───── Analyzing ───── */
  function Analyzing() {
    useEffect(() => { if (S.ana >= P.setupSteps.length) return; const t = setTimeout(() => set({ ana: S.ana + 1 }), 1100); return () => clearTimeout(t); });
    const done = S.ana >= P.setupSteps.length;
    return html`<div class="main">
      <${TopBar} crumbs=${[P.project.title, "Setup", "Script"]}/>
      <${StopBanner}/>
      <div class="scrollmain"><div class="wrap" style="max-width:1120px">
        <div class="greet"><div class="grow"><span class="kick">Step 1 of 4 · Script</span><h1>${done ? "Your Fountain is ready" : "Analyzing your script"}</h1>
          <p>${done ? "The agent rewrote your file into Fountain and checked it. One question waits for you." : "The agent rewrites your file into Fountain, the screenplay format drama-cli reads, and checks it."}</p></div>
          ${done ? html`<button class="btn lg primary" onClick=${() => go("fountain")}>${I("eye")}Review the rewrite</button>`
            : html`<button class="btn danger" onClick=${() => set({ dialog: { title: "Stop analyzing?", body: "Nothing paid is in flight at this step. The project keeps your file; you can start again.", ok: "Stop analyzing", danger: true, cancel: "Keep going", run: () => { toast("Analyzing stopped."); go("home"); } } })}>${I("stop")}Stop analyzing</button>`}</div>
        <div class="anagrid">
          <section class="panel"><h3>${I("list-checks")}Process<span class="grow"></span><span class="muted mono" style="font-size:11.5px">${Math.min(S.ana, P.setupSteps.length)} of ${P.setupSteps.length}</span></h3>
            <div class="bigbar"><i style=${`width:${(Math.min(S.ana, P.setupSteps.length) / P.setupSteps.length) * 100}%`}></i></div>
            <ol class="steps big">${P.setupSteps.map((s, i) => html`<li class=${i === S.ana ? "now" : i > S.ana ? "later" : ""}>${I(i < S.ana ? "check-circle" : i === S.ana ? "circle-notch" : "circle")}<span>${s.t} ${s.c && html`<code>${s.c}</code>`}</span><time>${i < S.ana ? s.time : ""}</time></li>`)}</ol>
            <p class="muted" style="font-size:12px;margin-top:10px">Free so far: reading and checking a screenplay calls no paid model.</p></section>
          <section class="panel"><h3>${I("file-text")}The Fountain so far<span class="grow"></span><span class="tag">read-only</span></h3>
            <div class="fpeek">${P.fountain.slice(0, 4 + S.ana * 4).map((l) => l.gap ? html`<div class="gap"></div>` : html`<div class=${"fl " + l.el}>${l.tx}</div>`)}</div></section>
        </div></div></div></div>`;
  }

  /* ───── Fountain review ───── */
  function Fountain() {
    const ok = S.tod && S.words.trim().length >= 3;
    const hit = (l) => S.fsel && l.from && l.from.includes(S.fsel);
    return html`<div class="main">
      <${TopBar} crumbs=${[P.project.title, "Setup", "Fountain review"]}/>
      <${StopBanner}/>
      <div class="frev">
        <div class="frevhead"><div class="grow"><span class="kick">Step 1 of 4 · Your review</span><h2>Check what the rewrite changed</h2>
          <p class="muted">7 lines changed form, nothing was removed, and 1 question waits. Click a line to see where it came from.</p></div>
          <div class="facts"><span><b>24</b> episodes</span><span><b>212</b> scenes</span><span><b>0</b> red lines</span></div></div>
        <div class="fpanes">
          <section class="fpane"><h4>Your file</h4><ol class="orig">${P.orig.map((l, i) => html`<li><button type="button" class=${S.fsel === i + 1 ? "on" : ""} aria-pressed=${String(S.fsel === i + 1)} onClick=${() => set({ fsel: i + 1 })}><span>${i + 1}</span>${l}</button></li>`)}</ol></section>
          <section class="fpane fnt"><h4>Fountain <span class="tag">screenplay.md</span></h4>
            <div class="fdoc">${P.fountain.map((l) => l.gap ? html`<div class="gap"></div>`
              : l.ask ? html`<div class=${"fl " + l.el + " ask"}>INT. LUCA'S APARTMENT - <span class="q">${S.tod ? S.tod.toUpperCase() : "?"}</span> #6-2#
                  ${l.why && html`<span class="why">${l.why}</span>`}
                  <span class="seg ask" role="group" aria-label="Time of day">${["Day", "Night"].map((v) => html`<button aria-pressed=${String(S.tod === v)} onClick=${() => set({ tod: v })}>${v}</button>`)}</span></div>`
              : html`<button type="button" class=${"fl " + l.el + (hit(l) ? " on" : "")} aria-pressed=${String(Boolean(hit(l)))} onClick=${() => l.from && set({ fsel: l.from[0] })}>${l.tx}
                  ${hit(l) && l.why && html`<span class="why">${l.why}</span>`}</button>`)}</div></section>
        </div>
        <div class="faccept">
          <textarea placeholder="Accept the rewrite in your own words, e.g. “Yes, this is my script.” (required)" value=${S.words} onInput=${(e) => set({ words: e.target.value })}></textarea>
          <div class="fbtns"><button class="btn" onClick=${() => set({ dialog: { title: "Send the rewrite back?", body: "Tell the agent what to change. It rewrites and checks again; nothing is spent.", ok: "Send back", cancel: "Cancel", run: () => toast("Sent back to the agent.") } })}>${I("arrow-counter-clockwise")}Send back</button>
            <button class="btn primary" disabled=${!ok} onClick=${() => { toast("Rewrite accepted, with your words. The agent starts the bible."); go("story"); }}>${I("check")}Accept the rewrite</button></div>
          <small class="muted">${!S.tod ? "Answer the question first: Day or Night." : !ok ? "Accepting needs your own words." : "Your words are recorded with the accepted file."}</small></div>
      </div></div>`;
  }

  /* ───── Story: bible, cast, world ───── */
  function ReviewBtns({ id }) {
    const v = S.cards[id];
    const setv = (val) => set({ cards: { ...S.cards, [id]: v === val ? undefined : val } });
    return html`<div class="cardacts"><button class=${"mini acc"} aria-pressed=${String(v === "accept")} onClick=${() => setv("accept")}>${I("check")}Accept</button>
      <button class="mini back" aria-pressed=${String(v === "back")} onClick=${() => setv("back")}>${I("arrow-counter-clockwise")}Send back</button>
      <button class="mini note" aria-pressed=${String(v === "note")} onClick=${() => setv("note")}>${I("note-pencil")}Note</button></div>
      ${(v === "back" || v === "note") && html`<input class="why" placeholder=${v === "back" ? "Why it goes back (required)" : "Your note"} value=${S.cardWhy[id] || ""} onInput=${(e) => set({ cardWhy: { ...S.cardWhy, [id]: e.target.value } })}/>`}`;
  }
  function Story() {
    const tabs = [["bible", "Bible"], ["cast", "Cast", P.cast.length], ["scenes", "Scenes", P.places.length], ["props", "Props", P.props.length]];
    const open = ["margaret", "garden"], decided = open.filter((k) => S.cards[k] && (S.cards[k] !== "back" || (S.cardWhy[k] || "").trim())).length;
    return html`<div class="main">
      <${TopBar} crumbs=${[P.project.title, "Story"]}/>
      <div class="body"><div class="scrollmain">
        <div class="bar2"><${SurfaceSwitch}/><span class="grow"></span><${ProjectChips}/></div>
        <${StopBanner}/>
        <div style="padding:0 16px"><div class="tabsrow" style="margin:4px 0 18px"><div class="utabs" role="tablist">${tabs.map(([k, l, n]) => html`<button role="tab" aria-selected=${String(S.stab === k)} onClick=${() => set({ stab: k })}>${l}${n && html`<small>${n}</small>`}</button>`)}</div>
          <span class="grow"></span><span class="muted" style="font-size:12px">Bible b0003 · accepted · EP001–EP012 written</span></div></div>
        ${S.stab === "bible" && html`<div class="biblegrid">
          <section class="panel"><span class="kick">Logline</span><p class="logline">${P.bible.logline}</p>
            <div class="tags" style="display:flex;gap:6px;margin-top:12px"><span class="tag">Romance</span><span class="tag">Legal</span><span class="tag">24 × 90 s</span></div></section>
          <section class="panel"><h3>${I("list-numbers")}Beats</h3><ol class="beats">${P.bible.beats.map((b) => html`<li>${b}</li>`)}</ol></section>
          <section class="panel wide"><h3>${I("film-strip")}Episodes<span class="grow"></span><span class="muted" style="font-size:11.5px;font-weight:500">12 of 24 written · the next range is written when EP007 starts</span></h3>
            <div class="eplist">${P.bible.eps.map(([c, t, s], i) => html`<div class="eprow"><img src=${P.eps[i].cover} alt=""/><span class="mono">${c}</span><b>${t}</b><span class="muted grow">${s}</span></div>`)}</div></section>
        </div>`}
        ${S.stab === "cast" && html`<div class="castgrid">${P.cast.map((c) => html`<article class="castcard">
          <div class="pic"><img src=${c.sheet} alt=""/>${Status(c.st, c.st === "back" ? "Sent back · 1 error" : c.st === "you" ? "Waiting for you · 1 warn" : undefined)}</div>
          <div class="ctxt"><div style="display:flex;align-items:baseline;gap:8px"><b class="grow">${c.name}</b><span class="mono subtle" style="font-size:11px">${c.ver}</span></div>
            <small class="muted">${c.role}</small>
            <div class="aka"><span class="muted">Also called</span>${(P.names[c.id] || []).map((n) => html`<span class="tag">${n}</span>`)}</div>
            ${c.st === "you" && html`<div class="finding warn">${I("warning")}<span>warn · The blouse reads as purple; the bible says plum.</span></div><${ReviewBtns} id=${c.id}/>`}
            ${c.st === "back" && html`<div class="finding err">${I("warning-circle")}<span>Sent back by the agent: the observer found an error (a third hand). Redrawing.</span></div>`}
          </div></article>`)}</div>`}
        ${S.stab === "scenes" && html`<div class="worldgrid">${P.places.map((p) => html`<article class="placecard">
          <div class="pic"><img src=${p.pic} alt=""/>${p.st !== "accepted" && Status(p.st)}</div>
          <div class="ctxt"><div style="display:flex;align-items:baseline;gap:8px"><b class="grow">${p.name}</b><span class="mono subtle" style="font-size:11px">${p.ver}</span></div>
            <p class="desc">${p.desc}</p>
            <div class="aka"><span class="muted">Views</span>${p.views.map((v) => html`<span class="tag">${v}</span>`)}</div>
            <div class="aka"><span class="muted">Times</span>${p.times.map(([t, v]) => html`<span class="tag">${t} · ${v}</span>`)}</div>
            ${p.st === "you" && html`<${ReviewBtns} id=${p.id}/>`}</div></article>`)}</div>`}
        ${S.stab === "props" && html`<div class="worldgrid">${P.props.map((p) => html`<article class="placecard"><div class="pic"><img src=${p.pic} alt=""/>${p.st !== "accepted" && Status(p.st)}</div>
          <div class="ctxt"><div style="display:flex;align-items:baseline;gap:8px"><b class="grow">${p.name}</b><span class="mono subtle" style="font-size:11px">${p.ver}</span></div><small class="muted">Key prop</small><p class="desc">${p.desc}</p></div></article>`)}</div>`}
        ${S.stab !== "bible" && html`<div class="sendstrip"><span class="muted">Looks and plates · ${decided} of 2 decided</span><span class="grow"></span>
          <button class="btn primary sm" disabled=${decided < 2} onClick=${() => toast("Review sent: Margaret Cole and Garden wedding.")}>Send review</button></div>`}
      </div><${AgentPanel}/></div></div>`;
  }

  /* ───── Graph: lineage, read-only ───── */
  const G = [
    { id: "sp", col: 0, row: 1, t: "Screenplay", v: "v2", k: "screenplay", pic: null, icon: "file-text" },
    { id: "bible", col: 1, row: 1, t: "Bible", v: "b0003", k: "bible", pic: null, icon: "book-open" },
    { id: "luca", col: 2, row: 0, t: "Luca Moreno", v: "S0 v2", k: "look", pic: "img/face-luca.jpg" },
    { id: "ethan", col: 2, row: 1, t: "Ethan Cole", v: "S0 v1", k: "look", pic: "img/face-ethan.jpg" },
    { id: "apt", col: 2, row: 2, t: "Luca's apartment", v: "v2", k: "plate", pic: "img/plate-apartment.jpg" },
    { id: "file", col: 2, row: 3, t: "Case file", v: "v1", k: "prop", pic: "img/prop-folder.jpg", stale: true },
    { id: "ep6seg03", col: 3, row: 1, t: "EP006 seg03 storyboard", v: "v1", k: "storyboard", pic: "img/board-seg03.jpg", stale: true },
    { id: "take", col: 4, row: 1, t: "EP006 seg03 take", v: "t02", k: "take", pic: "img/still-s3t2.jpg", stale: true },
    { id: "cut", col: 5, row: 1, t: "EP006 cut", v: "v1", k: "cut", pic: "img/cover-ep6.jpg", stale: true },
  ];
  const GE = [["sp", "bible"], ["bible", "luca"], ["bible", "ethan"], ["bible", "apt"], ["bible", "file"], ["luca", "ep6seg03"], ["ethan", "ep6seg03"], ["apt", "ep6seg03"], ["file", "ep6seg03"], ["ep6seg03", "take"], ["take", "cut"]];
  function Graph() {
    const W = 156, H = 112, GX = 34, GY = 22, pos = (n) => ({ x: 24 + n.col * (W + GX), y: 24 + n.row * (H + GY) });
    const by = Object.fromEntries(G.map((n) => [n.id, n])), sel = by[S.gsel] || by.ep6seg03;
    const up = new Set(), down = new Set();
    const walk = (id, dir, acc) => GE.forEach(([a, b]) => { const [f, t] = dir ? [a, b] : [b, a]; if (f === id && !acc.has(t)) { acc.add(t); walk(t, dir, acc); } });
    walk(sel.id, false, up); walk(sel.id, true, down);
    const cols = ["Screenplay", "Bible", "Looks, plates, props", "Storyboards", "Takes", "Cut"];
    return html`<div class="main">
      <${TopBar} crumbs=${[P.project.title, "Lineage"]}/>
      <${StopBanner}/>
      <div class="body"><div class="scrollmain">
        <div class="bar2"><${SurfaceSwitch}/><span class="grow"></span><${ProjectChips}/></div>
        <div class="stalebar">${I("warning")}<span><b>4 items are stale.</b> Case file v1 was made from bible b0002, and b0003 is accepted. What was made from it is stale until the agent redraws it.</span><span class="grow"></span><button class="btn sm" onClick=${() => toast("Sent to the agent as a steering note: redo the 4 stale items.")}>Ask the agent to redo them</button></div>
        <div class="graphwrap"><div class="graph" style=${`width:${24 * 2 + 6 * W + 5 * GX}px;height:${24 * 2 + 4 * H + 3 * GY + 24}px`}>
          ${cols.map((c, i) => html`<span class="gcol" style=${`left:${24 + i * (W + GX)}px`}>${c}</span>`)}
          <svg class="gwires" width="100%" height="100%">${GE.map(([a, b]) => { const A = pos(by[a]), B = pos(by[b]); const x1 = A.x + W, y1 = A.y + H / 2 + 24, x2 = B.x, y2 = B.y + H / 2 + 24, m = (x1 + x2) / 2;
            const on = (a === sel.id || up.has(a)) && (b === sel.id || up.has(b)) || (a === sel.id || down.has(a)) && (b === sel.id || down.has(b));
            return html`<path class=${(on ? "on " : "") + (by[b].stale && by[a].stale || a === "file" ? "stale" : "")} d=${`M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`}/>`; })}</svg>
          ${G.map((n) => { const p = pos(n), rel = n.id === sel.id ? "sel" : up.has(n.id) ? "up" : down.has(n.id) ? "down" : "dim";
            return html`<button class=${"gnode " + rel + (n.stale ? " stale" : "")} style=${`left:${p.x}px;top:${p.y + 24}px;width:${W}px;height:${H}px`} onClick=${() => set({ gsel: n.id })}>
              <span class="gpic">${n.pic ? html`<img src=${n.pic} alt=""/>` : I(n.icon)}</span>
              <span class="gtxt"><b>${n.t}</b><span class="mono">${n.v}</span>${n.stale ? html`<span class="st stale"><i></i>Stale</span>` : html`<span class="st accepted"><i></i>Accepted</span>`}</span></button>`; })}
        </div></div>
        <div class="glegend"><span><i class="l up"></i>Made from (upstream)</span><span><i class="l down"></i>Made from it (downstream)</span><span><i class="l stale"></i>Stale</span><span class="subtle">Read-only. Click a version to trace it.</span></div>
      </div>
      <aside class="insp"><div class="ihead"><b>${sel.t}</b><small>${sel.k} · ${sel.v}</small></div>
        <div class="iscroll">
          ${sel.pic && html`<div class="isec"><img src=${sel.pic} alt="" style="width:100%;border-radius:10px;max-height:240px;object-fit:cover;object-position:top"/></div>`}
          <div class="isec"><h4>State</h4>${sel.stale ? html`<div class="finding warn">${I("warning")}<span>${sel.id === "file" ? "Made from bible b0002; b0003 is accepted." : "Made from Case file v1, which is stale."} The agent redraws it.</span></div>` : html`<span class="muted">Fresh: made from the accepted versions.</span>`}</div>
          <div class="isec"><h4>Made from <span class="muted">${up.size}</span></h4>${[...up].map((id) => html`<button class="lrow" onClick=${() => set({ gsel: id })}>${by[id].t}<span class="mono subtle">${by[id].v}</span></button>`)}</div>
          <div class="isec"><h4>Made from it <span class="muted">${down.size}</span></h4>${[...down].map((id) => html`<button class="lrow" onClick=${() => set({ gsel: id })}>${by[id].t}<span class="mono subtle">${by[id].v}</span></button>`)}${!down.size && html`<span class="muted">Nothing yet.</span>`}</div>
        </div></aside></div></div>`;
  }

  /* ───── Cut ───── */
  function Cut() {
    const vref = useRef(null), c = P.cut, notes = S.cutNotes || c.notes;
    useEffect(() => { const el = vref.current; if (!el) return; if (S.cutPlaying) el.play().catch(() => set({ cutPlaying: false })); else el.pause(); });
    const seek = (t) => { if (vref.current) vref.current.currentTime = t; set({ cutT: t }); };
    const fmt = (t) => "0:" + String(Math.floor(t)).padStart(2, "0");
    let acc = 0;
    return html`<div class="main">
      <${TopBar} crumbs=${[P.project.title, "EP006", "Cut v1"]}/>
      <${StopBanner}/>
      <div class="room is-cut">
        <section class="stage">
          <div class="screen"><div class="player">
            <video ref=${vref} src=${c.src} poster="img/still-s1t2.jpg" muted playsinline preload="metadata" onTimeUpdate=${(e) => set({ cutT: e.target.currentTime })} onEnded=${() => set({ cutPlaying: false })}></video>
            <span class="tag2">EP006 · cut v1</span>
            ${!S.cutPlaying && html`<button class="bigplay" aria-label="Play" onClick=${() => set({ cutPlaying: true })}><i>${I("play")}</i></button>`}</div></div>
          <div class="cuttl">
            <div class="controls" style="border-top:0;padding:0 0 8px"><button class="pp" aria-label=${S.cutPlaying ? "Pause" : "Play"} onClick=${() => set({ cutPlaying: !S.cutPlaying })}>${I(S.cutPlaying ? "pause" : "play")}</button>
              <span class="t">${S.cutT.toFixed(1)}s <small>/ ${c.dur.toFixed(1)}s</small></span><span class="grow"></span><span class="muted" style="font-size:11.5px">9:16 · 480p · subtitles from the screenplay · muted in this prototype</span></div>
            <div class="tl" onClick=${(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(Math.max(0, Math.min(c.dur, ((e.clientX - r.left) / r.width) * c.dur))); }}>
              <div class="tlsegs">${c.segs.map(([s, t, d, pic], i) => { const left = acc; acc += d; return html`<button class=${"tlseg" + (S.cutSel === i ? " on" : "")} style=${`left:${(left / c.dur) * 100}%;width:${(d / c.dur) * 100}%;background-image:url(${pic})`} onClick=${(e) => { e.stopPropagation(); set({ cutSel: i }); seek(left); }}><span>${s} · ${t}</span></button>`; })}</div>
              ${notes.map((n) => html`<span class="pin" style=${`left:${(n.t / c.dur) * 100}%`} title=${n.text}>${I("note-pencil")}</span>`)}
              <span class="head" style=${`left:${(S.cutT / c.dur) * 100}%`}></span></div>
            <div class="tracks">
              <div class="trk"><span class="trk-h">Sound</span><div class="trk-lane wave">${Array.from({ length: 96 }, (_, i) => html`<i style=${`height:${18 + Math.round(70 * Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11)))}%`}></i>`)}</div></div>
              <div class="trk"><span class="trk-h">${I("chats")}Lines</span><div class="trk-lane">${c.lines.map(([t, d, text]) => html`<button class="line" style=${`left:${(t / c.dur) * 100}%;width:${(d / c.dur) * 100}%`} title=${text} onClick=${() => seek(t)}>${text}</button>`)}</div></div>
            </div>
          </div>
        </section>
        <aside class="insp"><div class="ihead"><b>EP006 · cut v1</b><small>${c.dur} s of 90 s planned · 2 of 4 segments in this sample</small></div>
          <div class="iscroll">
            <div class="isec"><h4>Notes at a time <span class="muted">${notes.length}</span></h4>
              ${notes.map((n, i) => html`<div class="noterow"><button class="mono tbtn" onClick=${() => seek(n.t)}>${fmt(n.t)}</button><span class="grow">${n.text}</span><button class="ibtn" aria-label="Remove note" onClick=${() => set({ cutNotes: notes.filter((_, j) => j !== i) })}>${I("x")}</button></div>`)}
              <div class="addnote"><span class="mono">${fmt(S.cutT)}</span><input placeholder="Add a note at the playhead…" value=${S.noteDraft} onInput=${(e) => set({ noteDraft: e.target.value })}
                onKeyDown=${(e) => { if (e.key === "Enter" && S.noteDraft.trim()) set({ cutNotes: [...notes, { t: S.cutT, text: S.noteDraft.trim() }].sort((a, b) => a.t - b.t), noteDraft: "" }); }}/></div></div>
            ${S.cutSel != null && c.segs[S.cutSel] && (() => { const [seg, take, d] = c.segs[S.cutSel]; return html`<div class="isec"><h4>Properties <span class="muted">${seg}</span></h4>
              <dl class="kv"><dt>Segment</dt><dd>${seg}</dd><dt>Take</dt><dd>${take}</dd><dt>Model</dt><dd>${c.spec.model}</dd><dt>Duration</dt><dd class="mono">${d} s</dd><dt>Picture</dt><dd>${c.spec.ratio} · ${c.spec.resolution} · ${c.spec.fps} fps</dd></dl>
              <div class="propoff"><span class="muted">Speed</span><div class="seg" aria-disabled="true">${["0.5×", "1×", "1.5×", "2×"].map((x) => html`<button disabled aria-pressed=${String(x === "1×")}>${x}</button>`)}</div>
                <span class="muted">Volume</span><input type="range" disabled value="80" aria-label="Volume"/>
                <p class="muted">drama-cli makes every cut; editing here comes later.</p></div>
              <button class="btn sm" onClick=${() => go("canvas")}>${I("flow-arrow")}Open on Canvas</button></div>`; })()}
            <div class="isec"><h4>Made from</h4>${c.segs.map(([s, t, d]) => html`<div class="lrow static">${s} · take ${t}<span class="mono muted">${d} s</span></div>`)}</div>
            <div class="isec" style="border-bottom:0"><h4>What happens</h4><p class="muted" style="font-size:12.5px;line-height:1.55">Send back with your notes and the agent plans the cut again; building a cut is free. Accept, and EP006 is delivered.</p></div>
          </div>
          <div class="verdict"><div class="vrow" style="grid-template-columns:1fr 1fr">
            <button class="vbtn acc" aria-pressed=${String(S.cutV === "accept")} onClick=${() => set({ cutV: S.cutV === "accept" ? null : "accept" })}>${I("check")}Accept cut</button>
            <button class="vbtn back" aria-pressed=${String(S.cutV === "back")} onClick=${() => set({ cutV: S.cutV === "back" ? null : "back" })}>${I("arrow-counter-clockwise")}Send back</button></div>
            ${S.cutV === "back" && html`<textarea placeholder="Why it goes back (required). Your timed notes go with it." value=${S.cutWhy} onInput=${(e) => set({ cutWhy: e.target.value })}></textarea>`}
            <button class="btn primary" disabled=${!S.cutV || (S.cutV === "back" && !S.cutWhy.trim())} onClick=${() => toast(S.cutV === "accept" ? "EP006 cut accepted." : "Cut sent back with " + notes.length + " notes.")}>Send review</button></div>
        </aside></div></div>`;
  }

  /* ───── Episode: its segments scene by scene, the take beside its shot text (reveric's 分镜 list) ───── */
  function Episode() {
    const ep = P.eps[5];
    const place = (id) => (P.places.find((p) => p.id === id) || {}).name || id;
    return html`<div class="main">
      <${TopBar} crumbs=${[P.project.title, "Episodes", ep.code]}/>
      <div class="body"><div class="scrollmain">
        <div class="bar2"><${SurfaceSwitch}/><span class="grow"></span><${ProjectChips}/></div>
        <${StopBanner}/>
        <div class="ephead"><h2>${ep.code}<span class="muted"> · ${ep.title}</span></h2><span class="muted">${ep.now}</span><span class="grow"></span><span class="mono muted">${money(ep.spent)}</span></div>
        ${P.scenes.map((sc) => html`<section class="panel segscene"><h3>${I("film-strip")}Scene ${sc.n} · ${place(sc.place)} · ${sc.time}<span class="grow"></span>
            <span class="muted" style="font-size:11.5px;font-weight:500">${sc.segs.filter((g) => g.st === "accepted").length} of ${sc.segs.length} accepted</span></h3>
          ${sc.segs.map((g) => html`<div class="segrow">
            <img src=${g.still || g.board} alt=""/>
            <div class="segtext">
              <div class="seghead"><b>${g.id}</b>${Status(g.st, g.st === "you" ? "Take waits for you" : undefined)}<span class="grow"></span>
                <span class="mono muted">sd25 · 9:16 · ${g.s} s · ${g.take}</span>
                <button class="btn sm ghost" onClick=${() => go("canvas")}>On Canvas ${I("arrow-right")}</button></div>
              <p class="shottext">${g.text}</p></div></div>`)}</section>`)}
      </div><${AgentPanel}/></div></div>`;
  }

  window.EXTRA = { upload: Upload, analyzing: Analyzing, fountain: Fountain, story: Story, graph: Graph, cut: Cut, episode: Episode, StopCard, SetupSteps };
  window.PD.draw();
})();
