/* Pine Drama Studio, pro direction: Home, Episodes board, Canvas and the take Review room.
   Phase 1 is steering only: Accept, Send back with a reason, Note, Stop and messages to the agent. Canvas is read-only. */
(() => {
  const { html, render, useEffect, useRef } = window.htmPreact;
  const root = document.getElementById("root");
  const SPENT_COVERS = "Agent turns and video, priced when each turn ends.";
  const SCREENS = ["home", "upload", "analyzing", "fountain", "story", "episodes", "episode", "canvas", "graph", "review", "cut"];
  const SETUP = ["analyzing", "fountain"];
  const hash = (location.hash || "").slice(1);
  const S = {
    screen: SCREENS.includes(hash) ? hash : "home", theme: "dark", side: true, tab: "all", filter: "all",
    dialog: null, toasts: [], dramaStop: null, draft: "", chat: [],
    cam: { x: 40, y: 96, k: 0.62 }, sel: null, dock: (() => { try { return localStorage.getItem("studio.canvas.dock") || "under"; } catch (e) { return "under"; } })(), follow: true, agentOpen: false, panning: null, minimap: true,
    ti: 0, playing: false, t: 0, watched: {}, maxT: {}, verdict: {}, reason: {}, showPrev: false, sent: false, over: false,
    state: "normal", file: null, preset: null, len: "90", budget: "1000", ana: 0, tod: null, words: "", stab: "bible", cards: {}, cardWhy: {}, gsel: "ep6seg03", cutT: 0, cutPlaying: false, cutNotes: null, noteDraft: "", cutV: null, cutWhy: "",
  };
  let drawing = false;
  const draw = () => { if (!drawing) { drawing = true; requestAnimationFrame(() => { drawing = false; render(html`<${App}/>`, root); }); } };
  const set = (p) => { Object.assign(S, typeof p === "function" ? p(S) : p); draw(); };
  const go = (screen) => { set({ screen, sel: null, agentOpen: false, playing: false }); try { history.replaceState(null, "", "#" + screen); } catch (e) { /* the hash is a convenience */ } };
  let tid = 0;
  const toast = (text, action) => { const id = ++tid; set({ toasts: [...S.toasts, { id, text, action }] }); setTimeout(() => set({ toasts: S.toasts.filter((t) => t.id !== id) }), 4200); };
  const money = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const I = (name, cls) => html`<span class=${"ic " + (cls || "")} dangerouslySetInnerHTML=${{ __html: `<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">${window.ICONS[name] || ""}</svg>` }}></span>`;
  const ST = { you: "Waiting for you", work: "At work", accepted: "Accepted", back: "Sent back", line: "In line", stale: "Stale", redline: "Red line", err: "1 error" };
  const Status = (st, label) => html`<span class=${"st " + st}><i></i>${label || ST[st]}</span>`;
  const Mark = () => html`<span class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5 6.6 9.2h2.9L5.4 14.4h3.4L4.5 19.8h6.3V22h2.4v-2.2h6.3l-4.3-5.4h3.4l-4.1-5.2h2.9z"/></svg></span>`;

  function applyTheme() { document.documentElement.setAttribute("data-palette", "classic"); document.documentElement.setAttribute("data-theme", S.theme); }

  /* ───── shell ───── */
  const decisions = () => [
    { t: "EP006 · takes", d: "2 takes · seg01, seg03", age: "4 min", pic: P.takes[0].poster, go: "review" },
    { t: "Looks and plates", d: "2 items · Margaret Cole, Garden wedding", age: "12 min", pic: P.cast[3].face, go: "canvas" },
    { t: "EP004 · storyboards", d: "6 items · scene 1 and 2", age: "26 min", pic: "img/board-seg03.jpg", go: "episodes" },
    { t: "EP001 · cut v2", d: "1 item · The Wedding", age: "1 h", pic: P.eps[0].cover, go: "episodes" },
  ];
  function Rail() {
    const items = [["house", "Home", "home"], ["file-text", "Script", "fountain"], ["users", "Story", "story"], ["film-strip", "Episodes", "episodes"], ["flow-arrow", "Canvas", "canvas"], ["tree-structure", "Lineage", "graph"], ["video-camera", "Review room", "review"], ["scissors", "Cut", "cut"]];
    return html`<nav class="rail" aria-label="Main">
      <button class="ibtn" aria-label="Show or hide the sidebar" onClick=${() => set({ side: !S.side })}>${I("list")}</button>
      <hr/>
      ${items.map(([ic, label, sc]) => html`<button class="ibtn" title=${label} aria-label=${label} aria-current=${S.screen === sc ? "page" : "false"} onClick=${() => go(sc)}>${I(ic)}</button>`)}
      <span class="grow"></span>
      <button class="ibtn" title="Settings" aria-label="Settings" onClick=${() => toast("Settings: Computers, notifications, appearance, data.")}>${I("gear-six")}</button>
      <div style="margin-top:6px">${Mark()}</div>
    </nav>`;
  }
  function Side() {
    if (S.screen === "home" || S.screen === "upload") return html`<aside class=${"side " + (S.side ? "" : "closed")} aria-label="Sidebar">
      <div class="head"><div class="who" style="padding-left:4px">${Mark()}<b style="font-size:14px">Pine Drama</b></div></div>
      <div class="scroll">
        <div class="sec">STUDIO</div>
        <button class="navi" aria-current="page">${I("film-strip")}Dramas<span class="end">${I("caret-right")}</span></button>
        <button class="navi" disabled title="Phase 2">${I("cube")}Computers<span class="end">${I("caret-right")}</span></button>
        <div class="sec">ACCOUNT</div>
        <button class="navi" disabled title="Phase 2">${I("coins")}Usage<span class="end">${I("caret-right")}</span></button>
        <button class="navi" onClick=${() => toast("Settings: notifications, appearance, data.")}>${I("gear-six")}Settings<span class="end">${I("caret-right")}</span></button>
      </div>
      <div class="foot"><div class="who"><span class="av">Y</span><span class="grow">Your studio</span>${I("caret-right")}</div></div>
    </aside>`;
    const cur = { episodes: null, episode: "EP006", canvas: "EP006", review: "EP006", cut: "EP006" }[S.screen];
    if (SETUP.includes(S.screen)) return html`<aside class=${"side " + (S.side ? "" : "closed")} aria-label="Project">
      <div class="head"><button class="proj" onClick=${() => go("home")} title="All dramas"><span class="newthumb">${I("file-text")}</span><span class="grow"><b>${P.project.title}</b><small>Setup · 1 session</small></span>${I("caret-down", "subtle")}</button></div>
      <div class="scroll"><div class="sec">SETUP</div>${window.EXTRA.SetupSteps()}</div>
      <div class="foot" title=${SPENT_COVERS}><div style="display:flex;justify-content:space-between"><span>Spent</span><b class="mono" style="color:var(--text-primary)">$0.40 <span class="muted">/ $1,000</span></b></div><span>Nothing in flight</span><span class="muted" style="font-size:11px">${SPENT_COVERS}</span></div>
    </aside>`;
    return html`<aside class=${"side " + (S.side ? "" : "closed")} aria-label="Project">
      <div class="head"><button class="proj" onClick=${() => go("home")} title="All dramas"><img src=${P.eps[0].cover} alt=""/><span class="grow"><b>${P.project.title}</b><small>${P.project.episodes} episodes · ${P.project.spec}</small></span>${I("caret-down", "subtle")}</button></div>
      <div class="scroll">
        <button class="navi" onClick=${() => go("fountain")}>${I("file-text")}Script<span class="end">${I("check")}</span></button>
        <button class="navi" aria-current=${S.screen === "story" ? "page" : "false"} onClick=${() => go("story")}>${I("users")}Story<span class="cnt">2</span></button>
        <button class="navi" aria-current=${S.screen === "episodes" ? "page" : "false"} onClick=${() => go("episodes")}>${I("film-strip")}Episodes<span class="cnt">4</span></button>
        <ul class="tree">${P.eps.slice(0, 8).map((e) => html`<li><button aria-current=${String(cur === e.code)} onClick=${() => e.code === "EP006" ? go("episode") : go("episodes")}>
          <span class="code">${e.code}</span><span class="now">${e.now}</span><span class=${"dot " + e.status}></span></button></li>`)}
          <li style="padding:6px 8px;color:var(--text-subtle);font-size:11.5px">EP009–EP024 · 16 in line</li></ul>
        <button class="navi" aria-current=${S.screen === "cut" ? "page" : "false"} onClick=${() => go("cut")}>${I("scissors")}Cut<span class="cnt">1</span></button>
      </div>
      <div class="foot" title=${SPENT_COVERS}>
        <div style="display:flex;justify-content:space-between"><span>Spent</span><b class="mono" style="color:var(--text-primary)">${money(P.project.spent)} <span class="muted">/ $1,000</span></b></div>
        <div class="meter"><i style=${`width:${P.project.spent / 10}%`}></i><i class="fly" style=${`width:${P.project.inflight / 10}%`}></i></div>
        <span>${money(P.project.inflight)} in flight · 2 at work</span>
        <span class="muted" style="font-size:11px">${SPENT_COVERS}</span>
      </div>
    </aside>`;
  }
  function StopControl() {
    if (S.dramaStop === "stopping") return html`<button class="btn sm" disabled>${I("circle-notch")}Stopping…</button>`;
    if (S.dramaStop === "stopped") return html`<span class="stopped-chip">${I("stop")}Stopped</span><button class="btn sm" onClick=${resume}>Resume</button>`;
    return html`<button class="btn sm danger" onClick=${() => set({ dialog: { title: "Stop " + P.project.title + "?", body: "EP003 has 4 takes in flight and EP005 is blocking seg03. The takes are waited on and recorded, never sent again; then every episode stops. Nothing is lost, and you can resume.", ok: "Stop drama", danger: true, cancel: "Keep running", run: stopDrama } })}>${I("stop")}Stop drama</button>`;
  }
  function stopDrama() { set({ dramaStop: "stopping" }); setTimeout(() => { if (S.dramaStop === "stopping") { set({ dramaStop: "stopped" }); toast(P.project.title + " stopped.", { label: "Resume", run: resume }); } }, 5000); }
  function resume() { set({ dramaStop: null }); toast(P.project.title + " resumed."); }
  /* Export: the drama as other tools read it, downloaded from what the agent's stops return (handoff/lineage.json,
     handoff/infinite-canvas.zip, written by drama-cli export). Disabled, with why, until a stop has returned them. */
  function ExportMenu() {
    if (["home", "upload"].includes(S.screen)) return null;
    const none = S.state === "nostop";
    const why = "Ready after the agent's next stop returns it.";
    const item = (label, ext, hint, file) => html`<button class="mi" role="menuitem" aria-disabled=${String(none)} title=${none ? why : ""}
        onClick=${() => { if (none) return; set({ exportOpen: false }); toast("Downloaded " + file + "."); }}>
      <b>${label} <span class="mono muted">${ext}</span></b><small>${none ? why : hint}</small></button>`;
    return html`<div class="exportmenu">
      <button class="btn sm" aria-haspopup="menu" aria-expanded=${String(!!S.exportOpen)} onClick=${() => set({ exportOpen: !S.exportOpen })}>${I("download-simple")}Export${I("caret-down")}</button>
      ${S.exportOpen && html`<div class="menu" role="menu" aria-label="Export">
        ${item("ComfyUI workflow", ".json", "The project's lineage, as drama-cli exports it.", "bride-on-bail-lineage.json")}
        ${item("infinite-canvas", ".zip", "Open infinite-canvas → Import → choose this file.", "bride-on-bail-infinite-canvas.zip")}
      </div>`}
    </div>`;
  }
  function TopBar({ crumbs, right }) {
    const n = decisions().length;
    return html`<header class="top">
      <button class="ibtn" aria-label="Back" onClick=${() => go(S.screen === "review" ? "episodes" : "home")}>${I("caret-left")}</button>
      <div class="crumb">${crumbs.map((c, i) => html`${i > 0 && I("caret-right")}${i === crumbs.length - 1 ? html`<b>${c}</b>` : html`<span>${c}</span>`}`)}</div>
      <span class="grow"></span>
      ${right}
      <${ExportMenu}/>
      <${StopControl}/>
      <button class="btn primary sm" onClick=${() => go("review")} aria-label=${"Next review, " + n + " waiting"}>Next review <span class="n">${n}</span></button>
    </header>`;
  }
  function StopBanner() {
    if (["redline", "budget", "cap", "env"].includes(S.state)) return html`<${window.EXTRA.StopCard} kind=${S.state}/>`;
    if (!S.dramaStop) return null;
    return S.dramaStop === "stopping"
      ? html`<div class="banner" role="status">${I("circle-notch")}<b>Stopping — keep the app open</b><span>Waiting on EP003's 4 takes in flight. They are recorded when they come back, never shot again.</span></div>`
      : html`<div class="banner done"><b>${P.project.title} is stopped</b><span class="grow">Nothing runs and nothing is spent until you resume.</span><button class="btn sm primary" onClick=${resume}>Resume</button></div>`;
  }
  function SurfaceSwitch() {
    const cur = S.screen === "canvas" ? "Canvas" : S.screen === "graph" ? "Graph" : "Studio";
    return html`<div class="seg" role="group" aria-label="Surface">
      ${[["Studio", "squares-four", "episodes"], ["Canvas", "flow-arrow", "canvas"], ["Graph", "tree-structure", "graph"]].map(([l, ic, sc]) =>
        html`<button aria-pressed=${String(cur === l)} onClick=${() => go(cur === "Studio" && l === "Studio" ? S.screen : sc)}>${I(ic)}${l}</button>`)}
    </div>`;
  }
  function ProjectChips() {
    return html`<span class="chip" title="The preset this drama is made with. Chosen at upload.">${html`<img class="thumb" src=${P.cast[0].face} alt=""/>`}${P.project.preset}</span>
      <span class="chip plain">${I("frame-corners")}${P.project.spec}</span>
      <span class="chip plain" title=${SPENT_COVERS}>${I("coins")}<span class="mono">${money(P.project.spent)}</span><span class="muted">of $1,000</span></span>`;
  }

  /* ───── agent panel ───── */
  function AgentPanel({ float }) {
    const dec = decisions();
    const runRow = (code, what) => html`<div class="arow"><div class="what"><b>${code}</b><span>${S.dramaStop === "stopped" ? "Stopped with the drama" : S.dramaStop ? (code === "EP003" ? "Stopping… waiting on 4 takes in flight" : "Stopping…") : what}</span></div>
      ${!S.dramaStop && html`<button class="btn sm ghost" onClick=${() => toast("Watch opens the Computer's desktop, view-only.")}>Watch</button>
      <button class="btn sm ghost" onClick=${() => set({ dialog: { title: "Stop " + code + "?", body: code === "EP003" ? "4 takes are in flight. They are waited on and recorded, never sent again. The episode stops after them." : "Nothing paid is in flight. The episode stops now and can be resumed.", ok: "Stop " + code, danger: true, cancel: "Keep running", run: () => toast(code + " stopped.") } })}>Stop</button>`}</div>`;
    return html`<aside class=${"agent " + (float ? "float" : "")} aria-label="Agent panel">
      <div class="ahead"><span class="live"></span><h2>Agent</h2><span class="grow"></span>
        ${float ? html`<button class="ibtn" aria-label="Close the agent panel" onClick=${() => set({ agentOpen: false })}>${I("x")}</button>` : html`<button class="ibtn" aria-label="Collapse" onClick=${() => toast("The panel collapses to the agent ball, as on Canvas.")}>${I("arrows-in")}</button>`}</div>
      <div class="ascroll">
        <section class="asec"><h3>Running <span class="c">2</span></h3>${runRow("EP003", "Shooting 4 takes · 2 back")}${runRow("EP005", "Blocking seg03")}</section>
        <section class="asec"><h3>Decisions <span class="c">${dec.length}</span></h3>
          ${dec.map((d) => html`<button class="dec" onClick=${() => go(d.go)}><img src=${d.pic} alt=""/><span><b>${d.t}</b><small>${d.d}</small></span><span class="age">${d.age}</span></button>`)}</section>
        <section class="asec"><div class="process"><button onClick=${() => {}}>${I("list-checks")}EP006 · Process<span class="cnt">7 steps</span></button>
          <ol class="steps">
            <li>${I("check-circle")}<span>Status <code>drama-cli status</code></span><time>0:02</time></li>
            <li>${I("check-circle")}<span>seg01 shot again: blanket folded first</span><time>2:40</time></li>
            <li>${I("check-circle")}<span>seg03 shot again: opens on Luca</span><time>2:12</time></li>
            <li>${I("check-circle")}<span>Downloaded both takes</span><time>0:18</time></li>
            <li class="now">${I("circle-notch")}<span>Waiting for your review</span><time></time></li></ol></div></section>
        <section class="asec"><p class="msg">I shot seg01 again with the blanket folded before Luca speaks, and seg03 again opening on his face, as you asked. Both new takes wait for you.</p></section>
        <section class="asec"><h3>Recent work</h3>
          <div class="arow"><div class="what"><b>EP006 seg03 take t02</b><span>waits for you</span></div></div>
          <div class="arow"><div class="what"><b>Margaret Cole base look v3</b><span>waits for you</span></div></div></section>
        ${S.chat.map((m) => html`<section class="asec"><p class="msg you">${m}</p></section>`)}
        <section class="asec"><h3>Next</h3><div class="nextchips"><button onClick=${() => go("review")}>Review EP006 takes</button><button onClick=${() => go("canvas")}>Review looks and plates</button></div></section>
      </div>
      <div class="composer"><textarea placeholder="Message the agent…" value=${S.draft} onInput=${(e) => set({ draft: e.target.value })}
          onKeyDown=${(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && S.draft.trim()) { set({ chat: [...S.chat, S.draft.trim()], draft: "" }); toast("Sent to EP006's session."); } }}></textarea>
        <div class="crow"><span>To EP006's session · steers its current turn</span><button class="send" aria-label="Send" disabled=${!S.draft.trim()} onClick=${() => { set({ chat: [...S.chat, S.draft.trim()], draft: "" }); toast("Sent to EP006's session."); }}>${I("arrow-up")}</button></div></div>
    </aside>`;
  }

  /* ───── Home ───── */
  function Home() {
    const tabs = [["all", "All", 4], ["you", "Needs you", 1], ["work", "At work", 1], ["done", "Finished", 1]];
    const list = P.projects.filter((p) => S.tab === "all" || (S.tab === "you" ? p.st === "you" || p.st === "redline" : S.tab === "work" ? p.st === "work" : p.st === "accepted"));
    const upload = () => go("upload");
    return html`<div class="main"><div class="scrollmain"><div class="wrap">
      <div class="greet"><div class="grow"><h1>Good evening</h1><p>4 decisions wait for you across your dramas.</p></div>
        <button class="btn lg primary" onClick=${upload}>${I("upload")}Upload script</button></div>
      <section class="hero">
        <div class="left">
          <div class="cover"><img src=${P.eps[0].cover} alt=""/>${Status("you", "4 need you")}</div>
          <div class="info grow"><span class="kicker">Continue</span><h2>${P.project.title}</h2>
            <span class="where">${I("map-pin")}EP006 · 2 takes wait for you</span>
            <blockquote>“I shot seg01 again with the blanket folded before Luca speaks, and seg03 again opening on his face. Both new takes wait for you.”</blockquote>
            <div class="row"><span>1 of 24 cut · ${money(P.project.spent)} spent · updated 4 min ago</span><span class="grow"></span>
              <button class="btn" onClick=${() => go("episodes")}>Open drama</button>
              <button class="btn lg primary" onClick=${() => go("review")}>${I("play")}Review takes</button></div></div>
        </div>
        <div class="right"><h3>Waiting for you</h3>
          ${decisions().map((d) => html`<button class="wait" onClick=${() => go(d.go)}><img src=${d.pic} alt=""/><span><b>${d.t}</b><small>${d.d} · ${d.age}</small></span></button>`)}</div>
      </section>
      <div class="tabsrow"><div class="utabs" role="tablist">${tabs.map(([k, l, n]) => html`<button role="tab" aria-selected=${String(S.tab === k)} onClick=${() => set({ tab: k })}>${l}<small>${n}</small></button>`)}</div>
        <span class="grow"></span><span class="search">${I("magnifying-glass")}Search dramas…</span><button class="select">Last edited ${I("caret-down")}</button></div>
      <div class="cards">
        ${list.map((p, i) => html`<button class="pcard" onClick=${() => i === 0 || p.t === P.project.title ? go("episodes") : toast(p.t + ": only the first drama opens in this direction.")}>
          <div class="pic"><img src=${p.cover} alt=""/>${Status(p.st, p.lab)}<span class="bar"><i style=${`width:${p.p}%`}></i></span></div>
          <div class="txt"><b>${p.t}</b><small>${p.m}</small><small>${p.spent} spent</small><div class="tags">${p.tags.map((t) => html`<span class="tag">${t}</span>`)}</div></div></button>`)}
        <button class=${"newcard " + (S.over ? "over" : "")} onClick=${upload}
          onDragOver=${(e) => { e.preventDefault(); if (!S.over) set({ over: true }); }} onDragLeave=${() => set({ over: false })} onDrop=${(e) => { e.preventDefault(); set({ over: false }); upload(); }}>
          <span class="plus">${I("plus")}</span><b>New drama</b><small>Drop a screenplay here<br/>Fountain, Word, PDF or plain text</small></button>
      </div>
    </div></div></div>`;
  }

  /* ───── Episodes board ───── */
  function Episodes() {
    const f = [["all", "All", 24], ["you", "Needs you", 3], ["work", "At work", 2], ["line", "In line", 18], ["done", "Done", 0]];
    const list = P.eps.filter((e) => S.filter === "all" || e.status === S.filter);
    const open = (e) => e.code === "EP006" ? go("episode") : toast(e.code + ": only EP006 opens in this direction.");
    return html`<div class="main">
      <${TopBar} crumbs=${[P.project.title, "Episodes"]}/>
      <div class="body"><div class="scrollmain">
        <div class="bar2"><${SurfaceSwitch}/><span class="grow"></span><${ProjectChips}/></div>
        <${StopBanner}/>
        <div class="filters">${f.map(([k, l, n]) => html`<button class="fchip" aria-pressed=${String(S.filter === k)} onClick=${() => set({ filter: k })}>${l}<small>${n}</small></button>`)}
          <span class="grow"></span><span class="search" style="width:200px">${I("magnifying-glass")}Find an episode…</span><button class="select">Episode order ${I("caret-down")}</button></div>
        <div class="epgrid">${list.map((e) => html`<button class="epcard" onClick=${() => open(e)}>
          <div class="pic">${e.cover ? html`<img src=${e.cover} alt="" loading="lazy"/>` : html`<span class="empty">${e.n < 9 ? "Breakdown done" : "Not started"}</span>`}
            <span class="code">${e.code}</span>${e.status !== "line" && Status(e.status === "you" ? "you" : "work", e.status === "you" ? "Needs you" : "At work")}
            <span class="strip">${e.strip.map((s) => html`<i class=${s}></i>`)}</span></div>
          <b>${e.title}</b><small><span>${e.now}</span><span class="mono">${e.spent ? money(e.spent) : ""}</span></small></button>`)}</div>
      </div><${AgentPanel}/></div></div>`;
  }

  /* ───── Canvas ───── */
  const NODES = (() => {
    const n = [];
    P.cast.slice(0, 5).forEach((c, i) => n.push({ id: c.id, kind: "cast", x: 0, y: i * 196, w: 300, h: 168, pic: c.sheet, label: c.name, st: c.st, ver: c.ver, role: c.role, model: "gpt-image-2.5" }));
    P.places.slice(0, 2).forEach((p, i) => n.push({ id: p.id, kind: "place", x: 400, y: i * 380, w: 190, h: 338, pic: p.pic, label: p.name, st: p.st, ver: p.ver, model: "gpt-image-2.5", role: "Plate · " + p.times.map(([t]) => t).join(" · ") }));
    n.push({ id: "file", kind: "prop", x: 400, y: 770, w: 190, h: 200, pic: P.props[0].pic, label: "Case file", st: "accepted", ver: "v1", role: "Key prop", model: "gpt-image-2.5" });
    let gy = 0;
    P.scenes.forEach((sc, gi) => {
      const g = { id: "g" + sc.n, kind: "group", x: 700, y: gy, w: 360, h: 64 + sc.segs.length * 236, label: `Scene ${sc.n} · Luca's apartment · ${sc.time}` };
      n.push(g);
      sc.segs.forEach((s, i) => n.push({ id: s.id, kind: "seg", x: 730, y: gy + 64 + i * 236, w: 300, h: 196, seg: s, label: `EP006 ${s.id}`, st: s.st, ver: s.take, model: "sd25", role: s.s + " s · " + s.cast.length + " in frame" }));
      gy += g.h + 40;
    });
    return n;
  })();
  const EDGES = (() => {
    const e = [];
    P.scenes.forEach((sc) => sc.segs.forEach((s) => { s.cast.forEach((c) => e.push([c, s.id])); e.push(["apartment", s.id]); if (s.id === "seg03") e.push(["file", s.id]); }));
    return e;
  })();
  /* The picked node's panel, directly under it, as infinite-canvas's prompt panel and astorie's node panel stand (glass): the prompt
     with each Image N as a chip of that picture and the pictures it names, the versions with what the person decided, request.json,
     and what the node is; a pill row of drama-cli's settings; the hand controls disabled until phase 2. Read-only. */
  function NodePanel({ node, style, uses, reads }) {
    const spec = node.seg && node.seg.spec;
    const tab = S.dtab || "prompt";
    const tabs = [["prompt", "Prompt"], ...(spec ? [["versions", "Versions"], ["request", "Request"]] : []), ["details", "Details"]];
    const chips = (line) => line.split(/(Image \d+)/).map((part) => { const m = part.match(/^Image (\d+)$/); return m ? html`<span class="pchip"><img src=${spec.images[m[1] - 1]} alt=""/>${part}</span>` : part; });
    // Under the node by default, the industry's convention; docked right on asking. The viewer's choice is kept in this browser.
    const docked = S.dock === "right";
    const dock = (to) => { set({ dock: to }); try { localStorage.setItem("studio.canvas.dock", to); } catch (e) { /* a convenience */ } };
    return html`<div class=${"npanel" + (docked ? " docked" : "")} role="dialog" aria-label=${node.label} style=${docked ? "" : style}>
      <div class="nhead"><b class="grow">${node.label}</b>${Status(node.st)}
        <button class="ibtn" title=${docked ? "Under the node" : "Dock right"} aria-label=${docked ? "Under the node" : "Dock right"} onClick=${() => dock(docked ? "under" : "right")}>${I(docked ? "square-half-bottom" : "square-half")}</button>
        <button class="ibtn" aria-label="Close" onClick=${() => set({ sel: null })}>${I("x")}</button></div>
      <div class="utabs" role="tablist">${tabs.map(([k, l]) => html`<button role="tab" aria-selected=${String(tab === k)} onClick=${() => set({ dtab: k })}>${l}</button>`)}</div>
      <div role="tabpanel">
        ${tab === "prompt" && (spec ? html`<div class="prompt">${spec.prompt.split("\n").map((line) => html`<p>${chips(line)}</p>`)}</div>
          <ol class="refs">${spec.images.map((u, i) => html`<li><img src=${u} alt=""/><span>Image ${i + 1}</span></li>`)}</ol>` : html`<p class="subtle">The agent hasn't returned this version's spec.json and request.json.</p>`)}
        ${tab === "versions" && html`<ol class="versions">${spec.versions.map(([v, st, said]) => html`<li><b class="mono">${v}</b>${Status(st)}${said && html`<span class="subtle">${said}</span>`}</li>`)}</ol>`}
        ${tab === "request" && html`<pre class="mono">${JSON.stringify({ model: spec.model, content: [{ type: "text", text: spec.prompt.slice(0, 60) + "…" }, ...spec.images.map((u) => ({ type: "image_url", image_url: { url: "@" + u }, role: "reference_image" }))], duration: spec.seconds, ratio: spec.ratio, resolution: spec.resolution }, null, 2)}</pre>`}
        ${tab === "details" && html`<dl><dt>Kind</dt><dd>${node.role}</dd><dt>Version</dt><dd class="mono">${node.ver}</dd><dt>Used by</dt><dd>${uses || "—"}</dd><dt>Reads</dt><dd>${reads || "—"}</dd></dl>`}
      </div>
      <div class="nfoot">
        ${spec && [spec.model, spec.ratio, spec.resolution, spec.seconds + " s"].map((v) => html`<span class="pill mono">${v}</span>`)}
        <span class="grow"></span>
        <button class="btn sm" disabled title="Phase 2: the agent makes every item for now">${I("upload")}Upload</button>
        <button class="btn sm" disabled title="Phase 2: the agent makes every item for now">${I("sparkle")}Generate</button>
      </div>
    </div>`;
  }

  function Canvas() {
    const ref = useRef(null);
    const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
    const { x, y, k } = S.cam;
    useEffect(() => {
      if (!S.follow) return;
      const order = ["seg01", "seg03", "seg04", "seg02"]; let i = 0;
      const t = setInterval(() => { if (!S.follow || S.screen !== "canvas") return; const n = byId[order[i++ % order.length]]; const el = ref.current; if (!el) return;
        const kk = 0.62; set({ cam: { k: kk, x: el.clientWidth / 2 - (n.x + n.w / 2) * kk, y: el.clientHeight / 2 - (n.y + n.h / 2) * kk }, sel: n.id }); }, 6000);
      return () => clearInterval(t);
    }, [S.follow]);
    const down = (e) => { if (e.target.closest(".card, button")) return; set({ panning: { sx: e.clientX, sy: e.clientY, x, y }, follow: false }); };
    const move = (e) => { const p = S.panning; if (p) set({ cam: { ...S.cam, x: p.x + e.clientX - p.sx, y: p.y + e.clientY - p.sy } }); };
    const up = () => S.panning && set({ panning: null });
    const wheel = (e) => { e.preventDefault(); const r = ref.current.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
      const nk = Math.min(1.6, Math.max(0.25, k * (e.deltaY < 0 ? 1.1 : 0.9))); set({ follow: false, cam: { k: nk, x: mx - (mx - x) * (nk / k), y: my - (my - y) * (nk / k) } }); };
    const zoom = (f) => set({ follow: false, cam: { ...S.cam, k: Math.min(1.6, Math.max(0.25, k * f)) } });
    const fit = () => set({ follow: false, cam: { x: 40, y: 96, k: 0.62 } });
    const wire = ([a, b]) => { const A = byId[a], B = byId[b]; const x1 = A.x + A.w, y1 = A.y + A.h / 2, x2 = B.x, y2 = B.y + B.h / 2; const m = (x1 + x2) / 2;
      return html`<path class=${S.sel === a || S.sel === b ? "hot" : ""} d=${`M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`}/>`; };
    const sel = S.sel && byId[S.sel];
    return html`<div class="main">
      <${TopBar} crumbs=${[P.project.title, "EP006", "Canvas"]}/>
      <div class="body" style="position:relative">
        <div class=${"board " + (S.panning ? "panning" : "")} style=${`--grid:${48 * k}px;--gx:${x % (48 * k)}px;--gy:${y % (48 * k)}px;--dot:${k < 0.12 ? 0.8 : 1.15}px`} ref=${ref} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerLeave=${up} onWheel=${wheel}>
          <div class="layer" style=${`transform:translate(${x}px,${y}px) scale(${k})`}>
            <svg class="wires" width="1" height="1">${EDGES.map(wire)}</svg>
            ${NODES.filter((n) => n.kind === "group").map((g) => html`<div class="group" style=${`left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px`}><span class="gl">${g.label}</span></div>`)}
            ${NODES.filter((n) => n.kind !== "group" && n.kind !== "seg").map((n) => html`<div class=${"cnode " + (S.sel === n.id ? "sel" : "")} style=${`left:${n.x}px;top:${n.y - 26}px;width:${n.w}px`}>
              <div class="lab">${I(n.kind === "cast" ? "user" : n.kind === "place" ? "image" : "cube")}<span class="name">${n.label}</span><span class="model">${n.model}</span>${n.st !== "accepted" && Status(n.st)}</div>
              <div class="card" style=${`height:${n.h}px`} onClick=${() => set({ sel: n.id, follow: false })}><img src=${n.pic} alt="" draggable="false"/></div></div>`)}
            ${NODES.filter((n) => n.kind === "seg").map((n) => html`<div class=${"segnode cnode " + (S.sel === n.id ? "sel" : "")} style=${`left:${n.x}px;top:${n.y - 26}px`}>
              <div class="lab">${I("film-strip")}<span class="name">${n.label}</span><span class="subtle" style="font-weight:500">${n.seg.s} s</span><span class="model">${n.model}</span>${n.st !== "accepted" && Status(n.st)}</div>
              <div class="card" onClick=${() => set({ sel: n.id, follow: false })}>
                ${n.seg.board ? html`<div class="board-img"><img src=${n.seg.board} alt="" draggable="false"/><span>board v1</span></div>` : html`<div class="none">board accepted</div>`}
                ${n.seg.still ? html`<div><img src=${n.seg.still} alt="" draggable="false"/><span>${n.seg.take}</span><span class="play"><i>${I("play")}</i></span></div>` : html`<div class="none">${n.seg.take} accepted</div>`}</div></div>`)}
          </div>
        </div>
        <div class="ctop"><${SurfaceSwitch}/><button class="follow" aria-pressed=${String(S.follow)} onClick=${() => set({ follow: !S.follow })}>${S.follow && html`<span class="live"></span>`}${S.follow ? "Following the agent" : "Follow the agent"}</button>
          <span class="grow"></span><${ProjectChips}/></div>
        ${S.dramaStop && html`<div style="position:absolute;left:0;right:0;top:60px"><${StopBanner}/></div>`}
        ${sel && (() => {
          // Above the node its action bar; under it its panel, 560 px wide, kept inside the board.
          const W = 560, bw = ref.current ? ref.current.clientWidth : 1100, bh = ref.current ? ref.current.clientHeight : 800;
          const cx = x + (sel.x + (sel.w || 300) / 2) * k, top = y + (sel.y - 26) * k, bottom = y + (sel.y + (sel.h || 196)) * k;
          const left = Math.max(12, Math.min(bw - W - 12, cx - W / 2));
          const uses = EDGES.filter((e) => e[0] === sel.id).map((e) => e[1]).join(", "), reads = EDGES.filter((e) => e[1] === sel.id).map((e) => byId[e[0]].label).join(", ");
          return html`<div class="nbar" role="toolbar" aria-label=${"Act on " + sel.label} style=${`left:${Math.max(12, cx - 150)}px;top:${Math.max(64, top - 46)}px`}>
              ${sel.st === "you" ? html`<button class="btn sm primary" onClick=${() => sel.kind === "seg" ? go("review") : toast("Opens the looks review.")}>Review</button>` : null}
              <button class="ibtn" title="Send back" aria-label="Send back" onClick=${() => toast("Send back: say why, and the agent redoes it.")}>${I("arrow-counter-clockwise")}</button>
              <button class="ibtn" title="Note" aria-label="Note" onClick=${() => toast("A note for the agent at work on it.")}>${I("note-pencil")}</button>
              <button class="ibtn" title="Lineage" aria-label="Lineage" onClick=${() => toast("Lineage: where this version comes from and what is made from it.")}>${I("tree-structure")}</button>
              <button class="ibtn" title="Download" aria-label="Download" onClick=${() => toast("Downloads the picture.")}>${I("download-simple")}</button></div>
            <${NodePanel} node=${sel} uses=${uses} reads=${reads} style=${`left:${left}px;top:${Math.min(bottom + 10, bh - 300)}px;width:${W}px`}/>`;
        })()}
        ${S.minimap && html`<div class="minimap" aria-hidden="true">${NODES.filter((n) => n.kind !== "group").map((n) => html`<i style=${`left:${8 + n.x * 0.11}px;top:${8 + n.y * 0.08}px;width:${n.w * 0.11}px;height:${n.h * 0.08}px`}></i>`)}
          <b style=${`left:${8 - x * 0.11 / k}px;top:${8 - y * 0.08 / k}px;width:${(ref.current ? ref.current.clientWidth : 900) * 0.11 / k}px;height:${(ref.current ? ref.current.clientHeight : 600) * 0.08 / k}px`}></b></div>`}
        <div class="ctool" role="toolbar" aria-label="Canvas">
          <button class="ibtn" title="Fit to screen" aria-label="Fit to screen" onClick=${fit}>${I("frame-corners")}</button>
          <button class="ibtn" title="Zoom out" aria-label="Zoom out" onClick=${() => zoom(0.85)}>${I("minus")}</button>
          <span class="z">${Math.round(k * 100)}%</span>
          <button class="ibtn" title="Zoom in" aria-label="Zoom in" onClick=${() => zoom(1.15)}>${I("plus")}</button>
          <button class=${"ibtn " + (S.minimap ? "on" : "")} title="Minimap" aria-label="Minimap" onClick=${() => set({ minimap: !S.minimap })}>${I("map-pin")}</button>
          <button class="ibtn" title="Lay out again" aria-label="Lay out again" onClick=${() => { set({ cam: { x: 40, y: 96, k: 0.62 } }); toast("Every node back where drama-cli's layout puts it."); }}>${I("tree-structure")}</button></div>
        ${S.agentOpen && html`<${AgentPanel} float/>`}
        <button class="ball busy" aria-label="Agent, 4 decisions wait" onClick=${() => set({ agentOpen: !S.agentOpen })}>${I("robot")}<span class="badge">4</span></button>
      </div></div>`;
  }

  /* ───── Review room ───── */
  function Review() {
    const vref = useRef(null);
    const tk = P.takes[S.ti], v = S.verdict[tk.id], watched = S.watched[tk.id], prev = S.showPrev;
    const src = prev ? tk.prev.clip : tk.clip, dur = tk.dur;
    useEffect(() => { const el = vref.current; if (!el) return; if (S.playing) el.play().catch(() => set({ playing: false })); else el.pause(); });
    useEffect(() => { set({ t: 0, playing: false }); }, [S.ti, S.showPrev]);
    const onTime = (e) => { const t = e.target.currentTime; const m = Math.max(S.maxT[tk.id] || 0, prev ? 0 : t);
      set({ t, maxT: { ...S.maxT, [tk.id]: m }, watched: !prev && t >= dur - 0.25 ? { ...S.watched, [tk.id]: true } : S.watched }); };
    const seek = (e) => { const r = e.currentTarget.getBoundingClientRect(); const t = Math.max(0, Math.min(dur, ((e.clientX - r.left) / r.width) * dur)); if (vref.current) vref.current.currentTime = t; set({ t }); };
    const setV = (val) => set({ verdict: { ...S.verdict, [tk.id]: S.verdict[tk.id] === val ? undefined : val } });
    useEffect(() => {
      const kd = (e) => { if (/textarea|input/i.test(e.target.tagName) || S.screen !== "review") return;
        if (e.key === " ") { e.preventDefault(); set({ playing: !S.playing }); }
        else if (e.key === "a" && S.watched[P.takes[S.ti].id]) setV("accept");
        else if (e.key === "b") setV("back"); else if (e.key === "n") setV("note");
        else if (e.key === "ArrowDown") set({ ti: Math.min(P.takes.length - 1, S.ti + 1), showPrev: false });
        else if (e.key === "ArrowUp") set({ ti: Math.max(0, S.ti - 1), showPrev: false }); };
      window.addEventListener("keydown", kd); return () => window.removeEventListener("keydown", kd);
    }, []);
    const done = P.takes.filter((t) => S.verdict[t.id] && (S.verdict[t.id] !== "back" || (S.reason[t.id] || "").trim())).length;
    const pct = (S.t / dur) * 100, seen = ((S.maxT[tk.id] || 0) / dur) * 100;
    const needsWords = v === "back" || v === "note";
    return html`<div class="main">
      <${TopBar} crumbs=${[P.project.title, "EP006", "Takes"]} right=${html`<span class="muted hide-s" style="font-size:12px">${P.takes.length - done} of ${P.takes.length} waiting</span>`}/>
      <${StopBanner}/>
      <div class="room">
        <nav class="reel" aria-label="Takes waiting">
          <h3>EP006 · waiting for you</h3>
          ${P.takes.map((t, i) => html`<button class="ritem" aria-current=${String(i === S.ti)} onClick=${() => set({ ti: i, showPrev: false })}>
            <img src=${t.poster} alt=""/><span><b>${t.seg} · ${t.take}</b><small>${t.scene.split(" · ").slice(0, 1)} · ${t.dur} s</small>
            ${S.verdict[t.id] ? Status(S.verdict[t.id] === "accept" ? "accepted" : S.verdict[t.id] === "back" ? "back" : "accepted", S.verdict[t.id] === "accept" ? "Accept" : S.verdict[t.id] === "back" ? "Send back" : "Note") : S.watched[t.id] ? Status("you", "Watched") : Status("you", "Not watched")}</span></button>`)}
          <h3 style="margin-top:14px">Accepted in EP006</h3>
          <button class="ritem" onClick=${() => toast("seg02 t01 was accepted earlier. Accepted takes open read-only.")}><img src=${"img/cover-ep6.jpg"} alt=""/><span><b>seg02 · t01</b><small>Scene 1 · 15 s</small>${Status("accepted")}</span></button>
        </nav>
        <section class="stage" aria-label="Stage">
          <div class="screen">
            <div class="player">
              <video ref=${vref} src=${src} poster=${prev ? tk.prev.poster : tk.poster} muted playsinline preload="metadata" onTimeUpdate=${onTime} onEnded=${() => set({ playing: false })}></video>
              <span class="tag2">${tk.seg} · ${prev ? tk.prev.take + " · earlier" : tk.take}</span>
              ${!S.playing && html`<button class="bigplay" aria-label="Play" onClick=${() => set({ playing: true })}><i>${I("play")}</i></button>`}
            </div>
          </div>
          <div class="controls">
            <button class="pp" aria-label=${S.playing ? "Pause" : "Play"} onClick=${() => set({ playing: !S.playing })}>${I(S.playing ? "pause" : "play")}</button>
            <span class="t">${S.t.toFixed(1)}s <small>/ ${dur.toFixed(1)}s</small></span>
            <div class="track" onClick=${seek} role="slider" aria-label="Playhead" aria-valuemin="0" aria-valuemax=${dur} aria-valuenow=${S.t.toFixed(1)}>
              <span class="rail2"></span>${!prev && html`<span class="seen" style=${`width:${seen}%`}></span>`}<span class="pos" style=${`width:${pct}%`}></span><span class="knob" style=${`left:${pct}%`}></span></div>
            <div class="seg" role="group" aria-label="Which take"><button aria-pressed=${String(!prev)} onClick=${() => set({ showPrev: false })}>${tk.take} · new</button><button aria-pressed=${String(prev)} onClick=${() => set({ showPrev: true })}>${tk.prev.take} · earlier</button></div>
            <span class="muted" style="font-size:11.5px">Muted in this prototype</span>
          </div>
        </section>
        <aside class="insp" aria-label="Inspector">
          <div class="ihead"><b>EP006 ${tk.seg} · take ${tk.take}</b><small>${tk.scene}</small></div>
          <div class="iscroll">
            <div class="isec"><h4>What you asked last time</h4><div class="asked">“${tk.prev.said}”</div>
              <button class="prevtake" onClick=${() => set({ showPrev: !prev })}><img src=${tk.prev.poster} alt=""/><span><b class="mono" style="font-size:12px">${tk.prev.take} · sent back by you</b><small class="muted" style="display:block;font-size:11.5px">${prev ? "Showing it on the stage" : "Play it on the stage to compare"}</small></span></button></div>
            <div class="isec"><h4>Take</h4><dl class="kv"><dt>Length</dt><dd>${tk.dur} s planned · ${tk.dur} s shot</dd><dt>Spec</dt><dd>${P.project.spec}</dd><dt>In frame</dt><dd>${tk.seg === "seg01" ? "Luca Moreno" : "Luca Moreno, Ethan Cole"}</dd><dt>Episode so far</dt><dd title=${SPENT_COVERS}>${money(P.eps[5].spent)} spent</dd></dl></div>
            <div class="isec"><h4>Shots</h4><ol class="shots">${tk.shots.map((s, i) => html`<li><span>${String(i + 1).padStart(2, "0")}</span>${s}</li>`)}</ol></div>
            <div class="isec" style="border-bottom:0"><h4>Who decides</h4><p class="muted" style="margin:0;font-size:12.5px;line-height:1.55">You watch every take and decide. No model checks a take for you. Accept unlocks once you have watched it to the end.</p></div>
          </div>
          <div class="verdict">
            <div class="vrow">
              <button class="vbtn acc" aria-pressed=${String(v === "accept")} disabled=${!watched} title=${watched ? "Accept (A)" : "Watch the take to the end first"} onClick=${() => setV("accept")}>${I("check")}Accept</button>
              <button class="vbtn back" aria-pressed=${String(v === "back")} onClick=${() => setV("back")}>${I("arrow-counter-clockwise")}Send back</button>
              <button class="vbtn note" aria-pressed=${String(v === "note")} disabled=${!watched} onClick=${() => setV("note")}>${I("note-pencil")}Note</button></div>
            ${needsWords && html`<textarea placeholder=${v === "back" ? "Why it goes back (required). The agent shoots again with your words." : "Your note, kept with the accepted take."} value=${S.reason[tk.id] || ""} onInput=${(e) => set({ reason: { ...S.reason, [tk.id]: e.target.value } })}></textarea>`}
            <span class="hint">${I(watched ? "check-circle" : "clock")}${watched ? "Watched to the end." : `Watched ${Math.round(seen)}% · Accept unlocks at the end.`}${v === "back" && " Sending back may shoot a new take."}</span>
            <span class="hint subtle">Keys: Space play · A accept · B send back · N note · ↑↓ next take</span>
          </div>
          <div style="padding:10px 16px 0;border-top:1px solid var(--border);background:var(--surface-dim)"><input class="search" style="width:100%;height:32px" placeholder="Your words for the record, e.g. Approved. seg03 opens on Luca." value=${S.words || ""} onInput=${(e) => set({ words: e.target.value })}/></div>
          <div class="sendbar"><span class="pips">${P.takes.map((t) => html`<i class=${S.verdict[t.id] === "accept" ? "a" : S.verdict[t.id] === "back" ? "b" : S.verdict[t.id] === "note" ? "n" : ""}></i>`)}</span>
            <span class="muted grow" style="font-size:12px">${done} of ${P.takes.length} decided</span>
            <button class="btn primary sm" disabled=${done < P.takes.length || S.sent} onClick=${() => set({ dialog: { title: "Send your review?", body: P.takes.map((t) => `${t.seg} ${t.take}: ${S.verdict[t.id] === "accept" ? "Accept" : S.verdict[t.id] === "note" ? "Accept with a note" : "Send back — “" + (S.reason[t.id] || "").trim() + "”"}`).join("\n"), ok: "Send review", cancel: "Keep reviewing", run: () => { set({ sent: true }); toast("Review sent to EP006's agent."); } } })}>Send review</button></div>
        </aside>
      </div></div>`;
  }

  /* ───── frame ───── */
  function Dialog() {
    const d = S.dialog; if (!d) return null;
    return html`<div class="scrim" onClick=${(e) => { if (e.target === e.currentTarget) set({ dialog: null }); }}>
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><h2 id="dlg-t">${d.title}</h2>
        ${d.upload && html`<div class="drop">${I("upload")}<b>Drop a screenplay</b><span>Fountain, Word, PDF or plain text · or click to choose</span></div>
          <p>The agent rewrites it into Fountain and checks it. You review what changed before anything is spent.</p>`}
        ${d.body && html`<p style="white-space:pre-line">${d.body}</p>`}
        <div class="acts"><button class="btn" onClick=${() => set({ dialog: null })}>${d.cancel || "Cancel"}</button>
          <button class=${"btn " + (d.danger ? "danger" : "primary")} onClick=${() => { set({ dialog: null }); d.run && d.run(); }}>${d.ok}</button></div></div></div>`;
  }
  function Proto() {
    return html`<div class="proto" role="navigation" aria-label="Prototype">
      <b>Pine Drama Studio · pro direction</b><span class="sep"></span>
      <div class="seg" role="group" aria-label="Screen">${[["home", "Home"], ["upload", "Upload"], ["analyzing", "Analyzing"], ["fountain", "Fountain"], ["story", "Story"], ["episodes", "Episodes"], ["episode", "Episode"], ["canvas", "Canvas"], ["graph", "Graph"], ["review", "Review"], ["cut", "Cut"]].map(([k, l]) => html`<button aria-pressed=${String(S.screen === k)} onClick=${() => go(k)}>${l}</button>`)}</div>
      <span class="sep"></span>
      <label class="select" style="gap:8px">State<select aria-label="State" value=${S.state} onChange=${(e) => { const v = e.target.value; set({ state: v, dramaStop: v === "stopping" ? "stopping" : v === "stopped" ? "stopped" : null }); }}>
        ${[["normal", "Normal"], ["nostop", "No stop yet"], ["stopping", "Stopping"], ["stopped", "Stopped"], ["redline", "Red line"], ["budget", "Budget spent"], ["cap", "Cap reached"], ["env", "Credentials refused"]].map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></label>
      <span class="sep"></span>
      <div class="seg" role="group" aria-label="Theme">${[["dark", "Dark", "moon-stars"], ["light", "Light", "sun-dim"]].map(([k, l, ic]) => html`<button aria-pressed=${String(S.theme === k)} onClick=${() => set({ theme: k })}>${I(ic)}${l}</button>`)}</div>
      <span class="sep"></span><span>Steering only · Canvas and Graph read-only · sample project, our own test pictures</span>
    </div>`;
  }
  function App() {
    applyTheme();
    const sc = S.screen;
    const main = { home: html`<${Home}/>`, episodes: html`<${Episodes}/>`, canvas: html`<${Canvas}/>`, review: html`<${Review}/>` }[sc] || html`<${window.EXTRA[sc]}/>`;
    return html`<${Proto}/><div class="app"><${Rail}/><${Side}/>${main}</div><${Dialog}/>
      <div class="toasts" aria-live="polite">${S.toasts.map((t) => html`<div class="toast">${t.text}${t.action && html`<button onClick=${t.action.run}>${t.action.label}</button>`}</div>`)}</div>`;
  }
  window.PD = { html, I, S, set, go, toast, money, Status, TopBar, StopBanner, SurfaceSwitch, ProjectChips, AgentPanel, SPENT_COVERS, useEffect, useRef, Mark, decisions, draw };
  // screens.js draws first, once its screens are registered.
})();
