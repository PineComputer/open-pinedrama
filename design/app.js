/* Pine Drama Studio, pro direction: Home, Episodes board, Canvas and the take Review room.
   Phase 1 is steering only: Accept, Send back with a reason, Note, Stop and messages to the agent. Canvas is read-only. */
(() => {
  const { html, render, useEffect, useRef } = window.htmPreact;
  const root = document.getElementById("root");
  const SPENT_COVERS = "Agent turns and video, priced when each turn ends.";
  const SCREENS = ["home", "reviews", "upload", "analyzing", "fountain", "script", "story", "episodes", "episode", "canvas", "graph", "review", "cut", "delivery", "outofdate"];
  const SETUP = ["analyzing", "fountain"];
  const hash = (location.hash || "").slice(1);
  const S = {
    screen: SCREENS.includes(hash) ? hash : "home", theme: "dark", side: true, tab: "all", filter: "all", waitFor: null, pin: null,
    dialog: null, toasts: [], dramaStop: null, draft: "", chats: {}, drafts: {}, drawer: false,
    cam: { x: 40, y: 96, k: 0.62 }, tool: "move", toolOpen: false, zoomOpen: false, keysOpen: false, sel: null, dock: (() => { try { return localStorage.getItem("studio.canvas.dock") || "under"; } catch (e) { return "under"; } })(), follow: true, agentOpen: false, panning: null, minimap: true,
    ti: 0, playing: false, t: 0, watched: {}, maxT: {}, verdict: {}, reason: {}, showPrev: false, subs: {}, outcome: "ok", over: false,
    state: "normal", proto: false, file: null, preset: null, len: "90", reviewing: "every", budget: "1000", ana: 0, tod: null, words: "", stab: "bible", cards: {}, cardWhy: {}, gsel: "ep6seg03", cutT: 0, cutPlaying: false, cutNotes: null, noteDraft: "", cutV: null, cutWhy: "",
  };
  let drawing = false;
  const draw = () => { if (!drawing) { drawing = true; requestAnimationFrame(() => { drawing = false; render(html`<${App}/>`, root); }); } };
  const set = (p) => { Object.assign(S, typeof p === "function" ? p(S) : p); draw(); };
  const go = (screen) => { set({ screen, sel: null, agentOpen: false, playing: false, drawer: false, from: null, at: null, asel: null }); try { history.replaceState(null, "", "#" + screen); } catch (e) { /* the hash is a convenience */ } };
  /* IA draft (F): below 1100 px the drama tree is a drawer the rail's menu button opens; the agent is the ball at 1280 and
     below, keeping what it follows or is pinned to. */
  const narrow = () => window.matchMedia("(max-width: 1100px)").matches;
  /* IA r2 (§16): each object has one home. A link lands on the home with the object selected (S.asel in Assets, S.sel on
     Canvas, S.esel in the List, S.gsel in Lineage), and remembers where it came from (S.from), so Back returns there. */
  const homeTab = (id) => (P.cast.some((c) => c.id === id) ? "cast" : P.places.some((p) => p.id === id) ? "scenes" : P.props.some((p) => p.id === id) ? "props" : null);
  const jump = (to, label) => { set({ sel: null, agentOpen: false, drawer: false, toolOpen: false, zoomOpen: false, ...to, from: { screen: S.screen, sel: S.sel, esel: S.esel, osel: S.osel, asel: S.asel, at: S.at, label } }); try { history.replaceState(null, "", "#" + to.screen); } catch (e) { /* the hash is a convenience */ } };
  /* Codex round 3 (fix 3): a link names the object's kind and version as well as its item (S.at = { kind, ver }), so it
     lands on that version, never on the item's newest. Kinds are drama-cli's lineage kinds (look, plate, prop, blocking,
     first_frame_reference, storyboard, take, cut); a plate's view or a storyboard's style rides along as at.view / at.style. */
  const KIND = { cast: "look", scenes: "plate", props: "prop" };
  const current = (id) => [...P.cast, ...P.places, ...P.props].find((x) => x.id === id);
  const openHome = (id, label, at) => jump({ screen: "story", stab: homeTab(id), asel: id, at: at || { kind: KIND[homeTab(id)], ver: current(id).ver } }, label);
  /* A segment's stage version, in its episode: the List by default, or Canvas. */
  const openStage = (id, at, label, screen = "episode") => jump({ screen, esel: id, sel: screen === "canvas" ? id : null, at }, label);
  /* A segment's versions, one tile each, as List and Canvas show them; the take is the one picked by default. */
  const stagesOf = (g) => [g.board && { kind: "storyboard", ver: "v1", pic: g.board }, g.still && { kind: "take", ver: g.take, pic: g.still }].filter(Boolean);
  const pickedAt = (g) => (S.at && ["storyboard", "take"].includes(S.at.kind) ? S.at : stagesOf(g).slice(-1)[0]);
  const openLineage = (gid, label) => jump({ screen: "graph", gsel: gid }, label);
  /* Round 3 (Codex, yurun): the crumbs say where an object belongs, each ancestor a link to its home; where you came
     from is only ever "Back to …" (BackTo). The drama shows its cover and name first, so it's clear which one is open. */
  const TABS = { cast: "Characters", scenes: "Locations", props: "Props" };
  const own = {
    drama: () => [html`<img class="crumbimg" src=${P.eps[0].cover} alt=""/>${P.project.title}`, () => go("episodes")],
    ep: () => ["EP006", () => go("episode")],
    assets: () => ["Assets", () => set({ screen: "story", stab: "cast", asel: null, at: null, from: null })],
    tab: (k) => [TABS[k], () => set({ screen: "story", stab: k, asel: null, at: null, from: null })],
  };
  let tid = 0;
  const toast = (text, action) => { const id = ++tid; set({ toasts: [...S.toasts, { id, text, action }] }); setTimeout(() => set({ toasts: S.toasts.filter((t) => t.id !== id) }), 4200); };
  const money = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const I = (name, cls) => html`<span class=${"ic " + (cls || "")} dangerouslySetInnerHTML=${{ __html: `<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">${window.ICONS[name] || ""}</svg>` }}></span>`;
  /* IA draft (§15): the maker sees five states: working · needs you · paused · problem · done. Every internal state maps
     onto one of them, and its own detail is the chip's title, on demand. A chip given its own words keeps them. */
  const ST = {
    work: ["work", "Working", "At work"], line: ["work", "Working", "In line"], back: ["work", "Working", "Sent back: the agent redoes it"],
    you: ["you", "Needs you", "Waiting for you"], redline: ["redline", "Needs you", "A red line in the screenplay: yours to decide"],
    paused: ["line", "Paused", "Stopped; resume when you want"], err: ["err", "Problem", "Something failed; open it for the next step"],
    accepted: ["accepted", "Done", "Accepted"], stale: ["stale", "Out of date", "Made from an input that has changed since"],
  };
  const Status = (st, label) => {
    const [cls, word, detail] = ST[st] || [st, st, ""];
    return html`<span class=${"st " + (label ? st : cls)} title=${detail}><i></i>${label || word}</span>`;
  };
  const Mark = () => html`<span class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5 6.6 9.2h2.9L5.4 14.4h3.4L4.5 19.8h6.3V22h2.4v-2.2h6.3l-4.3-5.4h3.4l-4.1-5.2h2.9z"/></svg></span>`;

  /* Codex round 3 (fix 1): one submission's state, shared by the Review send, Out of date's redo and the cut's Apply.
     A dropped connection proves nothing: the request may have arrived. An answer that never came is Unknown, and Check
     asks the engine; only the engine's word that nothing was submitted makes it Failed, with Send again under the same
     submission. A check can stay inconclusive, so Check again stays. Sent says the engine has it, and no more: what the
     agent then does shows from its session's status. State: S.subs[id], idle when absent; the prototype's Outcome
     select decides what a send or a check finds. */
  const FINDS = { ok: "sent", refused: "failed", unknown: "unknown" };
  const setSub = (id, st) => set({ subs: { ...(S.subs || {}), [id]: st } });
  const submit = (id) => { setSub(id, "sending"); setTimeout(() => setSub(id, FINDS[S.outcome]), 1200); };
  const recheck = (id) => { setSub(id, "checking"); setTimeout(() => setSub(id, FINDS[S.outcome]), 1200); };
  /* to: who receives it ("EP006's agent"); onSend: Send again, as the first send went (a confirm, then submit(id)); kept:
     what the maker still has when nothing was submitted ("Your draft is kept."), absent when there is nothing (a redo). */
  function Submission({ id, to, onSend, kept }) {
    const st = (S.subs || {})[id];
    if (!st) return null;
    if (st === "sending" || st === "checking") return html`<span class="subst" role="status">${I("circle-notch")}<span>${st === "sending" ? `Sending to ${to}…` : `Asking whether ${to} has it…`}</span></span>`;
    if (st === "sent") return html`<span class="subst" role="status">${I("check-circle")}<span><b>Sent to ${to}.</b></span></span>`;
    if (st === "unknown") return html`<span class="subst" role="status">${I("warning")}<span><b>No answer yet.</b> <span class="muted">It may have arrived. Check asks whether ${to} has it; it is never sent twice.</span></span><button class="btn sm" onClick=${() => recheck(id)}>Check again</button></span>`;
    return html`<span class="subst" role="alert">${I("warning-circle")}<span><b>Not submitted.</b> <span class="muted">The engine says it never reached ${to}.${kept ? " " + kept : ""}</span></span><button class="btn sm" onClick=${onSend}>Send again</button></span>`;
  }

  function applyTheme() { document.documentElement.setAttribute("data-palette", "classic"); document.documentElement.setAttribute("data-theme", S.theme); }

  /* ───── shell ───── */
  // §16: the agent panel's Decisions are this drama's rows of the one queue (waits), landing where each is decided.
  const decisions = () => waits().filter((w) => w.dr === P.project.title);
  /* IA draft: the rail is studio-wide only: Dramas, Reviews, Settings. Computers and Usage stay hidden until they work.
     A drama's places are in its sidebar, never here. */
  /* yurun ("project应该和icon 平铺", "左侧就不需要单独有一个column了"): off a project the studio's nav is the one left
     column, rows of icon and label side by side (liblib); inside a project it is the icon rail (VS Code's activity bar)
     beside the project tree, its labels as tooltips. ☰ opens and closes that column, the same everywhere. */
  const studioPage = () => ["home", "upload", "reviews"].includes(S.screen);
  function Rail() {
    const dramas = !["reviews"].includes(S.screen);
    const wide = studioPage() && S.side && !narrow();
    const place = (label, icon, current, onClick, extra) => html`<button class=${"ibtn labelled" + (extra ? " railcount" : "")} title=${wide ? undefined : label} aria-label=${extra ? extra.name : undefined} aria-current=${current ? "page" : "false"} onClick=${onClick}>${I(icon)}<span class="raillabel">${label}</span>${extra && extra.badge}</button>`;
    return html`<nav class=${"rail" + (wide ? " wide" : "")} aria-label="Main">
      <div class="railhead"><button class="ibtn" aria-label="Show or hide the sidebar" aria-expanded=${String(narrow() ? !!S.drawer : S.side)} onClick=${() => (narrow() ? set({ drawer: !S.drawer }) : set({ side: !S.side }))}>${I("list")}</button>
        ${wide && html`<span class="brand">${Mark()}<b>Pine Drama</b></span>`}</div>
      <hr/>
      ${place("Projects", "film-strip", dramas, () => go("home"))}
      ${place("Reviews", "list-checks", S.screen === "reviews", () => set({ waitFor: null, screen: "reviews" }), { name: "Reviews, 5 waiting", badge: html`<span class="badge">5</span>` })}
      <span class="grow"></span>
      ${place("Settings", "gear-six", false, () => toast("Settings: notifications, appearance, data."))}
      ${!wide && html`<div style="margin-top:6px">${Mark()}</div>`}
    </nav>`;
  }
  function Side() {
    // Off a project the rail is the one column (Rail): no second one.
    if (studioPage()) return null;
    const cur = { episodes: null, episode: "EP006", canvas: "EP006", review: "EP006", cut: "EP006" }[S.screen];
    if (SETUP.includes(S.screen)) return html`<aside class=${"side " + (S.side ? "" : "closed") + (S.drawer ? " drawer-open" : "")} aria-label="Project">
      <div class="head"><button class="proj" onClick=${() => go("home")} title="All dramas"><span class="newthumb">${I("file-text")}</span><span class="grow"><b>${P.project.title}</b><small>Setup · 1 session</small></span>${I("caret-down", "subtle")}</button></div>
      <div class="scroll"><div class="sec">Setup</div>${window.EXTRA.SetupSteps()}</div>
      <div class="foot" title=${SPENT_COVERS}><div style="display:flex;justify-content:space-between"><span>Spent</span><b class="mono" style="color:var(--text-primary)">$0.40 <span class="muted">/ $1,000</span></b></div><span>Nothing in flight</span><span class="muted" style="font-size:11px">${SPENT_COVERS}</span></div>
    </aside>`;
    return html`<aside class=${"side " + (S.side ? "" : "closed") + (S.drawer ? " drawer-open" : "")} aria-label="Project">
      <div class="head"><button class="proj" onClick=${() => go("home")} title="All dramas"><img src=${P.eps[0].cover} alt=""/><span class="grow"><b>${P.project.title}</b><small>${P.project.episodes} episodes · ${P.project.spec}</small></span>${I("caret-down", "subtle")}</button></div>
      <div class="scroll">
        <button class="navi" aria-current=${S.screen === "script" ? "page" : "false"} onClick=${() => go("script")}>${I("file-text")}Script</button>
        <button class="navi" aria-current=${S.screen === "story" && (S.stab || "bible") === "bible" ? "page" : "false"} onClick=${() => set({ screen: "story", stab: "bible", asel: null, at: null })}>${I("book-open")}Story</button>
        <button class="navi" aria-current=${S.screen === "story" && (S.stab || "bible") !== "bible" ? "page" : "false"} onClick=${() => set({ screen: "story", stab: "cast", asel: null, at: null })}>${I("stack")}Assets<span class="cnt">2</span></button>
        <ul class="tree sub">${[["cast", "Characters", P.cast.length], ["scenes", "Locations", P.places.length], ["props", "Props", P.props.length]].map(([k, l, n]) => html`<li><button aria-current=${String(S.screen === "story" && S.stab === k)} onClick=${() => set({ screen: "story", stab: k, asel: null, at: null })}><span class="now">${l}</span><span class="n">${n}</span></button></li>`)}</ul>
        <button class="navi" aria-current=${S.screen === "episodes" ? "page" : "false"} onClick=${() => go("episodes")}>${I("film-strip")}Episodes<span class="cnt">4</span></button>
        <ul class="tree">${P.eps.slice(0, 8).map((e) => html`<li><button aria-current=${String(cur === e.code)} onClick=${() => e.code === "EP006" ? go("episode") : go("episodes")}>
          <span class="code">${e.code}</span><span class="now">${e.now}</span><span class=${"dot " + e.status} title=${{ you: "Needs you", work: "Working", accepted: "Done", line: "In line" }[e.status]}></span></button></li>
          ${cur === e.code && e.cut && html`<li class="treecut"><button aria-current=${String(S.screen === "cut")} onClick=${() => go("cut")}><span class="code">› Cut</span><span class="now">${e.cut.latest}${e.cut.st === "you" ? " waits for you" : ""}</span><span class=${"dot " + e.cut.st}></span></button></li>`}`)}
          <li style="padding:6px 8px;color:var(--text-subtle);font-size:11.5px">EP009–EP024 · 16 in line</li></ul>
        ${/* yurun's Y10: what the dots mean, once, at the tree's foot (Nielsen: recognition rather than recall). */ ""}
        <p class="treelegend"><span><i class="dot you"></i>Needs you</span><span><i class="dot work"></i>Working</span><span><i class="dot accepted"></i>Done</span></p>
        <button class="navi" aria-current=${S.screen === "delivery" ? "page" : "false"} onClick=${() => go("delivery")}>${I("scissors")}Delivery<span class="cnt">1</span></button>
        <hr class="sidehr"/>
        <button class="navi" aria-current=${S.screen === "reviews" ? "page" : "false"} onClick=${() => set({ waitFor: P.project.title, screen: "reviews" })}>${I("list-checks")}Reviews<span class="cnt">4</span></button>
        <button class="navi" aria-current=${S.screen === "outofdate" ? "page" : "false"} onClick=${() => go("outofdate")}>${I("warning")}Out of date${S.state !== "fresh" && html`<span class="n">5</span>`}</button>
      </div>
      <div class="foot" title=${SPENT_COVERS}>
        <dl class="spend"><dt>Spent</dt><dd class="mono">${money(P.project.spent)}</dd><dt>Reserved</dt><dd class="mono">${money(P.project.inflight)}</dd><dt>Budget</dt><dd class="mono">$1,000</dd></dl>
        <div class="meter"><i style=${`width:${P.project.spent / 10}%`}></i><i class="fly" style=${`width:${P.project.inflight / 10}%`}></i></div>
        <span>This drama · 2 at work</span>
        <span class="subtle" style="font-size:11px">${SPENT_COVERS}</span>
      </div>
    </aside>`;
  }
  function StopControl() {
    if (S.dramaStop === "stopping") return html`<button class="btn sm" disabled>${I("circle-notch")}Stopping…</button>`;
    if (S.dramaStop === "stopped") return html`<span class="stopped-chip">${I("stop")}Stopped</span><button class="btn sm" onClick=${resume}>Resume</button>`;
    return html`<button class="btn sm danger" onClick=${() => set({ dialog: { title: "Stop " + P.project.title + "?", body: "EP003 has 4 takes in flight and EP005 is blocking seg03. The takes are waited on and recorded, never sent again, and charged if the provider made them; a take whose outcome stays unknown may not be recoverable. Then every episode stops, and you can resume.", ok: "Stop drama", danger: true, cancel: "Keep running", run: stopDrama } })}>${I("stop")}Stop drama</button>`;
  }
  function stopDrama() { set({ dramaStop: "stopping" }); setTimeout(() => { if (S.dramaStop === "stopping") { set({ dramaStop: "stopped" }); toast(P.project.title + " stopped.", { label: "Resume", run: resume }); } }, 5000); }
  function resume() { set({ dramaStop: null }); toast(P.project.title + " resumed."); }
  /* Export: the drama as other tools read it, downloaded from what the agent's stops return (handoff/lineage.json,
     handoff/infinite-canvas.zip, written by drama-cli export). Disabled, with why, until a stop has returned them. */
  /* IA draft: Export gives what its owner made, never whichever session returned last. In an episode
     (its List, Canvas, Cut, or Lineage opened from one of its items) it is that episode's own export, the newest by when its session's turn
     started: the shared project and that episode. Elsewhere it is the shared project, the setup's.
     Each says which session made it, and when. */
  function ExportMenu() {
    if (["home", "upload", "reviews"].includes(S.screen)) return null;
    const none = S.state === "nostop";
    const why = "Ready after the agent's next stop returns it.";
    // Lineage sits inside its episode when its item is the episode's or it was opened from there (A2); Out of date is drama-wide.
    const ep = ["episode", "canvas", "cut"].includes(S.screen) || (S.screen === "graph" && window.EXTRA.lineageInEpisode());
    const scope = ep ? "EP006" : "the shared project";
    const from = ep ? "EP006's session · stop at 18:12" : "The setup's session · stop at 17:40";
    const name = ep ? "bride-on-bail-ep006" : "bride-on-bail";
    const item = (label, ext, hint, file) => html`<button class="mi" role="menuitem" aria-disabled=${String(none)} title=${none ? why : ""}
        onClick=${() => { if (none) return; set({ exportOpen: false }); toast("Downloaded " + file + "."); }}>
      <b>${label} <span class="mono muted">${ext}</span></b><small>${none ? why : hint}</small></button>`;
    return html`<div class="exportmenu">
      <button class="btn sm" aria-haspopup="menu" aria-expanded=${String(!!S.exportOpen)} onClick=${() => set({ exportOpen: !S.exportOpen })}>${I("download-simple")}Export${I("caret-down")}</button>
      ${S.exportOpen && html`<div class="menu" role="menu" aria-label=${"Export " + scope}>
        <div class="mh"><b>${ep ? "EP006" : "Shared project"}</b><small>${none ? "No stop has returned it yet." : from}</small></div>
        ${item("ComfyUI workflow", ".json", ep ? "The shared project and EP006, as drama-cli exports them." : "The bible, breakdowns and shared references, as drama-cli exports them.", name + "-lineage.json")}
        ${item("infinite-canvas", ".zip", "Open infinite-canvas → Import → choose this file.", name + "-infinite-canvas.zip")}
      </div>`}
    </div>`;
  }
  function TopBar({ crumbs, right }) {
    const n = decisions().length;
    return html`<header class="top">
      <nav class="crumb" aria-label="Where this belongs">${crumbs.map((c, i) => { const [t, to] = Array.isArray(c) ? c : [c];
        return html`${i > 0 && I("caret-right")}${i === crumbs.length - 1 ? html`<b aria-current="page">${t}</b>` : to ? html`<button class="crumblink" onClick=${to}>${t}</button>` : html`<span>${t}</span>`}`; })}</nav>
      ${/* Where you came from, apart from where it belongs: its own control, in the same place on every page. */ ""}
      <${window.EXTRA.BackTo}/>
      <span class="grow"></span>
      ${right}
      <${ExportMenu}/>
      ${/* IA draft (A1): a studio page (Reviews) acts on no one drama, so it has no Stop or Next review; the queue is the way in. */
        S.screen !== "reviews" && html`<${StopControl}/>
      <button class="btn primary sm" onClick=${() => go("review")} aria-label=${"Next review in " + P.project.title + ", " + n + " waiting"}>Next review <span class="n">${n}</span></button>`}
    </header>`;
  }
  function StopBanner() {
    // IA draft: a red line stops EP007 only. Elsewhere it is a compact notice; the full StopCard sits on EP007.
    if (S.state === "redline") return html`<div class="notice-red" role="status">${I("warning")}<span><b>EP007 stopped on a red line</b> in the screenplay. Other episodes carry on.</span><span class="grow"></span><button class="btn sm" onClick=${() => toast("Opens EP007, where its stop card waits for your decision.")}>Open EP007</button></div>`;
    if (["budget", "cap", "env"].includes(S.state)) return html`<${window.EXTRA.StopCard} kind=${S.state}/>`;
    if (!S.dramaStop) return null;
    return S.dramaStop === "stopping"
      ? html`<div class="banner" role="status">${I("circle-notch")}<b>Stopping — keep the app open</b><span>Waiting on EP003's 4 takes in flight. They are recorded when they come back, never shot again.</span></div>`
      : html`<div class="banner done"><b>${P.project.title} is stopped</b><span class="grow">No agent turn runs and nothing new is sent until you resume.</span><button class="btn sm primary" onClick=${resume}>Resume</button></div>`;
  }
  /* IA draft: an episode's two views. Story, Assets, the board and Delivery have none; Lineage opens from an item. */
  function EpisodeViews() {
    if (S.screen !== "episode" && S.screen !== "canvas") return null;
    // Two views of one episode, one selection (master's decision: Cut leaves the switch; WAI-ARIA APG tabs switch panels
    // of one thing). The episode's cut is another object with its own home: the header's link and the tree's row.
    return html`<div class="seg" role="group" aria-label="EP006 view">
      ${[["List", "list-bullets", "episode"], ["Canvas", "flow-arrow", "canvas"]].map(([l, ic, sc]) =>
        html`<button aria-pressed=${String(S.screen === sc)} onClick=${() => { const on = S.sel || S.esel, at = S.at; go(sc); set({ sel: sc === "canvas" ? on : null, esel: on, at }); }}>${I(ic)}${l}</button>`)}
    </div>`;
  }
  function ProjectChips() {
    return html`<span class="chip" title="The preset this drama is made with. Chosen at upload.">${html`<img class="thumb" src=${P.cast[0].face} alt=""/>`}${P.project.preset}</span>
      <span class="chip plain">${I("frame-corners")}${P.project.spec}</span>
      <span class="chip plain" title=${SPENT_COVERS}>${I("coins")}<span class="mono">${money(P.project.spent)}</span><span class="muted">of $1,000</span></span>`;
  }

  /* ───── agent panel ───── */
  /* IA draft (E): the session the agent panel speaks to. It follows the episode in view (List, Canvas, its review, its
     cut, Lineage from one of its items); a page with no episode in view follows none, and never guesses one. A pin wins.
     The session's process, messages and composer follow it together; an unsent draft stays with its own session. */
  const inEpisode = () => ["episode", "canvas", "review", "cut"].includes(S.screen) || (S.screen === "graph" && window.EXTRA.lineageInEpisode());
  const talkTo = () => S.pin || (inEpisode() ? "EP006" : null);
  const switchTo = (pin) => { const from = talkTo(), next = pin || (inEpisode() ? "EP006" : null); set({ pin, drafts: { ...S.drafts, [from || ""]: S.draft }, draft: (S.drafts || {})[next || ""] || "" }); };
  function AgentPanel({ float }) {
    const dec = decisions(), to = talkTo(), ep7 = to === "EP007";
    const runRow = (code, what) => html`<div class="arow"><div class="what"><b>${code}</b><span>${S.dramaStop === "stopped" ? "Stopped with the drama" : S.dramaStop ? (code === "EP003" ? "Stopping… waiting on 4 takes in flight" : "Stopping…") : what}</span></div>
      ${!S.dramaStop && html`<button class="btn sm ghost" onClick=${() => toast("Watch opens the Computer's desktop, view-only.")}>Watch</button>
      <button class="btn sm ghost" onClick=${() => set({ dialog: { title: "Stop " + code + "?", body: code === "EP003" ? "4 takes are in flight. They are waited on and recorded, never sent again. The episode stops after them." : "No take is in flight. The episode stops now and can be resumed.", ok: "Stop " + code, danger: true, cancel: "Keep running", run: () => toast(code + " stopped.") } })}>Stop</button>`}</div>`;
    return html`<aside class=${"agent " + (float ? "float" : "")} aria-label="Agent panel">
      <div class="ahead"><span class="live"></span><h2>Agent</h2><span class="grow"></span>
        ${float ? html`<button class="ibtn" aria-label="Close the agent panel" onClick=${() => set({ agentOpen: false })}>${I("x")}</button>` : html`<button class="ibtn" aria-label="Collapse" onClick=${() => toast("The panel collapses to the agent ball, as on Canvas.")}>${I("arrows-in")}</button>`}</div>
      <div class="ascope">${S.pin
        ? html`${I("map-pin")}<span>Pinned to <b>${S.pin}</b></span><span class="grow"></span><button class="btn sm ghost" onClick=${() => switchTo(null)}>${inEpisode() ? "Follow EP006" : "Unpin"}</button>`
        : to ? html`<span class="live"></span><span>Following <b>${to}</b>, the episode in view</span><span class="grow"></span><button class="btn sm ghost" onClick=${() => switchTo("EP007")}>Pin to EP007</button>`
        : html`<span>No episode in view</span><span class="grow"></span><button class="btn sm ghost" onClick=${() => switchTo("EP007")}>Pin to EP007</button>`}</div>
      <div class="ascroll">
        <section class="asec"><h3>Sessions <span class="c">3</span></h3>${runRow("EP003", "Running · shooting 4 takes · 2 back")}
          <div class="arow"><div class="what"><b>EP006</b><span>Waiting · 2 takes wait for you</span></div><button class="btn sm ghost" onClick=${() => go("review")}>Review</button></div>
          ${(() => {
            // C3: Reconcile asks the provider what became of the request and ends in one of three outcomes, each saying what
            // happens next (the prototype's Outcome control picks which); it never resubmits on its own.
            const r = S.recon;
            const reconcile = () => { set({ recon: "checking" }); setTimeout(() => set({ recon: S.outcome === "refused" ? "failed" : S.outcome === "unknown" ? "unknown" : "found" }), 1200); };
            if (r === "found") return html`<div class="arow"><div class="what"><b>EP005</b><span>Running · collecting seg03's take</span><small>Found: the provider finished seg03's video. The agent collects it and carries on; nothing is generated again.</small></div></div>`;
            return html`<div class="arow failed"><div class="what"><b>EP005</b>
              ${r === "checking" ? html`<span>Checking seg03's request with the provider…</span><small>Nothing is sent again while it checks.</small>`
              : r === "failed" ? html`<span>seg03's request failed at the provider</span><small>Next: shoot seg03 again. That is one new request, and it spends.</small>`
              : r === "unknown" ? html`<span>Still unknown: the provider hasn't said</span><small>Nothing is sent again. Check again later; the agent keeps waiting on it.</small>`
              : html`<span>Failed while shooting seg03 · <code>ProviderError.Unknown</code></span><small>drama-cli: the video request's outcome is unknown. It isn't sent again until it is reconciled.</small><small class="subtle">A failed session doesn't mean its jobs failed.</small>`}</div>
              ${r === "checking" ? html`<span class="muted" style="font-size:12px">Checking…</span>`
              : r === "failed" ? html`<button class="btn sm" onClick=${() => set({ dialog: { title: "Shoot seg03 again?", body: "One new video request for EP005 seg03. It spends.", ok: "Shoot again", cancel: "Not now", run: () => { set({ recon: null }); toast("EP005 seg03 is being shot again."); } } })}>Shoot seg03 again</button>`
              : html`<button class="btn sm" title="drama-cli's recovery for an unknown outcome" onClick=${reconcile}>${r === "unknown" ? "Check again" : "Reconcile"}</button>`}</div>`;
          })()}</section>
        <section class="asec"><h3>Decisions <span class="c">${dec.length}</span></h3>
          ${dec.map((d) => html`<button class="dec" onClick=${d.open}><img src=${d.thumb} alt=""/><span><b>${d.what}</b><small>${d.d}</small></span><span class="age">${d.age}</span></button>`)}</section>
        ${ep7 ? html`<section class="asec"><div class="process"><button aria-expanded=${String(S.procOpen !== false)} onClick=${() => set({ procOpen: S.procOpen === false })}>${I("list-checks")}EP007 · Process<span class="cnt">3 steps</span>${I(S.procOpen === false ? "caret-right" : "caret-down")}</button>
          ${S.procOpen !== false && html`<ol class="steps">
            <li>${I("check-circle")}<span>Status <code>drama-cli status</code></span><time>0:02</time></li>
            <li>${I("check-circle")}<span>Bible EP007–EP012: refused, a red line</span><time>1:10</time></li>
            <li class="now">${I("circle-notch")}<span>Waiting for your decision</span><time></time></li></ol>`}</div></section>
        <section class="asec"><p class="msg">drama-cli won't write EP007–EP012: scene 4 shows a guard striking Luca in the cell. Shall I write it without that, or stop here? Other episodes carry on.</p></section>`
        : to ? html`<section class="asec"><div class="process"><button aria-expanded=${String(S.procOpen !== false)} onClick=${() => set({ procOpen: S.procOpen === false })}>${I("list-checks")}EP006 · Process<span class="cnt">7 steps</span>${I(S.procOpen === false ? "caret-right" : "caret-down")}</button>
          ${S.procOpen !== false && html`<ol class="steps">
            <li>${I("check-circle")}<span>Status <code>drama-cli status</code></span><time>0:02</time></li>
            <li>${I("check-circle")}<span>seg01 shot again: blanket folded first</span><time>2:40</time></li>
            <li>${I("check-circle")}<span>seg03 shot again: opens on Luca</span><time>2:12</time></li>
            <li>${I("check-circle")}<span>Downloaded both takes</span><time>0:18</time></li>
            <li class="now">${I("circle-notch")}<span>Waiting for your review</span><time></time></li></ol>`}</div></section>
        <section class="asec"><p class="msg">I shot seg01 again with the blanket folded before Luca speaks, and seg03 again opening on his face, as you asked. Both new takes wait for you.</p></section>`
        : html`<section class="asec"><p class="msg muted">Open an episode, or pin a session, to see its work here and message it.</p></section>`}
        <section class="asec"><h3>Recent work</h3>
          <div class="arow"><div class="what"><b>EP006 seg03 take t02</b><span>waits for you</span></div></div>
          <div class="arow"><div class="what"><b>Margaret Cole base look v3</b><span>waits for you</span></div></div></section>
        ${to && (S.chats?.[to] || []).map((m) => html`<section class="asec"><p class="msg you">${m}</p></section>`)}
        <section class="asec"><h3>Next</h3><div class="nextchips"><button onClick=${() => go("review")}>Review EP006 takes</button><button onClick=${() => go("canvas")}>Review looks and plates</button></div></section>
      </div>
      ${(() => {
        const send = () => { set({ chats: { ...S.chats, [to]: [...((S.chats || {})[to] || []), S.draft.trim()] }, draft: "" }); toast("Sent to " + to + "'s session."); };
        return html`<div class="composer"><textarea placeholder=${to ? "Message " + to + "'s session…" : "Pin a session to message it"} disabled=${!to} value=${S.draft} onInput=${(e) => set({ draft: e.target.value })}
          onKeyDown=${(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && S.draft.trim() && to) send(); }}></textarea>
        <div class="crow"><span>${to ? html`To <b>${to}</b>'s session · ${S.pin ? "pinned" : "the episode in view"}` : "No session chosen"}</span><button class="send" aria-label=${to ? "Send to " + to : "Send"} disabled=${!to || !S.draft.trim()} onClick=${send}>${I("arrow-up")}</button></div></div>`;
      })()}
    </aside>
    ${!float && html`<button class="ball agentball" aria-label=${"Agent" + (to ? ", " + (S.pin ? "pinned to " : "following ") + to : "")} onClick=${() => set({ agentOpen: !S.agentOpen })}>${I("robot")}<span class="badge">${dec.length}</span></button>
      ${S.agentOpen && html`<${AgentPanel} float/>`}`}`;
  }

  /* Home's "Waiting for you": every drama's decisions, each row named by its drama and pictured by its cover (the agent
     panel pictures the item: thumb).
     §16: a row lands where that decision is made, with its items picked: takes in the review room, looks and plates
     on their cards in Assets, storyboards in their episode, a cut on its episode's Cut. Back returns. */
  const waits = () => {
    const cover = (t) => P.projects.find((p) => p.t === t).cover;
    // "Back to …" names the page the row was opened from: Home, Reviews, or any page under the agent panel.
    const back = () => ({ home: "Home", reviews: "Reviews", story: S.stab === "bible" ? "Story" : "Assets", episode: "EP006", canvas: "EP006 · Canvas", graph: "Lineage", cut: "EP006 › Cut", delivery: "Delivery", script: "Script", outofdate: "Out of date" })[S.screen];
    const only = (where) => () => toast("Opens " + where + ". This sample opens EP006 only.");
    return [
      { dr: "Bride on Bail", what: "EP006", d: "2 takes · seg01, seg03", age: "4 min", thumb: P.takes[0].poster, open: () => go("review") },
      { dr: "Bride on Bail", what: "Looks and plates", d: "2 items · Margaret Cole, Garden wedding", age: "12 min", thumb: P.cast[3].face, open: () => openHome("margaret", back()) },
      { dr: "Bride on Bail", what: "EP004", d: "6 storyboards · scene 1 and 2", age: "26 min", thumb: "img/board-seg03.jpg", open: only("EP004's List with its 6 storyboards picked") },
      { dr: "Bride on Bail", what: "EP001", d: "Cut v2 · The Wedding", age: "1 h", thumb: P.eps[0].cover, open: only("EP001 › Cut v2") },
      { dr: "Last Toast", what: "EP007", d: "Red line · decide in your words", age: "2 h", open: () => toast("Last Toast: only Bride on Bail opens in this direction.") },
    ].map((w) => ({ ...w, pic: cover(w.dr) }));
  };
  /* ───── Reviews: every drama's decisions, one queue, one filter (IA draft) ───── */
  function Reviews() {
    const all = waits(), dramas = [...new Set(all.map((w) => w.dr))];
    const list = all.filter((w) => !S.waitFor || w.dr === S.waitFor);
    return html`<div class="main">
      <${TopBar} crumbs=${S.waitFor ? ["Reviews", S.waitFor] : ["Reviews"]}/>
      <div class="scrollmain"><div class="wrap" style="max-width:880px">
        <div class="greet"><div class="grow"><h1>Reviews</h1><p>Every decision the agent waits on, newest first. Each opens where you decide it.</p></div></div>
        <div class="filters">${[[null, "All", all.length], ...dramas.map((d) => [d, d, all.filter((w) => w.dr === d).length])].map(([k, l, n]) =>
          html`<button class="fchip" aria-pressed=${String(S.waitFor === k)} onClick=${() => set({ waitFor: k })}>${l}<small>${n}</small></button>`)}</div>
        <section class="panel queue">${list.map((w) => html`<button class="wait" onClick=${w.open}><img src=${w.pic} alt=""/>
          <span><b>${w.dr} · ${w.what}</b><small>${w.d} · ${w.age}</small></span></button>`)}</section>
      </div></div></div>`;
  }
  /* ───── Home ───── */
  /* Home (yurun's round 1, Y2–Y4): the grid is the one list of projects (one home per object: a project appears once
     on Home); New project leads it (liblib's 开始创作; Apple HIG puts the create action with its collection); what waits
     is a compact strip above it that leads to Reviews. */
  function Home() {
    const tabs = [["all", "All", 4], ["you", "Needs you", 2], ["work", "Working", 1], ["done", "Done", 1]];
    const list = P.projects.filter((p) => S.tab === "all" || (S.tab === "you" ? p.st === "you" || p.st === "redline" : S.tab === "work" ? p.st === "work" : p.st === "accepted"));
    const upload = () => go("upload");
    return html`<div class="main"><div class="scrollmain"><div class="wrap">
      <div class="greet"><div class="grow"><h1>Projects</h1><p>5 decisions wait for you across 2 projects.</p></div></div>
      <section class="waitstrip" aria-labelledby="waiting-title"><div class="wh"><h3 id="waiting-title">Waiting for you</h3><span class="grow"></span>
          <button class="seeall" onClick=${() => set({ waitFor: null, screen: "reviews" })}>See all ${waits().length} in Reviews ${I("caret-right")}</button></div>
        <ul>${waits().slice(0, 4).map((w) => html`<li><button class="wait" onClick=${w.open}><img src=${w.pic} alt=""/><span><b>${w.dr} · ${w.what}</b><small>${w.d} · ${w.age}</small></span></button></li>`)}</ul></section>
      <div class="tabsrow"><div class="utabs" role="tablist">${tabs.map(([k, l, n]) => html`<button role="tab" aria-selected=${String(S.tab === k)} onClick=${() => set({ tab: k })}>${l}<small>${n}</small></button>`)}</div>
        <span class="grow"></span><span class="search">${I("magnifying-glass")}Search projects…</span><button class="select">Last edited ${I("caret-down")}</button></div>
      <div class="cards">
        <button class=${"newcard " + (S.over ? "over" : "")} onClick=${upload}
          onDragOver=${(e) => { e.preventDefault(); if (!S.over) set({ over: true }); }} onDragLeave=${() => set({ over: false })} onDrop=${(e) => { e.preventDefault(); set({ over: false }); upload(); }}>
          <span class="pic"><span class="plus">${I("plus")}</span></span><span class="txt"><b>New drama project</b><small>Drop a screenplay here</small></span></button>
        ${list.map((p, i) => html`<div class="pcard"><button class="open" onClick=${() => i === 0 || p.t === P.project.title ? go("episodes") : toast(p.t + ": only the first project opens in this direction.")}>
          <div class="pic"><img src=${p.cover} alt=""/></div>
          <div class="txt"><b>${p.t}</b><small>${p.ago}</small></div></button>
          ${p.st === "you" || p.st === "redline"
            ? html`<button class=${"st " + p.st} title=${"Open Reviews for " + p.t} onClick=${() => set({ waitFor: p.t, screen: "reviews" })}><i></i>${p.lab}</button>`
            : Status(p.st, p.lab)}</div>`)}
      </div>
    </div></div></div>`;
  }

  /* ───── Episodes board ───── */
  function Episodes() {
    const f = [["all", "All", 24], ["you", "Needs you", 3], ["work", "Working", 20], ["done", "Done", 0]];
    // "Working" holds the episodes in line too: their place in line is the card's detail.
    const list = P.eps.filter((e) => S.filter === "all" || e.status === S.filter || (S.filter === "work" && e.status === "line"));
    const open = (e) => e.code === "EP006" ? go("episode") : toast(e.code + ": only EP006 opens in this direction.");
    return html`<div class="main">
      <${TopBar} crumbs=${[own.drama(), "Episodes"]}/>
      <div class="body"><div class="scrollmain">
        <div class="bar2"><${EpisodeViews}/><span class="grow"></span><${ProjectChips}/></div>
        <${StopBanner}/>
        <div class="filters">${f.map(([k, l, n]) => html`<button class="fchip" aria-pressed=${String(S.filter === k)} onClick=${() => set({ filter: k })}>${l}<small>${n}</small></button>`)}
          <span class="grow"></span><span class="search" style="width:200px">${I("magnifying-glass")}Find an episode…</span><button class="select">Episode order ${I("caret-down")}</button></div>
        <div class="epgrid">${list.map((e) => html`<button class="epcard" onClick=${() => open(e)}>
          <div class="pic">${e.cover ? html`<img src=${e.cover} alt="" loading="lazy"/>` : html`<span class="empty">${e.n < 9 ? "Breakdown done" : "Not started"}</span>`}
            <span class="code">${e.code}</span>${e.status !== "line" && Status(e.status)}
            <span class="strip">${e.strip.map((s) => html`<i class=${s}></i>`)}</span></div>
          <b>${e.title}</b><small><span>${e.now}</span><span class="mono">${e.spent ? money(e.spent) : ""}</span></small></button>`)}</div>
      </div><${AgentPanel}/></div></div>`;
  }

  /* ───── Canvas ───── */
  const NODES = (() => {
    const n = [];
    P.cast.slice(0, 5).forEach((c, i) => n.push({ id: c.id, kind: "cast", x: 0, y: i * 196, w: 300, h: 168, pic: c.sheet, label: c.name, st: c.st, ver: c.ver, accepted: c.accepted, role: c.role, model: "gpt-image-2.5", problems: c.problems }));
    P.places.slice(0, 2).forEach((p, i) => n.push({ id: p.id, kind: "place", x: 400, y: i * 380, w: 190, h: 338, pic: p.pic, label: p.name, st: p.st, ver: p.ver, accepted: p.accepted, model: "gpt-image-2.5", role: "Plate · " + p.times.map(([t]) => t).join(" · ") }));
    n.push({ id: "file", kind: "prop", x: 400, y: 770, w: 190, h: 200, pic: P.props[0].pic, label: "Case file", st: "accepted", ver: "v1", accepted: P.props[0].accepted, role: "Key prop", model: "gpt-image-2.5" });
    let gy = 0;
    P.scenes.forEach((sc, gi) => {
      const g = { id: "g" + sc.n, kind: "group", x: 700, y: gy, w: 360, h: 64 + sc.segs.length * 236, label: `Scene ${sc.n} · Luca's apartment · ${sc.time}` };
      n.push(g);
      sc.segs.forEach((s, i) => n.push({ id: s.id, kind: "seg", x: 730, y: gy + 64 + i * 236, w: 300, h: 196, seg: s, label: `EP006 ${s.id}`, st: s.st, ver: s.take, accepted: s.accepted, model: "sd25", role: s.s + " s · " + s.cast.length + " in frame" }));
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
  /* Out of date in this sample: the Case file, made from bible b0002 while b0003 is accepted. */
  const outOfDate = (n) => n.st === "stale" || n.stale || n.id === "file";
  function NodePanel({ node: item, style, uses, reads, docked: forced }) {
    // A segment's panel is on its picked version: the storyboard tile shows the storyboard's version, the take tile the take's.
    const at = item.seg ? pickedAt(item.seg) : null, ood = at && window.EXTRA.outOfDateAt(item.id, at);
    const node = !at ? item : at.kind === "storyboard"
      ? { ...item, label: item.label + " · storyboard " + at.ver, ver: at.ver, accepted: at.ver, st: "accepted", stale: !!ood, seg: null }
      : { ...item, label: item.label + " · take " + at.ver, stale: !!ood };
    const spec = node.seg && node.seg.spec;
    // A shared reference's home is Assets (§16): its versions, prompt and review live there, and the canvas only links to it.
    const home = homeTab(node.id);
    const open = S.dtab;
    const parts = home ? [] : [["prompt", "Prompt"], ...(spec ? [["versions", "Versions"], ["request", "Request"]] : []), ["details", "Details"]];
    const chips = (line) => line.split(/(Image \d+)/).map((part) => { const m = part.match(/^Image (\d+)$/); return m ? html`<span class="pchip"><img src=${spec.images[m[1] - 1]} alt=""/>${part}</span>` : part; });
    // Under the node by default, the industry's convention; docked right on asking, or when the board has no room for it
    // above or below the node. The viewer's choice is kept in this browser.
    const docked = forced || S.dock === "right";
    const dock = (to) => { set({ dock: to }); try { localStorage.setItem("studio.canvas.dock", to); } catch (e) { /* a convenience */ } };
    const acc = node.accepted === node.ver ? "accepted" : node.accepted ? `accepted ${node.accepted}` : "none accepted";
    const why = node.problems ? node.problems.join("; ") : node.id === "file" ? "Changed file: bible/v3/bible.json" : ood ? `Made from ${ood.from}, which is out of date` : "";
    // §15 progressive disclosure: by default its state and what needs the maker; prompt, versions, request and details on demand.
    const needs = node.st === "you" ? (home ? "Waits for your review in Assets." : `Take ${node.ver} waits for you: watch it, then accept, send back or note.`)
      : outOfDate(node) ? "Nothing for you: the agent redraws what is out of date." : node.st === "back" ? "Nothing for you: the agent redoes it." : "";
    return html`<div class=${"npanel" + (docked ? " docked" : "")} role="dialog" aria-label=${node.label} style=${style}>
      <div class="nhead"><b class="grow">${node.label}</b>${Status(node.st === "stale" ? "accepted" : node.st)}${outOfDate(node) ? Status("stale", "Out of date") : Status("line", "Up to date")}
        ${!forced && html`<button class="ibtn" title=${docked ? "Under the node" : "Dock right"} aria-label=${docked ? "Under the node" : "Dock right"} onClick=${() => dock(docked ? "under" : "right")}>${I(docked ? "square-half-bottom" : "square-half")}</button>`}
        <button class="ibtn" aria-label="Close" onClick=${() => set({ sel: null, cam: S.camBack || S.cam, camBack: null })}>${I("x")}</button></div>
      <div class="nstate"><span class="mono">current ${node.ver || "v1"} · ${acc}</span>${why && html`<span class="why">${I("warning")}${why}</span>`}</div>
      ${needs && html`<p class="needs">${needs}</p>`}
      ${home ? html`<p class="subtle nhome">Its versions, prompt and review: <button class="linkbtn" onClick=${() => openHome(node.id, "EP006 · Canvas")}>Assets › ${{ cast: "Characters", scenes: "Locations", props: "Props" }[home]} › ${node.label}</button></p>`
        : html`<div class="ndisc">${parts.map(([k, l]) => html`<button aria-expanded=${String(open === k)} aria-controls="npart" onClick=${() => set({ dtab: open === k ? null : k })}>${l}${I(open === k ? "caret-up" : "caret-down")}</button>`)}</div>`}
      ${!home && open && html`<div id="npart" class="npart" role="region" aria-label=${parts.find(([k]) => k === open)[1]}>
        ${open === "prompt" && (spec ? html`<ol class="refs">${spec.images.map((u, i) => html`<li title=${"Image " + (i + 1)}><img src=${u} alt=""/><b>${i + 1}</b></li>`)}</ol>
          <div class="prompt">${spec.prompt.split("\n").map((line) => html`<p>${chips(line)}</p>`)}</div>` : html`<p class="subtle">The agent hasn't returned this version's spec.json and request.json.</p>`)}
        ${open === "versions" && html`<ol class="versions">${spec.versions.map(([v, st, said]) => html`<li><b class="mono">${v}</b>${Status(st)}${said && html`<span class="subtle">${said}</span>`}</li>`)}</ol>`}
        ${open === "request" && html`<pre class="mono">${JSON.stringify({ model: spec.model, content: [{ type: "text", text: spec.prompt.slice(0, 60) + "…" }, ...spec.images.map((u) => ({ type: "image_url", image_url: { url: "@" + u }, role: "reference_image" }))], duration: spec.seconds, ratio: spec.ratio, resolution: spec.resolution }, null, 2)}</pre>`}
        ${open === "details" && html`<dl><dt>Kind</dt><dd>${node.role}</dd><dt>Version</dt><dd class="mono">${node.ver}</dd><dt>Used by</dt><dd>${uses || "—"}</dd><dt>Reads</dt><dd>${reads || "—"}</dd>${node.problems && node.problems.length ? html`<dt>Why</dt><dd>${node.problems.map((said) => html`<span class="why">${said}</span>`)}</dd>` : null}</dl>`}
      </div>
      <div class="nfoot">
        ${spec && html`<span class="pill mono">${spec.model}</span><span class="pill mono">${[spec.ratio, spec.resolution, spec.seconds + " s"].join(" · ")}</span>`}
        <span class="grow"></span>
        <button class="btn sm" disabled title="Phase 2: the agent makes every item for now">${I("upload")}Upload</button>
        <button class="btn sm" disabled title="Phase 2: the agent makes every item for now">${I("sparkle")}Generate</button>
      </div>`}
    </div>`;
  }

  function Canvas() {
    const ref = useRef(null);
    const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
    const { x, y, k } = S.cam;
    // B5: a picked node is placed under the pills with its bar above it and room for its panel below (or beside, docked).
    const PILLS = 64, BAR = 46, PANEL = 220, DOCKED = 440;
    const place = (n, kk = k) => { const el = ref.current; if (!el) return { k: kk, x, y };
      const tall = BAR + ((n.h || 196) + 26) * kk + (S.dock === "right" ? 0 : 10 + PANEL);
      const top = Math.max(PILLS, PILLS + (el.clientHeight - PILLS - tall) / 2);
      return { k: kk, x: (el.clientWidth - (S.dock === "right" ? DOCKED : 0)) / 2 - (n.x + (n.w || 300) / 2) * kk, y: top + BAR - (n.y - 26) * kk }; };
    // yurun: a picked node zooms in to a readable size (D37). Figma's Zoom to selection (Shift+2), as React Flow's
    // fitView({ nodes }) does it: the node fills the room its bar and panel leave, up to 150%. Esc or Fit returns.
    const readable = (n) => { const el = ref.current; if (!el) return k;
      const roomH = el.clientHeight - PILLS - BAR - (S.dock === "right" ? 0 : 10 + PANEL) - 16, roomW = el.clientWidth - (S.dock === "right" ? DOCKED : 0) - 80;
      return Math.min(1.5, roomH / ((n.h || 196) + 26), roomW / (n.w || 300)); };
    const pick = (n, at) => set({ sel: n.id, at: at || null, follow: false, camBack: S.camBack || S.cam, cam: place(n, readable(n)) });
    const letGo = () => set({ sel: null, cam: S.camBack || S.cam, camBack: null });
    // Arriving with a pick (Back from Lineage or Assets, or the List's selection) places it, as a click would.
    useEffect(() => { const n = S.sel && byId[S.sel]; if (n) pick(n, S.at); }, []);
    useEffect(() => {
      if (!S.follow) return;
      const order = ["seg01", "seg03", "seg04", "seg02"]; let i = 0;
      const t = setInterval(() => { if (!S.follow || S.screen !== "canvas") return; const n = byId[order[i++ % order.length]]; const el = ref.current; if (!el) return;
        set({ cam: place(n, 0.62), sel: n.id }); }, 6000);
      return () => clearInterval(t);
    }, [S.follow]);
    useEffect(() => {
      // The canvas's keys, as infinite-canvas's shortcuts, read-only ones only (docs/shortcuts.md there): not while typing.
      const kd = (e) => { if (/textarea|input/i.test(e.target.tagName) || S.screen !== "canvas") return; const mod = e.metaKey || e.ctrlKey;
        if (!mod && e.key === "v") set({ tool: "move" }); else if (!mod && e.key === "h") set({ tool: "hand" });
        else if (!mod && e.key === "?") set({ keysOpen: true });
        else if (e.key === "Escape") { set({ toolOpen: false, zoomOpen: false, keysOpen: false }); if (S.sel) letGo(); }
        else if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoom(1.15); } else if (mod && e.key === "-") { e.preventDefault(); zoom(0.85); }
        else if (mod && e.key === "0") { e.preventDefault(); fit(); } };
      window.addEventListener("keydown", kd); return () => window.removeEventListener("keydown", kd);
    }, []);
    const down = (e) => { if (e.target.closest(".card, button")) return; set({ panning: { sx: e.clientX, sy: e.clientY, x, y }, follow: false }); };
    const move = (e) => { const p = S.panning; if (p) set({ cam: { ...S.cam, x: p.x + e.clientX - p.sx, y: p.y + e.clientY - p.sy } }); };
    const up = () => S.panning && set({ panning: null });
    const wheel = (e) => { e.preventDefault(); const r = ref.current.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
      const nk = Math.min(1.6, Math.max(0.25, k * (e.deltaY < 0 ? 1.1 : 0.9))); set({ follow: false, cam: { k: nk, x: mx - (mx - x) * (nk / k), y: my - (my - y) * (nk / k) } }); };
    const zoom = (f) => set({ follow: false, cam: { ...S.cam, k: Math.min(1.6, Math.max(0.25, k * f)) } });
    const fit = () => set({ follow: false, camBack: null, cam: { x: 40, y: 96, k: 0.62 } });
    const wire = ([a, b]) => { const A = byId[a], B = byId[b]; const x1 = A.x + A.w, y1 = A.y + A.h / 2, x2 = B.x, y2 = B.y + B.h / 2; const m = (x1 + x2) / 2;
      return html`<path class=${S.sel === a || S.sel === b ? "hot" : ""} d=${`M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`}/>`; };
    const sel = S.sel && byId[S.sel];
    return html`<div class="main">
      <${TopBar} crumbs=${[own.drama(), ...(sel && sel.kind === "seg" ? [own.ep(), sel.id + (S.at ? " · " + S.at.kind + " " + S.at.ver : "")] : sel && homeTab(sel.id) ? [own.assets(), own.tab(homeTab(sel.id)), sel.label + " · " + sel.ver] : ["EP006"])]}/>
      <div class="body" style="position:relative">
        <div class=${"board " + (S.panning ? "panning" : "")} style=${`--grid:${48 * k}px;--gx:${x % (48 * k)}px;--gy:${y % (48 * k)}px;--dot:${k < 0.12 ? 0.8 : 1.15}px`} ref=${ref} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerLeave=${up} onWheel=${wheel}>
          <div class="layer" style=${`transform:translate(${x}px,${y}px) scale(${k})`}>
            <svg class="wires" width="1" height="1">${EDGES.map(wire)}</svg>
            ${NODES.filter((n) => n.kind === "group").map((g) => html`<div class="group" style=${`left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px`}><span class="gl">${g.label}</span></div>`)}
            ${NODES.filter((n) => n.kind !== "group" && n.kind !== "seg").map((n) => html`<div class=${"cnode " + (S.sel === n.id ? "sel" : "")} style=${`left:${n.x}px;top:${n.y - 26}px;width:${n.w}px`}>
              <div class="lab">${I(n.kind === "cast" ? "user" : n.kind === "place" ? "image" : "cube")}<span class="name">${n.label}</span><span class="model">${n.model}</span>${n.st !== "accepted" ? Status(n.st) : outOfDate(n) && Status("stale")}</div>
              <div class="card" style=${`height:${n.h}px`} onClick=${() => pick(n)}><img src=${n.pic} alt="" draggable="false"/></div></div>`)}
            ${NODES.filter((n) => n.kind === "seg").map((n) => html`<div class=${"segnode cnode " + (S.sel === n.id ? "sel" : "")} style=${`left:${n.x}px;top:${n.y - 26}px`}>
              <div class="lab">${I("film-strip")}<span class="name">${n.label}</span><span class="subtle" style="font-weight:500">${n.seg.s} s</span><span class="model">${n.model}</span>${n.st !== "accepted" && Status(n.st)}</div>
              <div class="card">
                ${n.seg.board ? html`<button class=${"board-img" + (S.sel === n.id && pickedAt(n.seg).kind === "storyboard" ? " on" : "")} aria-label=${n.label + " storyboard v1"} onClick=${() => pick(n, { kind: "storyboard", ver: "v1" })}><img src=${n.seg.board} alt="" draggable="false"/><span>board v1</span></button>` : html`<div class="none">board accepted</div>`}
                ${n.seg.still ? html`<button class=${"take-tile" + (S.sel === n.id && pickedAt(n.seg).kind === "take" ? " on" : "")} aria-label=${n.label + " take " + n.seg.take} onClick=${() => pick(n, { kind: "take", ver: n.seg.take })}><img src=${n.seg.still} alt="" draggable="false"/><span>${n.seg.take}</span><span class="play"><i>${I("play")}</i></span></button>
                  ${/* The take's inline player (yurun, D39): shown on the picked take and on hover, in media-chrome's control bar order,
                     as Premiere's, Frame.io's and YouTube's: play, time, the slider, duration, sound, full screen. Muted until the sound is on. */ ""}
                  <div class=${"vbar" + (S.sel === n.id && pickedAt(n.seg).kind === "take" ? " shown" : "")} role="group" aria-label=${"Play " + n.label + " take " + n.seg.take}>
                    <button class="vb" aria-label="Play" onClick=${() => toast("Plays the take here, muted until you turn the sound on.")}>${I("play")}</button>
                    <span class="vt">0:00</span><span class="vtrack"><i></i></span><span class="vt">0:${String(n.seg.s).padStart(2, "0")}</span>
                    <button class="vb" aria-label="Unmute" onClick=${() => toast("Turns the take's sound on.")}>${I("speaker-slash")}</button>
                    <button class="vb" aria-label="Enter fullscreen mode" onClick=${() => toast("Plays the take full screen.")}>${I("corners-out")}</button></div>` : html`<div class="none">${n.seg.take} accepted</div>`}</div></div>`)}
          </div>
        </div>
        <div class="ctop"><${EpisodeViews}/><button class="follow" aria-pressed=${String(S.follow)} onClick=${() => set({ follow: !S.follow })}>${S.follow && html`<span class="live"></span>`}${S.follow ? "Following the agent" : "Follow the agent"}</button>
          <span class="grow"></span><${ProjectChips}/></div>
        ${S.dramaStop && html`<div style="position:absolute;left:0;right:0;top:60px"><${StopBanner}/></div>`}
        ${sel && (() => {
          // Above the node its action bar. Its panel goes where the board has room, never over the node or its bar: under
          // the node, else above the bar, else docked right (Codex re-review F: the Case file's panel covered its own bar).
          const W = 560, MIN = 180, bw = ref.current ? ref.current.clientWidth : 1100, bh = ref.current ? ref.current.clientHeight : 800;
          const cx = x + (sel.x + (sel.w || 300) / 2) * k, top = y + (sel.y - 26) * k, bottom = y + (sel.y + (sel.h || 196)) * k;
          const barTop = Math.max(PILLS, top - BAR), left = Math.max(12, Math.min(bw - W - 12, cx - W / 2));
          const below = bh - bottom - 10 - 12, above = barTop - 8 - PILLS;
          const at = S.dock === "right" ? "" : below >= MIN ? `top:${bottom + 10}px;max-height:${below}px` : above >= MIN ? `bottom:${bh - barTop + 8}px;max-height:${above}px` : null;
          const uses = EDGES.filter((e) => e[0] === sel.id).map((e) => e[1]).join(", "), reads = EDGES.filter((e) => e[1] === sel.id).map((e) => byId[e[0]].label).join(", ");
          const home = homeTab(sel.id), stage = sel.seg ? pickedAt(sel.seg) : null, gid = window.EXTRA.lineageOf(sel.id, stage && stage.kind), from = "Canvas · " + sel.label + (stage ? " · " + stage.kind + " " + stage.ver : "");
          return html`<div class="nbar" role="toolbar" aria-label=${"Act on " + sel.label} style=${`left:${Math.max(12, cx - 150)}px;top:${barTop}px`}>
              ${home
                // A reference's home is Assets: the canvas links there, with no second copy of its review (§16).
                ? html`<button class=${"btn sm " + (sel.st === "you" ? "primary" : "ghost")} onClick=${() => openHome(sel.id, from)}>${sel.st === "you" ? "Review in Assets" : "Open in Assets"}</button>`
                : html`${sel.st === "you" && (!stage || stage.kind === "take") ? html`<button class="btn sm primary" onClick=${() => go("review")}>Review</button>` : null}
              <button class="ibtn" title="Send back" aria-label="Send back" onClick=${() => toast("Send back: say why, and the agent redoes it.")}>${I("arrow-counter-clockwise")}</button>
              <button class="ibtn" title="Note" aria-label="Note" onClick=${() => toast("A note for the agent at work on it.")}>${I("note-pencil")}</button>`}
              <button class="ibtn" title=${gid ? "Lineage" : "Lineage: this sample traces seg03 and what it reads"} aria-label="Lineage" disabled=${!gid} onClick=${() => openLineage(gid, from)}>${I("tree-structure")}</button>
              <button class="ibtn" title="Download" aria-label="Download" onClick=${() => toast("Downloads the picture.")}>${I("download-simple")}</button></div>
            <${NodePanel} node=${sel} uses=${uses} reads=${reads} docked=${at === null} style=${at ? `left:${left}px;width:${W}px;${at}` : ""}/>`;
        })()}
        ${S.minimap && html`<div class="minimap" aria-hidden="true">${NODES.filter((n) => n.kind !== "group").map((n) => html`<i style=${`left:${8 + n.x * 0.11}px;top:${8 + n.y * 0.08}px;width:${n.w * 0.11}px;height:${n.h * 0.08}px`}></i>`)}
          <b style=${`left:${8 - x * 0.11 / k}px;top:${8 - y * 0.08 / k}px;width:${(ref.current ? ref.current.clientWidth : 900) * 0.11 / k}px;height:${(ref.current ? ref.current.clientHeight : 600) * 0.08 / k}px`}></b></div>`}
        ${S.toolOpen && html`<div class="menu tmenu" role="menu" aria-label="Tools">
          ${[["move", "cursor", "Move", "V"], ["hand", "hand", "Hand", "H"]].map(([k, ic, l, key]) => html`<button class="mi row" role="menuitemradio" aria-checked=${String(S.tool === k)} onClick=${() => set({ tool: k, toolOpen: false })}>${I(ic)}<b>${l}</b><kbd>${key}</kbd></button>`)}</div>`}
        ${S.zoomOpen && html`<div class="menu zmenu" role="menu" aria-label="Zoom">
          <label class="zin"><input type="number" min="5" max="800" value=${Math.round(k * 100)} aria-label="Zoom, in percent" onKeyDown=${(e) => { if (e.key === "Enter") { const v = Math.min(800, Math.max(5, +e.target.value || 100)); set({ cam: { ...S.cam, k: v / 100 }, zoomOpen: false }); } }}/><span>%</span></label>
          <button class="mi row" role="menuitem" onClick=${() => { zoom(1.15); set({ zoomOpen: false }); }}><b>Zoom in</b><kbd>⌘ +</kbd></button>
          <button class="mi row" role="menuitem" onClick=${() => { zoom(0.85); set({ zoomOpen: false }); }}><b>Zoom out</b><kbd>⌘ −</kbd></button>
          <button class="mi row" role="menuitem" onClick=${() => { fit(); set({ zoomOpen: false }); }}><b>Fit to screen</b><kbd>⌘ 0</kbd></button>
          <hr/>
          ${[50, 100, 800].map((v) => html`<button class="mi row" role="menuitem" onClick=${() => set({ cam: { ...S.cam, k: v / 100 }, zoomOpen: false })}><b>Zoom to ${v}%</b></button>`)}</div>`}
        <div class="ctool" role="toolbar" aria-label="Canvas">
          <button class="ibtn" title=${S.tool === "hand" ? "Hand (H)" : "Move (V)"} aria-label="Tool" aria-haspopup="menu" aria-expanded=${String(S.toolOpen)} onClick=${() => set({ toolOpen: !S.toolOpen, zoomOpen: false })}>${I(S.tool === "hand" ? "hand" : "cursor")}</button>
          <i class="sep"></i>
          <button class="ibtn" title="Fit to screen" aria-label="Fit to screen" onClick=${fit}>${I("frame-corners")}</button>
          <button class="ibtn" title="Zoom out" aria-label="Zoom out" onClick=${() => zoom(0.85)}>${I("minus")}</button>
          <button class="z" aria-label="Zoom" aria-haspopup="menu" aria-expanded=${String(S.zoomOpen)} onClick=${() => set({ zoomOpen: !S.zoomOpen, toolOpen: false })}>${Math.round(k * 100)}%</button>
          <button class="ibtn" title="Zoom in" aria-label="Zoom in" onClick=${() => zoom(1.15)}>${I("plus")}</button>
          <button class=${"ibtn " + (S.minimap ? "on" : "")} title="Minimap" aria-label="Minimap" onClick=${() => set({ minimap: !S.minimap })}>${I("map-pin")}</button>
          <button class="ibtn" title="Lay out again" aria-label="Lay out again" onClick=${() => { set({ cam: { x: 40, y: 96, k: 0.62 } }); toast("Every node back where drama-cli's layout puts it."); }}>${I("tree-structure")}</button>
          <button class="ibtn" title="Shortcuts (?)" aria-label="Shortcuts" onClick=${() => set({ keysOpen: true })}>${I("question")}</button></div>
        ${S.keysOpen && html`<div class="scrim" onClick=${(e) => { if (e.target === e.currentTarget) set({ keysOpen: false }); }}>
          <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="keys-t"><h2 id="keys-t">Canvas shortcuts</h2>
            <p class="subtle">Copy, paste, delete, group and undo come with phase 2, when the canvas makes items by hand.</p>
            <dl class="keys">${[["V", "Move: pick and drag items, draw a box to pick several"], ["H", "Hand: drag the board"], ["Space + drag", "Drag the board, whatever the tool"], ["⌘ +  /  ⌘ −", "Zoom in / out"], ["⌘ 0", "Fit to screen"], ["⌘ A", "Pick every item"], ["Esc", "Let go of the pick, close its panel and zoom back"], ["?", "This list"]].map(([key, what]) => html`<dt><kbd>${key}</kbd></dt><dd>${what}</dd>`)}</dl>
            <div class="acts"><button class="btn" onClick=${() => set({ keysOpen: false })}>Close</button></div></div></div>`}
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
    // IA draft (Codex's re-review D2): every change to the draft is a step: a verdict, a reason, the words. Typing on in
    // the same field is one step. Undo puts the draft back as it was before the last step; Reset back to nothing.
    const snap = () => ({ verdict: S.verdict, reason: S.reason, words: S.words || "" });
    const step = (field, change) => set({ ...change, rhist: S.rfield === field && field !== "verdict" ? S.rhist || [] : [...(S.rhist || []), snap()], rfield: field });
    const setV = (val) => step("verdict", { verdict: { ...S.verdict, [tk.id]: S.verdict[tk.id] === val ? undefined : val } });
    // What the draft changes, counted by item (a take with a verdict or a reason) and the words, not by clicks.
    const changed = P.takes.filter((t) => S.verdict[t.id] || (S.reason[t.id] || "").trim()).length + ((S.words || "").trim() ? 1 : 0);
    // B2: a review goes draft → sending → sent (the agent is on it, read only), or failed (the draft kept, to send
    // again under the same submission) or unknown (being checked; it is never sent twice). Nothing sent stays a draft.
    // Codex round 3 (fix 1): the review is one submission (Submission), never sent twice; the draft locks once it may have arrived.
    const sendState = (S.subs || {}).review;
    const locked = !!sendState && sendState !== "failed";
    const sendIt = () => { set({ rfield: null }); submit("review"); };
    // The first send and Send again ask the same way: the draft may have changed in between.
    const confirmSend = () => set({ dialog: { title: "Send your review?", body: P.takes.map((t) => `${t.seg} ${t.take}: ${S.verdict[t.id] === "accept" ? "Accept" : S.verdict[t.id] === "note" ? "Accept with note" : "Send back — “" + (S.reason[t.id] || "").trim() + "”"}`).join("\n") + (P.takes.some((t) => S.verdict[t.id] === "back") ? "\nSending back shoots new takes: that spends." : ""), ok: "Send review", cancel: "Keep reviewing", run: sendIt } });
    useEffect(() => {
      const kd = (e) => { if (/textarea|input/i.test(e.target.tagName) || S.screen !== "review" || ((S.subs || {}).review && (S.subs || {}).review !== "failed")) return;
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
    // IA r2 (§16): the room decides; it is no home. A take, its versions and an accepted take live in their segment in
    // EP006's List, and a character in Assets: the room links there, landing on it, and Back returns to the room.
    const seg = P.scenes.flatMap((sc) => sc.segs).find((g) => g.id === tk.seg);
    const inSeg = (id, ver, label) => openStage(id, { kind: "take", ver }, label);
    const here = "Review · " + tk.seg + " " + tk.take;
    return html`<div class="main">
      <${TopBar} crumbs=${[own.drama(), own.ep(), here]} right=${html`<span class="muted hide-s" style="font-size:12px">${P.takes.length - done} of ${P.takes.length} waiting</span>`}/>
      <${StopBanner}/>
      <div class="room">
        <nav class="reel" aria-label="Takes waiting">
          <h3>EP006 · waiting for you</h3>
          ${P.takes.map((t, i) => html`<button class="ritem" aria-current=${String(i === S.ti)} onClick=${() => set({ ti: i, showPrev: false })}>
            <img src=${t.poster} alt=""/><span><b>${t.seg} · ${t.take}</b><small>${t.scene.split(" · ").slice(0, 1)} · ${t.dur} s</small>
            ${S.verdict[t.id] ? Status(S.verdict[t.id] === "accept" ? "accepted" : S.verdict[t.id] === "back" ? "back" : "accepted", S.verdict[t.id] === "accept" ? "Accept" : S.verdict[t.id] === "back" ? "Send back" : "Accept with note") : S.watched[t.id] ? Status("you", "Watched") : Status("you", "Not watched")}</span></button>`)}
          <h3 style="margin-top:14px">Accepted in EP006</h3>
          <button class="ritem" title="Open seg02 in EP006's List" onClick=${() => inSeg("seg02", "t01", "Review · EP006 takes")}><img src=${"img/cover-ep6.jpg"} alt=""/><span><b>seg02 · t01</b><small>Scene 1 · 15 s</small>${Status("accepted")}</span></button>
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
          <div class="ihead"><b>EP006 ${tk.seg} · take ${tk.take}</b><small>${tk.scene}</small>
            <button class="btn sm" onClick=${() => inSeg(tk.seg, tk.take, here)}>Open ${tk.seg} in EP006</button></div>
          <div class="iscroll">
            <div class="isec"><h4>What you asked last time</h4><div class="asked">“${tk.prev.said}”</div>
              <button class="prevtake" onClick=${() => set({ showPrev: !prev })}><img src=${tk.prev.poster} alt=""/><span><b class="mono" style="font-size:12px">${tk.prev.take} · sent back by you</b><small class="muted" style="display:block;font-size:11.5px">${prev ? "Showing it on the stage" : "Play it on the stage to compare"}</small></span></button></div>
            <div class="isec"><h4>Take</h4><dl class="kv"><dt>Length</dt><dd>${tk.dur} s planned · ${tk.dur} s shot</dd><dt>Spec</dt><dd>${P.project.spec}</dd><dt>Episode so far</dt><dd title=${SPENT_COVERS}>${money(P.eps[5].spent)} spent</dd></dl></div>
            <div class="isec"><h4>In frame</h4>${seg.cast.map((id) => P.cast.find((c) => c.id === id)).map((c) => html`<button class="lrow" title=${"Open " + c.name + " in Assets"} onClick=${() => openHome(c.id, here)}>${c.name}${I("caret-right")}</button>`)}</div>
            <div class="isec"><h4>Shots</h4><ol class="shots">${tk.shots.map((s, i) => html`<li><span>${String(i + 1).padStart(2, "0")}</span>${s}</li>`)}</ol></div>
            <div class="isec" style="border-bottom:0"><h4>Who decides</h4><p class="muted" style="margin:0;font-size:12.5px;line-height:1.55">You watch every video version (Take) and decide. No model checks a Take for you. Accept unlocks once you have watched it to the end.</p></div>
          </div>
          <div class="verdict">
            <div class="vrow">
              <button class="vbtn acc" aria-pressed=${String(v === "accept")} disabled=${!watched || locked} title=${watched ? "Accept (A)" : "Watch the take to the end first"} onClick=${() => setV("accept")}>${I("check")}Accept</button>
              <button class="vbtn back" aria-pressed=${String(v === "back")} disabled=${locked} onClick=${() => setV("back")}>${I("arrow-counter-clockwise")}Send back</button>
              <button class="vbtn note" aria-pressed=${String(v === "note")} disabled=${!watched || locked} title="Accept, with a remark kept with the accepted take (N)" onClick=${() => setV("note")}>${I("note-pencil")}Accept with note</button></div>
            ${needsWords && html`<textarea readonly=${locked} placeholder=${v === "back" ? "Why it goes back (required). The agent shoots again with your words." : "Your remark, kept with the accepted take."} value=${S.reason[tk.id] || ""} onInput=${(e) => step("reason:" + tk.id, { reason: { ...S.reason, [tk.id]: e.target.value } })}></textarea>`}
            <span class="hint">${I(watched ? "check-circle" : "clock")}${watched ? "Watched to the end." : `Watched ${Math.round(seen)}% · Accept unlocks at the end.`}${v === "back" && " Sending back may shoot a new take."}</span>
            <span class="hint subtle">Keys: Space play · A accept · B send back · N accept with note · ↑↓ next take</span>
          </div>
          <div style="padding:10px 16px 0;border-top:1px solid var(--border);background:var(--surface-dim)"><input class="search" style="width:100%;height:32px" readonly=${locked} placeholder="Your words for the record, e.g. Approved. seg03 opens on Luca." value=${S.words || ""} onInput=${(e) => step("words", { words: e.target.value })}/></div>
          ${locked
            ? html`<div class="sendbar sent"><${Submission} id="review" to="EP006's agent" onSend=${confirmSend} kept="Your draft is kept."/>
                ${sendState === "sent" && html`<span class="muted" style="font-size:12px">Your decisions are kept as sent; to change one, tell the agent in the panel.</span>`}</div>`
            : html`<div class="sendbar">
            ${sendState === "failed" && html`<${Submission} id="review" to="EP006's agent" onSend=${confirmSend} kept="Your draft is kept."/>`}
            <span class="pips">${P.takes.map((t) => html`<i class=${S.verdict[t.id] === "accept" ? "a" : S.verdict[t.id] === "back" ? "b" : S.verdict[t.id] === "note" ? "n" : ""}></i>`)}</span>
            <span class="muted grow" style="font-size:12px">${done} of ${P.takes.length} decided${changed ? html` · <b style="color:var(--text-primary)">Draft: ${changed} ${changed === 1 ? "item" : "items"} changed</b>` : ""}</span>
            <button class="btn sm ghost" title="Undo the last change" disabled=${!(S.rhist || []).length} onClick=${() => { const h = [...S.rhist], last = h.pop(); set({ rhist: h, rfield: null, ...last }); }}>Undo</button>
            <button class="btn sm ghost" title="Discard the whole draft" disabled=${!changed} onClick=${() => { set({ verdict: {}, reason: {}, words: "", rhist: [], rfield: null }); toast("Draft discarded. Nothing was sent."); }}>Reset</button>
            ${sendState !== "failed" && html`<button class="btn primary sm" disabled=${done < P.takes.length} onClick=${confirmSend}>Send review</button>`}</div>`}
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
  /* The prototype's own controls (a screen, State, Outcome, theme): not the app. Collapsed by default in the bottom-left
     corner, so a walkthrough uses only the app's own navigation (round 3: the old top strip read as app navigation). */
  function Proto() {
    if (!S.proto) return html`<button class="protobtn" aria-label="Prototype controls" title="Prototype controls: not part of the app" aria-expanded="false" onClick=${() => set({ proto: true })}>${I("sliders-horizontal")}Prototype</button>`;
    return html`<section class="proto" aria-label="Prototype controls">
      <div class="ph"><b>Prototype controls</b><span class="grow"></span><button class="ibtn" aria-label="Close the prototype controls" aria-expanded="true" onClick=${() => set({ proto: false })}>${I("x")}</button></div>
      <p>Not part of the app: they set what the sample shows. Phase 1: steering, and editing the cut's spec · Canvas and Lineage read-only · sample project, our own test pictures.</p>
      <span class="pl">Screen</span><div class="seg wrap" role="group" aria-label="Screen">${[["home", "Home"], ["reviews", "Reviews"], ["upload", "Upload"], ["analyzing", "Analyzing"], ["fountain", "Fountain"], ["script", "Script"], ["story", "Story"], ["episodes", "Episodes"], ["episode", "Episode"], ["canvas", "Canvas"], ["graph", "Graph"], ["review", "Review"], ["cut", "Cut"], ["delivery", "Delivery"], ["outofdate", "Out of date"]].map(([k, l]) => html`<button aria-pressed=${String(S.screen === k)} onClick=${() => go(k)}>${l}</button>`)}</div>
      <label class="select">State<select aria-label="State" value=${S.state} onChange=${(e) => { const v = e.target.value; set({ state: v, dramaStop: v === "stopping" ? "stopping" : v === "stopped" ? "stopped" : null }); }}>
        ${[["normal", "Normal"], ["fresh", "Nothing out of date"], ["cutnewer", "Cut: a newer cut exists"], ["cutinputs", "Cut: draft inputs changed"], ["cutrefused", "Cut: drama-cli refuses the edit"], ["nostop", "No stop yet"], ["stopping", "Stopping"], ["stopped", "Stopped"], ["redline", "Red line"], ["budget", "Refused (no code)"], ["cap", "Cap reached"], ["env", "Pine access denied"]].map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></label>
      <label class="select" title="What a send, a check or a Reconcile finds">Outcome<select aria-label="Outcome" value=${S.outcome} onChange=${(e) => set({ outcome: e.target.value })}>
        ${[["ok", "Goes through"], ["refused", "Not submitted (the engine says)"], ["unknown", "No answer"]].map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></label>
      <div class="seg" role="group" aria-label="Theme">${[["dark", "Dark", "moon-stars"], ["light", "Light", "sun-dim"]].map(([k, l, ic]) => html`<button aria-pressed=${String(S.theme === k)} onClick=${() => set({ theme: k })}>${I(ic)}${l}</button>`)}</div>
    </section>`;
  }
  function App() {
    applyTheme();
    const sc = S.screen;
    const main = { home: html`<${Home}/>`, reviews: html`<${Reviews}/>`, episodes: html`<${Episodes}/>`, canvas: html`<${Canvas}/>`, review: html`<${Review}/>` }[sc] || html`<${window.EXTRA[sc]}/>`;
    return html`<div class="app"><${Rail}/><${Side}/>${main}</div><${Proto}/><${Dialog}/>
      <div class="toasts" aria-live="polite">${S.toasts.map((t) => html`<div class="toast">${t.text}${t.action && html`<button onClick=${t.action.run}>${t.action.label}</button>`}</div>`)}</div>`;
  }
  window.PD = { html, I, S, set, go, own, jump, openHome, openStage, openLineage, stagesOf, pickedAt, toast, money, Status, TopBar, StopBanner, EpisodeViews, ProjectChips, AgentPanel, SPENT_COVERS, useEffect, useRef, Mark, draw, Submission, submit, recheck };
  // screens.js draws first, once its screens are registered.
})();
