/* Pine Drama Studio, pro direction: Home, Episodes board, Canvas and the take Review room.
   Phase 1 views and decides (D70): Accept or Send back on the exact item, Stop, the cut's edit, and the agent chat for the rest. */
(() => {
  const { html, render, useEffect, useRef } = window.htmPreact;
  const root = document.getElementById("root");
  // The "Loading…" placeholder goes before the first render: Preact appends beside it, and the leftover line made the
  // page 66 px taller than the window, so a scrollIntoView shifted the whole frame up.
  root.replaceChildren();
  const SPENT_COVERS = "Agent turns and video, priced when each turn ends.";
  const SCREENS = ["home", "reviews", "upload", "script", "story", "episodes", "canvas", "graph", "review", "cut", "delivery", "outofdate"];
  const hash = (location.hash || "").slice(1);
  const S = {
    screen: SCREENS.includes(hash) ? hash : "home", theme: "dark", tab: "all", filter: "all", waitFor: null, pin: null,
    dialog: null, toasts: [], dramaStop: null, draft: "", drafts: {}, drawer: false,
    // The conversation each session has had: the maker's words and decisions, the one log (D70).
    chats: {},
    // The agent sidebar is open or collapsed to its icon, the viewer's choice kept on this browser; until they choose,
    // narrow windows start collapsed (D32).
    agent: (() => { try { const v = localStorage.getItem("studio.agent"); if (v === "open" || v === "closed") return v; } catch (e) { /* storage may be blocked */ } return window.matchMedia("(max-width: 1280px)").matches ? "closed" : "open"; })(),
    cam: { x: 40, y: 96, k: 0.62 }, tool: "hand", toolOpen: false, zoomOpen: false, keysOpen: false, sel: null, dock: (() => { try { return localStorage.getItem("studio.canvas.dock") || "under"; } catch (e) { return "under"; } })(), follow: true, panning: null, minimap: true,
    ti: 0, playing: false, t: 0, watched: {}, maxT: {}, verdict: {}, reason: {}, showPrev: false, subs: {}, outcome: "ok", over: false,
    state: "normal", proto: false, file: null, preset: null, len: "90", reviewing: "every", budget: "1000", sview: null, ssel: null, sver: null, sform: null, sdraft: "", sdec: null, words: "", stab: "bible", cards: {}, cardWhy: {}, gsel: "ep6seg03", dims: {}, cutT: 0, cutPlaying: false, cutNotes: null, noteDraft: "", cutV: null, cutWhy: "",
  };
  let drawing = false;
  const draw = () => { if (!drawing) { drawing = true; requestAnimationFrame(() => { drawing = false; render(html`<${App}/>`, root); }); } };
  const set = (p) => { Object.assign(S, typeof p === "function" ? p(S) : p); draw(); };
  const go = (screen) => { set({ screen, sel: null, playing: false, drawer: false, from: null, at: null, asel: null, scriptEp: null, roomAgent: null }); try { history.replaceState(null, "", "#" + screen); } catch (e) { /* the hash is a convenience */ } };
  /* IA draft (F): below 1100 px the drama tree is a drawer the rail's menu button opens. The agent has one form everywhere,
     a right sidebar, open or collapsed to its icon (setAgent). */
  const narrow = () => window.matchMedia("(max-width: 1100px)").matches;
  /* IA r2 (§16): each object has one home. A link lands on the home with the object selected (S.asel in Assets, S.sel on
     Canvas, S.gsel in Lineage), and remembers where it came from (S.from), so Back returns there. */
  const homeTab = (id) => (P.cast.some((c) => c.id === id) ? "cast" : P.places.some((p) => p.id === id) ? "scenes" : P.props.some((p) => p.id === id) ? "props" : null);
  const jump = (to, label) => { set({ sel: null, drawer: false, toolOpen: false, zoomOpen: false, roomAgent: null, ...to, from: { screen: S.screen, sel: S.sel, osel: S.osel, asel: S.asel, at: S.at, label } }); try { history.replaceState(null, "", "#" + to.screen); } catch (e) { /* the hash is a convenience */ } };
  /* Codex round 3 (fix 3): a link names the object's kind and version as well as its item (S.at = { kind, ver }), so it
     lands on that version, never on the item's newest. Kinds are drama-cli's lineage kinds (look, plate, prop, blocking,
     first_frame_reference, storyboard, take, cut); a plate's view or a storyboard's style rides along as at.view / at.style. */
  const KIND = { cast: "look", scenes: "plate", props: "prop" };
  const current = (id) => [...P.cast, ...P.places, ...P.props].find((x) => x.id === id);
  const openHome = (id, label, at) => jump({ screen: "story", stab: homeTab(id), asel: id, at: at || { kind: KIND[homeTab(id)], ver: current(id).ver } }, label);
  /* A segment's stage version, on its episode's Canvas, picked. */
  const openStage = (id, at, label) => jump({ screen: "canvas", sel: stageNode(id, at), at }, label);
  /* The Canvas node of a segment's stage (board(): `${seg}/${kind}`), the take when none is named. */
  const stageNode = (seg, at) => `${seg}/${!at ? "take" : at.style === "photoreal" ? "photoreal" : at.kind}`;
  const openLineage = (gid, label) => jump({ screen: "graph", gsel: gid }, label);
  /* Round 3 (Codex, merecdesperez44323-lab): the crumbs say where an object belongs, each ancestor a link to its home; where you came
     from is only ever "Back to …" (BackTo). The drama shows its cover and name first, so it's clear which one is open. */
  const TABS = { cast: "Characters", scenes: "Locations", props: "Props" };
  const own = {
    drama: () => [html`<img class="crumbimg" src=${P.eps[0].cover} alt=""/><span class="ctext" title=${P.project.title}>${P.project.title}</span>`, () => go("episodes")],
    ep: () => ["EP006", () => go("canvas")],
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
  /* merecdesperez44323-lab ("project应该和icon 平铺", "左侧就不需要单独有一个column了"): off a project the studio's nav is the one left
     column, rows of icon and label side by side (liblib); inside a project it is the icon rail (VS Code's activity bar)
     beside the project tree, its labels as tooltips. ☰ opens and closes that column, the same everywhere. */
  // Pine Computer's community, opened in the system browser (the desktop app's window-open handler; a new tab on the web).
  const COMMUNITY = [["https://discord.gg/JxAHeXhvF", "discord-logo", "Pine Computer community"], ["https://x.com/pine_computer", "x-logo", "Pine Computer on X"]];
  const studioPage = () => ["home", "upload", "reviews"].includes(S.screen);
  /* One icon-only rail on every screen (merecdesperez44323-lab chose it: "可以的"; VS Code's activity bar). Each place's
     label is its tooltip and its accessible name, the count in the name too (Apple HIG: icon-only buttons need both;
     WCAG 2.5.3); the current place is the icon's pill. ☰ only below 1100 px, inside a project, where the tree is a drawer. */
  function Rail() {
    const dramas = !["reviews"].includes(S.screen);
    const place = (label, icon, current, onClick, badge) => html`<button class=${"ibtn" + (badge ? " railcount" : "")} title=${label} aria-label=${badge ? label + ", " + badge + " waiting" : label} aria-current=${current ? "page" : "false"} onClick=${onClick}>${I(icon)}${badge && html`<span class="badge">${badge}</span>`}</button>`;
    return html`<nav class="rail" aria-label="Main">
      ${narrow() && !studioPage() && html`<button class="ibtn" aria-label="Show or hide the sidebar" aria-expanded=${String(!!S.drawer)} onClick=${() => set({ drawer: !S.drawer })}>${I("list")}</button><hr/>`}
      ${/* Home: a place to come (a gallery of sample projects), shown and disabled until it exists (D52). */ ""}
      <button class="ibtn" disabled title="Home · coming later: a gallery of sample projects" aria-label="Home, coming later">${I("house")}</button>
      ${place("Projects", "film-strip", dramas, () => go("home"))}
      ${place("Reviews", "list-checks", S.screen === "reviews", () => set({ waitFor: null, screen: "reviews" }), 5)}
      <span class="fill"></span>
      ${/* The foot (D53): Pine Computer's community, and the account with its credits, design-only until Pine's portal API has
         them (sample values). */ ""}
      ${COMMUNITY.map(([href, icon, label]) => html`<a class="ibtn" href=${href} target="_blank" rel="noopener noreferrer" title=${label} aria-label=${label}>${I(icon)}</a>`)}
      <button class="ibtn acctdot" title=${S.state === "spendlimit" ? "Your Pine project · credits used up: top up" : "Your Pine project · credits $184.60"} aria-label="Your Pine project" onClick=${() => toast("Opens the Pine project: credits, Top up.")}>${S.state === "spendlimit" ? I("warning-circle") : html`<span class="av">Y</span>`}</button>
      ${place("Settings", "gear-six", false, () => toast("Settings: notifications, appearance, data."))}
      <div style="margin-top:6px">${Mark()}</div>
    </nav>`;
  }
  function Side() {
    // Off a project the rail is the one column (Rail): no second one.
    if (studioPage()) return null;
    const cur = { episodes: null, episode: "EP006", canvas: "EP006", review: "EP006", cut: "EP006" }[S.screen];
    return html`<aside class=${"side" + (S.drawer ? " drawer-open" : "")} aria-label="Project">
      <div class="head"><button class="proj" onClick=${() => go("home")} title="All dramas"><img src=${P.eps[0].cover} alt=""/><span class="fill"><b>${P.project.title}</b><small>${P.project.episodes} episodes · ${P.project.spec}</small></span>${I("caret-down", "subtle")}</button></div>
      <div class="scroll">
        <button class="navi" aria-current=${S.screen === "script" ? "page" : "false"} onClick=${() => go("script")}>${I("file-text")}Script${(([line, st]) => html`<span class="now">${line}</span><span class=${"dot " + st}></span>`)(window.EXTRA.scriptRow())}</button>
        <button class="navi" aria-current=${S.screen === "story" && (S.stab || "bible") === "bible" ? "page" : "false"} onClick=${() => set({ screen: "story", stab: "bible", asel: null, at: null })}>${I("book-open")}Bible<span class="now">Accepted</span><span class="dot accepted"></span></button>
        <button class="navi" aria-current=${S.screen === "story" && (S.stab || "bible") !== "bible" ? "page" : "false"} onClick=${() => set({ screen: "story", stab: "cast", asel: null, at: null })}>${I("stack")}Assets<span class="cnt">2</span></button>
        <ul class="tree sub">${[["cast", "Characters", P.cast.length], ["scenes", "Locations", P.places.length], ["props", "Props", P.props.length]].map(([k, l, n]) => html`<li><button aria-current=${String(S.screen === "story" && S.stab === k)} onClick=${() => set({ screen: "story", stab: k, asel: null, at: null })}><span class="now">${l}</span><span class="n">${n}</span></button></li>`)}</ul>
        <button class="navi" aria-current=${S.screen === "episodes" ? "page" : "false"} onClick=${() => go("episodes")}>${I("film-strip")}Episodes<span class="cnt">4</span></button>
        <ul class="tree">${P.eps.slice(0, 8).map((e) => html`<li><button aria-current=${String(cur === e.code)} onClick=${() => e.code === "EP006" ? go("canvas") : go("episodes")}>
          <span class="code">${e.code}</span><span class="now">${e.now}</span><span class=${"dot " + e.status} title=${{ you: "Needs you", work: "Working", accepted: "Done", line: "In line" }[e.status]}></span></button></li>
          ${cur === e.code && e.cut && html`<li class="treecut"><button aria-current=${String(S.screen === "cut")} onClick=${() => go("cut")}><span class="code">› Cut</span><span class="now">${e.cut.latest}${e.cut.st === "you" ? " waits for you" : ""}</span><span class=${"dot " + e.cut.st}></span></button></li>`}`)}
          <li style="padding:6px 8px;color:var(--text-subtle);font-size:11.5px">EP009–EP024 · 16 in line</li></ul>
        ${/* merecdesperez44323-lab's Y10: what the dots mean, once, at the tree's foot (Nielsen: recognition rather than recall). */ ""}
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
  /* Pause production (the engine's stopDrama, dramas.ts): nothing new starts, every running Computer stops now, nothing
     more is billed, everything made stays, Resume carries on. A reversible pause, so a secondary button, not red (HIG keeps
     red for destructive actions); it says what is working now, and the facts before it pauses. Paused is one state: the
     chip and Resume, with no banner. The sample: Computer 1 runs EP003 at work. */
  function StopControl() {
    if (S.dramaStop === "stopping") return html`<button class="btn sm" disabled title="Its Computers are stopping: keep the app open until they have.">${I("circle-notch")}Pausing…</button>`;
    if (S.dramaStop === "stopped") return html`<span class="stopped-chip">${I("pause")}Paused</span><button class="btn sm primary" onClick=${resume}>Resume</button>`;
    return html`<button class="btn sm" title="1 Computer working" onClick=${() => set({ dialog: { title: "Pause production of " + P.project.title + "?", body: "The Computer working stops now; its work stops at its last saved pack. Nothing new starts and nothing more is billed. Nothing is deleted. Resume carries on from where each episode stopped.", ok: "Pause production", cancel: "Keep working", run: stopDrama } })}>${I("pause")}Pause production</button>`;
  }
  function stopDrama() { set({ dramaStop: "stopping" }); setTimeout(() => { if (S.dramaStop === "stopping") { set({ dramaStop: "stopped" }); toast(P.project.title + " paused.", { label: "Resume", run: resume }); } }, 5000); }
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
    const ep = ["canvas", "cut"].includes(S.screen) || (S.screen === "graph" && window.EXTRA.lineageInEpisode());
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
        const words = typeof t === "string" ? html`<span class="ctext">${t}</span>` : t, title = typeof t === "string" ? t : undefined;
        return html`${i > 0 && I("caret-right")}${i === crumbs.length - 1 ? html`<b aria-current="page" title=${title}>${words}</b>` : to ? html`<button class="crumblink" title=${title} onClick=${to}>${words}</button>` : html`<span title=${title}>${words}</span>`}`; })}</nav>
      ${/* Where you came from, apart from where it belongs: its own control, in the same place on every page. */ ""}
      <${window.EXTRA.BackTo}/>
      <span class="fill"></span>
      ${right}
      <${ExportMenu}/>
      ${/* IA draft (A1): a studio page (Reviews) acts on no one drama, so it has no Stop or Next review; the queue is the way in. */
        S.screen !== "reviews" && html`<${StopControl}/>
      <button class="btn primary sm" onClick=${() => go("review")} aria-label=${"Next review in " + P.project.title + ", " + n + " waiting"}>Next review <span class="n">${n}</span></button>`}
    </header>`;
  }
  /* What drama-cli says that the maker must read is a message in its session's conversation, drama-cli's and apart from
     the agent's own words (merecdesperez44323-lab, verbatim: "这些 drama-cli说的话， 我们以后是不是统一 就是所有的
     drama-cli说的话都比如放在右边 agent那里啥的？ 这样 user model比较统一啊我觉得"; D70: the UI decides, the chat acts). The page
     keeps one quiet line under its head (SaysLine). Only what drama-cli recorded is drama-cli's: a refusal row, a ready
     version's validate problems. A reason it recorded nowhere (rc5 T4: a screenplay not ready writes no validate.json and
     no refusal row) comes in the agent's own question, as the agent's (ASKS). `open`: the question that carries it waits
     for the maker's answer; once the session ended, it is history. The words are drama-cli's form with example values. */
  const SANDBOX = "/var/lib/sandbox/sessions/amber-grove-f3d957/files/drama";
  const SAID = {
    redline: { id: "said-redline", to: "EP007", code: "RedLine", open: true,
      said: "Bible bible/b0004 is not usable: red line: EP007 scene 4, a guard strikes Luca in the cell on screen. See bible/b0004/bible.md; report it to the person and pass their decision back with drama-cli bible --config drama-cli.cfg.yaml EP007-EP012 --feedback '<their decision>'",
      ask: "drama-cli won't break EP007 down: its scene 4 shows a guard striking Luca in the cell, a red line in the screenplay. It's yours to decide: change the scene in the script, or stop EP007 here. Other episodes carry on." },
    // A refusal drama-cli gives no code of its own (a bare Refused) is shown as it came, never matched on its words.
    budget: { id: "said-budget", to: "EP003", code: "Refused", open: true,
      said: "Budget exceeded: spent 996.40 + reserved 3.20 + this 1.20 > budget 1000.00",
      ask: "drama-cli refused the next take: the drama's budget is spent. Work in flight is waited on and recorded, never sent again. Do you raise the budget, or stop here?" },
    // drama-cli's action for a cap is ask_person (drama_cli/errors.py): the maker answers; the studio invents no one-time allowance.
    cap: { id: "said-cap", to: "EP003", code: "SetLimitExceeded.max_new_versions", open: true,
      said: "episodes/EP003/multi_panel_storyboard/seg06/line-art has had 3 new paid versions after its first, the limit defaults.max_new_versions (3); ask the person before making it again: they lift the limit for that item by raising defaults.max_new_versions in the config, then set it back; then run drama-cli storyboard --config drama-cli.cfg.yaml EP003 seg06",
      ask: "seg06's storyboard has reached drama-cli's limit of new versions. Shall I raise the limit for it once, as drama-cli describes, or stop here?" },
    // On Pine the provider keys are Pine's (doc/drama-cli/module.md): a refusal of access points to the Pine session's access,
    // never to a key the maker sets. drama-cli's AccessDenied.ModuleRuntime is ask_person (drama_cli/pine_runtime_client.py).
    env: { id: "said-env", to: "EP003", code: "AccessDenied.ModuleRuntime", open: true,
      said: "Pine returned HTTP 403: session or generation access is denied; restore access and check the active turn before continuing",
      ask: "Pine refused this session's access, so nothing new was generated. Requests already sent are checked, never sent again. Tell me once your Pine access is back." },
    // rc3 T1: two refusals, with the sandbox's long paths, and the setup stopped after them.
    setup1: { id: "said-setup1", to: "Setup", code: "InvalidParameter.inputs.screenplay", open: false,
      said: `${SANDBOX}/the original.txt has no accepted screenplay version bible can read (${SANDBOX}/screenplay/v1 was checked against another original): accept ${SANDBOX}/screenplay/v2 with drama-cli accept ${SANDBOX}/screenplay v2 --reason <why> --person <their words> --config ${SANDBOX}/drama-cli.cfg.yaml` },
    setup2: { id: "said-setup2", to: "Setup", code: "InvalidParameter.file", open: false,
      said: `${SANDBOX}/rewrite.fountain:41: scene_time: the scene heading's time is '黄昏': write 日 or 夜, and put a finer time in the action after it; fix ${SANDBOX}/rewrite.fountain, never ${SANDBOX}/the original.txt, and validate it again: drama-cli screenplay validate ${SANDBOX}/rewrite.fountain --config ${SANDBOX}/drama-cli.cfg.yaml` },
  };
  const SAYS = { redline: [SAID.redline], budget: [SAID.budget], cap: [SAID.cap], env: [SAID.env], several: [SAID.redline, SAID.cap], ended: [SAID.setup1, SAID.setup2] };
  /* The agent's own question where drama-cli recorded nothing: rc5 T4, a screenplay not ready (an unresolved 日/夜) writes
     no validate.json, so the reason is the agent's words. And a question on an episode with a cut, whose decision, Finish,
     stays on the page beside the line (master and work-04, D70). */
  const ASKS = {
    agentAsks: { id: "ask-setup", to: "Setup", ask: "Before I validate the screenplay: scenes 1-3 and 2-5 say 傍晚, and drama-cli reads only 日 or 夜 in a heading. Which is each, 日 or 夜? You can also attach a corrected screenplay." },
    finishAsks: { id: "ask-finish", to: "EP006", finish: "EP006", ask: "EP006's cut v2 is accepted and nothing waits in it. Shall I finish EP006 with it, or is there more you want changed?" },
  };
  // What waits for the maker's answer, drama-cli's or the agent's own, and what ended; an answer sent ends its question.
  const answered = (m) => (S.answered || {})[m.to];
  const asking = () => [...(SAYS[S.state] || []).filter((m) => m.open), ...(ASKS[S.state] ? [ASKS[S.state]] : [])].filter((m) => !answered(m));
  const ended = () => (SAYS[S.state] || []).filter((m) => !m.open);
  const asks = (to) => asking().some((m) => m.to === to);
  /* A line of drama-cli's as the maker first reads it: its words up to the first "; " or ". ", each path from the
     project's folder. Cut, never reworded: the whole message, paths included, is a click away. Our own rule. */
  const firstLine = (said) => said.split(SANDBOX + "/").join("").split(/; |\. /)[0];
  /* Open in Agent: the sidebar, open (⌥⌘B's toggle), on the session the message is in, scrolled to it. */
  const openInAgent = (m) => {
    if (m.to !== talkTo()) switchTo(m.to === followed() ? null : m.to);
    setAgent("open");
    setTimeout(() => { const el = document.getElementById(m.id); if (el) { el.scrollIntoView({ block: "center" }); el.focus({ preventScroll: true }); } }, 80);
  };
  /* The page's one line, under its head, in the same place on every drama page: a question waits (several are counted,
     the first opened), or the session ended on what drama-cli said. No card; Accept and Send back on an exact item stay
     where they are, and Finish on an episode with a cut stays beside its line. */
  function SaysLine() {
    const open = asking(), done = ended();
    if (open.length) {
      const m = open[0];
      return html`<div class="saysline" role="status">${Status("you", "Waiting for your answer")}
        <span class="fill">${open.length > 1 ? html`${open.length} questions: <b>${open.map((q) => q.to).join(", ")}</b>`
          : html`<b>${m.to}</b> · ${m.said ? html`<span class="muted">drama-cli:</span> ${firstLine(m.said)}` : html`<span class="muted">the agent asks you</span>`}`}</span>
        ${m.finish && html`<button class="btn sm" onClick=${() => toast(m.finish + " is finished with cut v2.")}>Finish ${m.finish} with its latest cut</button>`}
        <button class="linkbtn" onClick=${() => openInAgent(m)}>Open in Agent</button></div>`;
    }
    if (done.length) {
      const m = done[done.length - 1];
      return html`<div class="saysline" role="status">${I("stop")}<span class="fill">Stopped: <b>${m.to}</b> · ${firstLine(m.said)}${done.length > 1 ? html` <span class="muted">and ${done.length - 1} more</span>` : ""}</span>
        <button class="linkbtn" onClick=${() => openInAgent(m)}>see Agent</button></div>`;
    }
    // A pause is one state, the top bar's Paused with Resume: no line for it.
    return null;
  }
  /* One thing drama-cli said, in the conversation: who said it and its code as chips, its first line, and its whole
     words, paths included, collapsed (NodePanel's Why in mono). Open, it waits for the answer in the composer below. */
  function Said({ m }) {
    return html`<div class="msg said" id=${m.id} tabindex="-1" aria-label=${"drama-cli said, " + m.code}>
      <p class="saidhead"><span class="st">${I("info")}drama-cli</span><code>${m.code}</code><span class="fill"></span>${m.open && !answered(m) ? Status("you", "Waiting for your answer") : html`<span class="muted">${m.open ? "Answered" : "Ended"}</span>`}</p>
      <p>${firstLine(m.said)}</p>
      <details class="basedet"><summary>What drama-cli said</summary><span class="why">${m.said}</span></details></div>`;
  }
  /* The episode's head over its Canvas, the episode's one page (D66: merecdesperez44323-lab dropped the
     Segments table, "还不如就直接canvas"): its code and title, its script, and its cut, an object with its own home. */
  function EpisodeHead() {
    const ep = P.eps[5];
    return html`<span class="ephead"><b>${ep.code}</b><span class="muted">${ep.title}</span>
      <button class="btn sm ghost" onClick=${() => jump({ screen: "script", scriptEp: ep.code }, ep.code)}>${I("file-text")}Episode script</button>
      ${ep.cut && html`<button class="btn sm ghost" onClick=${() => go("cut")}>${I("scissors")}Cut ${ep.cut.latest}${Status(ep.cut.st, ep.cut.st === "you" ? "Waits for you" : undefined)}</button>`}</span>`;
  }
  function ProjectChips() {
    return html`<span class="chip" title="The preset this drama is made with. Chosen at upload.">${html`<img class="thumb" src=${P.cast[0].face} alt=""/>`}${P.project.preset}</span>
      <span class="chip plain">${I("frame-corners")}${P.project.spec}</span>
      <span class="chip plain" title=${SPENT_COVERS}>${I("coins")}<span class="mono">${money(P.project.spent)}</span><span class="muted">of $1,000</span></span>`;
  }

  /* ───── agent panel ───── */
  /* IA draft (E): the session the agent panel speaks to. It follows the episode in view (Canvas, its review, its
     cut, Lineage from one of its items); a page with no episode in view follows none, and never guesses one. A pin wins.
     The session's process, messages and composer follow it together; an unsent draft stays with its own session. */
  const inEpisode = () => ["canvas", "review", "cut"].includes(S.screen) || (S.screen === "graph" && window.EXTRA.lineageInEpisode());
  /* Codex round 4, F4: the script, the bible and the shared assets belong to the setup session (D5), so their pages follow
     it, never an episode's. It ended at the handover, and this version doesn't reopen it. */
  // Every drama page has a scope: its episode, else the project's setup (Script, Bible, Assets, and the pages of no one
  // episode: master's decision). The line always names its target; the picker (Pin) changes it to any episode.
  const followed = () => (inEpisode() ? "EP006" : "Setup");
  const talkTo = () => S.pin || followed();
  const whose = (to) => (to === "Setup" ? "the setup session" : to + "'s session");
  /* One dot, one meaning, as the maker's states have it: working while the scope's session runs, needs you while it waits,
     none when no session is open. A message reaches only an open session (POST /api/dramas/:id/messages), so with none
     the line goes and the status says why: the setup handed the project over; an episode is done; or its Computer
     stopped, and Resume, a run control (D70), continues it in a new session with its files. The sample's sessions:
     EP003 runs, EP006 and EP007 wait, EP005's Computer stopped, the setup has handed over, the rest are done. */
  const stateOf = (to) => (S.dramaStop ? "none" : asks(to) ? "waiting" : to === "EP003" ? "running" : to === "EP006" || to === "EP007" ? "waiting" : "none");
  const whyNone = (to) => (to === "Setup" ? (S.state === "ended" ? "The setup stopped after what drama-cli said below. This version can't reopen it." : "The setup handed over the project. This version can't reopen it.")
    : to === "EP005" ? "EP005's Computer stopped. Resume continues it in a new session with its files."
    : to + " is done. This version can't reopen a finished episode.");
  const switchTo = (pin) => { const from = talkTo(), next = pin || followed(); set({ pin, drafts: { ...S.drafts, [from || ""]: S.draft }, draft: (S.drafts || {})[next || ""] || "" }); };
  /* In the review room the picture wins (Codex rc3, C13): the sidebar starts collapsed each time the room opens (go resets
     roomAgent), the maker's toggle there lasts while they stay, and their own choice holds again when they leave. */
  const agentMode = () => (S.screen === "review" ? S.roomAgent || "closed" : S.agent);
  const setAgent = (v) => { if (S.screen === "review") return set({ roomAgent: v }); set({ agent: v }); try { localStorage.setItem("studio.agent", v); } catch (e) { /* storage may be blocked */ } };
  /* The agent's one form (D32 as amended): a right sidebar like VS Code's Secondary Side Bar and Cursor's agent pane. Open,
     it docks beside the page, which narrows, Canvas included; below 1100 px it lays over the page from the right edge,
     still the sidebar. Collapsed, it is its icon: the robot, a ring while a session works, a badge for decisions.
     ⌥⌘B / Ctrl+Alt+B toggles it, VS Code's key for its Secondary Side Bar. Studio pages have no drama, so no agent. */
  function AgentPanel() {
    if (studioPage()) return null;
    const dec = decisions(), to = talkTo(), ep7 = to === "EP007";
    /* The sidebar is the conversation with one session and nothing else (master, from merecdesperez44323-lab: "这里面为什么
       乱七八糟的啥都有？"): Decisions are Reviews', recent work the canvas's and Assets', the next review the top bar's. The
       sample's sessions, each on its Computer (computers.label): Computer 1 runs EP003 (its second session, after
       Computer 2 stopped under its first) and EP006; Computer 2 runs EP007 and ran EP005. */
    // The setup's session runs on Computer 1 while it asks (the sample's agentAsks), as it did before the handover.
    const ON = { Setup: "Computer 1", EP003: "Computer 1", EP006: "Computer 1", EP007: "Computer 2" };
    const OPEN = ["EP003", "EP006", "EP007"];
    const watchName = (code) => { const others = OPEN.filter((c) => c !== code && ON[c] === ON[code]); return "Watch " + ON[code] + "'s desktop" + (others.length ? " (also running " + others.join(", ") + ")" : ""); };
    const stopIt = (code) => set({ dialog: { title: "Stop " + code + "?", body: code === "EP003" ? "4 takes are in flight. They are waited on and recorded, never sent again. The episode stops after them." : "No take is in flight. The episode stops now and can be resumed.", ok: "Stop " + code, danger: true, cancel: "Keep running", run: () => toast(code + " stopped.") } });
    const pageScope = followed();
    // What the maker said or decided before the sample's moment, oldest first: the conversation starts with it.
    const EARLIER = { EP006: ["You sent back EP006 seg01 t01: “He should hold the blanket folded before he speaks.”", "You sent back EP006 seg03 t01: “Too wide at the start; we lose Luca's face.”"] };
    const busy = !S.dramaStop;
    if (agentMode() !== "open") return html`<button class=${"ball" + (busy ? " busy" : "")} aria-expanded="false" title="Open the agent sidebar (⌥⌘B)"
      aria-label=${"Agent" + (to ? ", " + (S.pin ? "pinned to " : "following ") + to : "") + (dec.length ? ", " + dec.length + " decisions wait" : "") + (asking().length ? ", " + asking().length + " waiting for your answer" : "")} onClick=${() => setAgent("open")}>${I("robot")}${dec.length ? html`<span class="badge">${dec.length}</span>` : null}</button>`;
    return html`<aside class="agent" id="agent" aria-label="Agent">
      <div class="ahead"><h2>Agent</h2><span class="fill"></span>
        <button class="ibtn" aria-label="Collapse the agent sidebar" aria-expanded="true" aria-controls="agent" title="Collapse (⌥⌘B)" onClick=${() => setAgent("closed")}>${I("sidebar-simple", "flipx")}</button></div>
      <div class="ascope" role="status">${(() => {
        const st = stateOf(to), lead = S.pin ? html`${I("map-pin")}Pinned to` : "Following";
        const dot = st === "running" ? html`<span class="live" aria-hidden="true"></span>` : st === "waiting" ? html`<span class="adot you" aria-hidden="true"></span>` : null;
        // A waiting review shows once, here, as the link to it.
        const words = st === "none" ? whyNone(to)
          : to === "EP006" ? html`<button class="linkbtn" onClick=${() => go("review")}>EP006's session waits for your review: open it</button>`
          : html`${lead} <b>${whose(to)}</b>: ${st === "running" ? "working" : "it waits for you"}`;
        const under = st !== "none" ? ["on " + ON[to], to === "EP003" && "Session 2 on Computer 1, after Computer 2 stopped"].filter(Boolean).join(" · ")
          : to === "EP005" ? "Its last session, 1, was on Computer 2 when it stopped." : "";
        return html`${dot}<span class="fill">${words}${under && html`<small class="muted">${under}</small>`}</span>${to === "EP005" && html`<button class="btn sm" onClick=${() => toast("EP005 continues in a new session with its files.")}>Resume</button>`}`;
      })()}</div>
      <div class="apick">
        <select class="select" aria-label="Session" value=${to} onChange=${(e) => switchTo(e.target.value === pageScope ? null : e.target.value)}>
          <option value=${pageScope}>${pageScope === "Setup" ? "Setup" : pageScope} (this page)</option>
          ${OPEN.filter((c) => c !== pageScope).map((c) => html`<option value=${c}>${c} · on ${ON[c]} · ${stateOf(c) === "running" ? "at work" : "waits for you"}</option>`)}
          ${/* An episode whose Computer stopped has no session but a Resume: the picker reaches it too. */ ""}
          ${pageScope !== "EP005" && html`<option value="EP005">EP005 · Computer stopped</option>`}
        </select><span class="fill"></span>
        ${stateOf(to) !== "none" && !S.dramaStop && html`<button class="btn sm ghost" aria-label=${watchName(to)} title=${watchName(to)} onClick=${() => toast(watchName(to) + ", view-only.")}>Watch</button>
          <button class="btn sm ghost" aria-label=${"Stop " + to} onClick=${() => stopIt(to)}>Stop</button>`}
      </div>
      <div class="ascroll">
        ${(EARLIER[to] || []).length > 0 && html`<section class="asec">${EARLIER[to].map((m) => html`<p class="msg you">${m}</p>`)}</section>`}
        ${to === "EP005" && (() => {
            // C3: Reconcile asks the provider what became of the request and ends in one of three outcomes, each saying what
            // happens next (the prototype's Outcome control picks which); it never resubmits on its own. A run control (D70).
            const r = S.recon;
            const reconcile = () => { set({ recon: "checking" }); setTimeout(() => set({ recon: S.outcome === "refused" ? "failed" : S.outcome === "unknown" ? "unknown" : "found" }), 1200); };
            if (r === "found") return html`<section class="asec"><p class="msg">Found: the provider finished seg03's video. The agent collects it and carries on; nothing is generated again.</p></section>`;
            return html`<section class="asec"><div class="arow failed"><div class="what">
              ${r === "checking" ? html`<span>Checking seg03's request with the provider…</span><small>Nothing is sent again while it checks.</small>`
              : r === "failed" ? html`<span>seg03's request failed at the provider</span><small>Shooting it again is one new request, and it spends: ask EP005's agent once it is resumed.</small>`
              : r === "unknown" ? html`<span>Still unknown: the provider hasn't said</span><small>Nothing is sent again. Check again later; the agent keeps waiting on it.</small>`
              : html`<span>Failed while shooting seg03 · <code>ProviderError.Unknown</code></span><small>drama-cli: the video request's outcome is unknown. It isn't sent again until it is reconciled.</small>`}</div>
              ${r === "checking" ? html`<span class="muted" style="font-size:12px">Checking…</span>`
              : r === "failed" ? null
              : html`<button class="btn sm" title="drama-cli's recovery for an unknown outcome" onClick=${reconcile}>${r === "unknown" ? "Check again" : "Reconcile"}</button>`}</div></section>`;
          })()}
        ${/* The agent's steps in place in the conversation, each a compact line (a step done, or turning while it runs); its
             messages as bubbles. No separate process card: the conversation is the log. */ ""}
        ${ep7 ? html`<section class="asec"><p class="astep">${I("check-circle")}<span>Status <code>drama-cli status</code></span></p><p class="astep">${I("check-circle")}<span>Breakdown EP007: refused, a red line in the screenplay</span></p>
          ${!(SAYS[S.state] || []).some((m) => m.to === "EP007") && html`<p class="msg">${SAID.redline.ask}</p>`}</section>`
        : to === "EP006" ? html`<section class="asec"><p class="astep">${I("check-circle")}<span>Status <code>drama-cli status</code></span></p><p class="astep">${I("check-circle")}<span>seg01 shot again: blanket folded first</span></p><p class="astep">${I("check-circle")}<span>seg03 shot again: opens on Luca</span></p><p class="astep">${I("check-circle")}<span>Downloaded both takes</span></p>
          <p class="msg">I shot seg01 again with the blanket folded before Luca speaks, and seg03 again opening on his face, as you asked. Both new takes wait for you.</p></section>`
        : to === "EP003" ? html`<section class="asec"><p class="astep">${I("check-circle")}<span>seg01 shot: t01</span></p><p class="astep now">${I("circle-notch")}<span>Shooting 4 takes</span></p></section>`
        : null}
        ${/* drama-cli's words, each its own message, then the agent's question that carries them (D70). */ ""}
        ${(SAYS[S.state] || []).some((m) => m.to === to) && html`<section class="asec" aria-label="What drama-cli said">${(SAYS[S.state] || []).filter((m) => m.to === to).map((m) => html`<${Said} m=${m}/>${m.ask && html`<p class="msg">${m.ask}</p>`}`)}</section>`}
        ${ASKS[S.state] && ASKS[S.state].to === to && html`<section class="asec"><p class="msg" id=${ASKS[S.state].id} tabindex="-1">${ASKS[S.state].ask}</p></section>`}
        ${to && (S.chats?.[to] || []).length > 0 && html`<section class="asec" aria-label="Conversation">${S.chats[to].map((m) => html`<p class="msg you">${m}</p>`)}</section>`}
      </div>
      ${stateOf(to) !== "none" && (to !== "EP006" || asks(to)) && (() => {
        // The line to the scope's open session, naming it. While a question waits it is the answer, which can carry one
        // file (D75: a screenplay or a picture, up to 20 MiB; the words still required), as a chat composer attaches one.
        const target = whose(to), answer = asks(to), file = answer && S.attach;
        const send = () => {
          const words = [S.draft.trim(), ...(file ? ["The file I attached: attachments/" + file] : [])].join("\n");
          set({ chats: { ...S.chats, [to]: [...((S.chats || {})[to] || []), words] }, draft: "", attach: null, answered: answer ? { ...(S.answered || {}), [to]: true } : S.answered });
          toast((answer ? "Answer sent to " : "Sent to ") + target + ".");
        };
        return html`<div class="composer"><textarea aria-label=${answer ? "Your answer" : "Message"} placeholder=${(answer ? "Answer " : "Message ") + target + "…"} value=${S.draft} onInput=${(e) => set({ draft: e.target.value })}
          onKeyDown=${(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && S.draft.trim()) send(); }}></textarea>
        ${file && html`<span class="chip plain">${I("file-text")}<span class="mono">${file}</span><button class="ibtn" aria-label=${"Remove " + file} onClick=${() => set({ attach: null })}>${I("x")}</button></span>`}
        <div class="crow">${answer && !file && html`<button class="ibtn" aria-label="Attach a file" title="A screenplay or a picture, up to 20 MiB." onClick=${() => set({ attach: "screenplay-v2.fountain" })}>${I("plus")}</button>`}
          <span>To <b>${target}</b></span><button class="send" aria-label=${(answer ? "Send answer to " : "Send to ") + target} disabled=${!S.draft.trim()} onClick=${send}>${I("arrow-up")}</button></div></div>`;
      })()}
    </aside>`;
  }

  /* Home's "Waiting for you": every drama's decisions, each row named by its drama and pictured by its cover (the agent
     panel pictures the item: thumb).
     §16: a row lands where that decision is made, with its items picked: takes in the review room, looks and plates
     on their cards in Assets, storyboards in their episode, a cut on its episode's Cut. Back returns. */
  const waits = () => {
    const cover = (t) => P.projects.find((p) => p.t === t).cover;
    // "Back to …" names the page the row was opened from: Home, Reviews, or any page under the agent panel.
    const back = () => ({ home: "Home", reviews: "Reviews", story: S.stab === "bible" ? "Bible" : "Assets", episode: "EP006", canvas: "EP006 · Canvas", graph: "Lineage", cut: "EP006 › Cut", delivery: "Delivery", script: "Script", outofdate: "Out of date" })[S.screen];
    const only = (where) => () => toast("Opens " + where + ". This sample opens EP006 only.");
    return [
      { dr: "Bride on Bail", what: "EP006", d: "2 takes · seg01, seg03", age: "4 min", thumb: P.takes[0].poster, open: () => go("review") },
      { dr: "Bride on Bail", what: "Looks and plates", d: "2 items · Margaret Cole, Garden wedding", age: "12 min", thumb: P.cast[3].face, open: () => openHome("margaret", back()) },
      { dr: "Bride on Bail", what: "EP004", d: "6 storyboards · scene 1 and 2", age: "26 min", thumb: "img/board-seg03.jpg", open: only("EP004's Canvas with its 6 storyboards picked") },
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
        <div class="greet"><div class="fill"><h1>Reviews</h1><p>Every decision the agent waits on, newest first. Each opens where you decide it.</p></div></div>
        <div class="filters">${[[null, "All", all.length], ...dramas.map((d) => [d, d, all.filter((w) => w.dr === d).length])].map(([k, l, n]) =>
          html`<button class="fchip" aria-pressed=${String(S.waitFor === k)} onClick=${() => set({ waitFor: k })}>${l}<small>${n}</small></button>`)}</div>
        <section class="panel queue">${list.map((w) => html`<button class="wait" onClick=${w.open}><img src=${w.pic} alt=""/>
          <span><b>${w.dr} · ${w.what}</b><small>${w.d} · ${w.age}</small></span></button>`)}</section>
      </div></div></div>`;
  }
  /* ───── Home ───── */
  /* Home (merecdesperez44323-lab's round 1, Y2–Y4): the grid is the one list of projects (one home per object: a project appears once
     on Home); New project leads it (liblib's 开始创作; Apple HIG puts the create action with its collection); what waits
     is a compact strip above it that leads to Reviews. */
  function Home() {
    const tabs = [["all", "All", 4], ["you", "Needs you", 2], ["work", "Working", 1], ["done", "Done", 1]];
    const list = P.projects.filter((p) => S.tab === "all" || (S.tab === "you" ? p.st === "you" || p.st === "redline" : S.tab === "work" ? p.st === "work" : p.st === "accepted"));
    const upload = () => go("upload");
    return html`<div class="main"><div class="scrollmain"><div class="wrap">
      <div class="greet"><div class="fill"><h1>Projects</h1><p>5 decisions wait for you across 2 projects.</p></div></div>
      <section class="waitstrip" aria-labelledby="waiting-title"><div class="wh"><h3 id="waiting-title">Waiting for you</h3><span class="fill"></span>
          <button class="btn sm ghost" onClick=${() => set({ waitFor: null, screen: "reviews" })}>See all ${waits().length} in Reviews ${I("caret-right")}</button></div>
        <ul>${waits().slice(0, 4).map((w) => html`<li><button class="wait" onClick=${w.open}><img src=${w.pic} alt=""/><span><b>${w.dr} · ${w.what}</b><small>${w.d} · ${w.age}</small></span></button></li>`)}</ul></section>
      <div class="tabsrow"><div class="utabs" role="tablist">${tabs.map(([k, l, n]) => html`<button role="tab" aria-selected=${String(S.tab === k)} onClick=${() => set({ tab: k })}>${l}<small>${n}</small></button>`)}</div>
        <span class="fill"></span><span class="search">${I("magnifying-glass")}Search projects…</span><button class="select">Last edited ${I("caret-down")}</button></div>
      <div class="cards">
        <button class=${"newcard " + (S.over ? "over" : "")} onClick=${upload}
          onDragOver=${(e) => { e.preventDefault(); if (!S.over) set({ over: true }); }} onDragLeave=${() => set({ over: false })} onDrop=${(e) => { e.preventDefault(); set({ over: false }); upload(); }}>
          <span class="pic"><span class="plus">${I("plus")}</span></span><span class="txt"><b>New drama project</b><small>Drop a screenplay here</small></span></button>
        ${list.map((p, i) => html`<div class="pcard"><button class="open" onClick=${() => i === 0 || p.t === P.project.title ? go("episodes") : toast(p.t + ": only the first project opens in this direction.")}>
          <div class=${"pic" + (p.format === "16:9" ? " wide" : "")}>${p.cover ? html`<img src=${p.cover} alt=""/>` : html`<span class="emptycover">${I("film-strip")}</span>`}</div>
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
    const open = (e) => e.code === "EP006" ? go("canvas") : toast(e.code + ": only EP006 opens in this direction.");
    return html`<div class="main">
      <${TopBar} crumbs=${[own.drama(), "Episodes"]}/>
      <div class="body"><div class="scrollmain">
        <div class="bar2"><span class="fill"></span><${ProjectChips}/></div>
        <${SaysLine}/>
        <div class="filters">${f.map(([k, l, n]) => html`<button class="fchip" aria-pressed=${String(S.filter === k)} onClick=${() => set({ filter: k })}>${l}<small>${n}</small></button>`)}
          <span class="fill"></span><span class="search" style="width:200px">${I("magnifying-glass")}Find an episode…</span><button class="select">Episode order ${I("caret-down")}</button></div>
        <div class="epgrid">${list.map((e) => html`<button class="epcard" onClick=${() => open(e)}>
          <div class="pic">${e.cover ? html`<img src=${e.cover} alt="" loading="lazy"/>` : html`<span class="empty">${e.n < 9 ? "Breakdown done" : "Not started"}</span>`}
            <span class="code">${e.code}</span>${e.status !== "line" && Status(e.status)}
            <span class="strip">${e.strip.map((s) => html`<i class=${s}></i>`)}</span></div>
          <b>${e.title}</b><small><span>${e.now}</span><span class="mono">${e.spent ? money(e.spent) : ""}</span></small></button>`)}</div>
      </div></div></div>`;
  }

  /* ───── Canvas ───── */
  /* The episode's one view (D66): drama-cli's own board, as `drama-cli export
     comfyui` lays it out (short_drama drama_cli/export.py, section() and layout(), the port in src/shared/layout.ts): the
     Characters, Locations and Props groups two to a row on the left; one group per segment, four to a row, its stages in
     drama-cli's column order (blocking, the line-art and photoreal storyboards, the take); the cut alone on the right.
     One difference is ours: the export draws the episode's breakdown as one text node in the Text group; here each
     segment's shots are a text node at the start of its group, so the shots read beside the pictures they made (SPEC).
     Each node is drama-cli's width at its file's own ratio (D58); a row is as tall as its tallest. */
  const W = 300, GAP = 60, PAD = 20, TITLE = 50, LABEL = 26, CARD = 340;
  const ICON = { cast: "user", place: "image", prop: "cube", shots: "list-numbers", blocking: "squares-four", frame: "image-square", storyboard: "squares-four", photoreal: "image", take: "film-strip", cut: "scissors" };
  function board() {
    const seen = (src) => S.dims[src] && Math.round((W * S.dims[src][1]) / S.dims[src][0]);
    const nodes = [], groups = [];
    const scene = Object.fromEntries(P.scenes.flatMap((sc) => sc.segs.map((g) => [g.id, `Scene ${sc.n} · ${(P.places.find((p) => p.id === sc.place) || {}).name || sc.place} · ${sc.time}`])));
    const node = (n) => ({ w: W, h: n.pic ? seen(n.pic) || CARD : n.h || CARD, ...n });
    const sections = [
      ["Characters", P.cast.slice(0, 5).map((c) => node({ id: c.id, kind: "cast", pic: c.sheet, label: c.name, st: c.st, ver: c.ver, accepted: c.accepted, role: c.role, model: "gpt-image-2.5", problems: c.problems }))],
      // A location's plate and, edited from it, its plate at each time of day the episode's scenes ask for: two stages,
      // `assets/scenes/<id>` and `assets/scenes/<id>/times/<Day|Night>` (image-references.md, section 1: LP, TP).
      ["Locations", P.places.slice(0, 2).flatMap((p) => [
        node({ id: p.id, kind: "place", pic: p.pic, label: p.name, st: p.st, ver: p.ver, accepted: p.accepted, model: "gpt-image-2.5", role: "Plate" }),
        ...[...new Set(P.scenes.filter((sc) => sc.place === p.id).map((sc) => sc.time))].map((time) =>
          node({ id: `${p.id}/times/${time}`, kind: "place", asset: p.id, label: `${p.name} · ${time}`, st: "accepted", ver: "v1", accepted: "v1", model: "gpt-image-2.5", role: `Plate at ${time}, edited from the plate`, at: { kind: "plate", ver: "v1", time } })),
      ])],
      ["Props", [node({ id: "file", kind: "prop", pic: P.props[0].pic, label: "Case file", st: "accepted", ver: "v1", accepted: P.props[0].accepted, role: "Key prop", model: "gpt-image-2.5" })]],
    ];
    const segments = P.scenes.flatMap((sc) => sc.segs).map((g) => {
      const at = (kind, ver) => ({ seg: g, at: { kind, ver } });
      const blocking = (g.refs || []).find(([name]) => /^Blocking/.test(name)), frame = (g.refs || []).find(([name]) => /^First frame/.test(name));
      return [`EP006 ${g.id}`, [
        node({ id: `${g.id}/shots`, kind: "shots", label: "Shots", st: "accepted", ver: "v1", accepted: "v1", role: "Shot list · breakdown.json", h: CARD, seg: g }),
        blocking && node({ id: `${g.id}/blocking`, kind: "blocking", pic: blocking[1], label: "Blocking", st: "accepted", ver: "v1", accepted: "v1", role: "Blocking reference", model: "gpt-image-2.5", ...at("blocking", "v1") }),
        frame && node({ id: `${g.id}/frame`, kind: "frame", pic: frame[1], label: "First frame", st: "accepted", ver: frame[0].split(" ").pop(), accepted: frame[0].split(" ").pop(), role: "First-frame reference", model: "gpt-image-2.5", ...at("first_frame_reference", frame[0].split(" ").pop()) }),
        node({ id: `${g.id}/storyboard`, kind: "storyboard", pic: g.board, label: "Storyboard · line-art", st: g.boardSt || "accepted", ver: "v1", accepted: "v1", role: "Storyboard · line-art", model: "gpt-image-2.5", ...at("storyboard", "v1"), at: { kind: "storyboard", ver: "v1", style: "line-art" } }),
        g.photo && node({ id: `${g.id}/photoreal`, kind: "photoreal", pic: g.photo, label: "Storyboard · photoreal", st: g.photoSt || "accepted", ver: "v1", accepted: "v1", role: "Storyboard · photoreal", model: "gpt-image-2.5", seg: g, at: { kind: "storyboard", ver: "v1", style: "photoreal" } }),
        node({ id: `${g.id}/take`, kind: "take", pic: g.still, label: `Take · ${g.take}`, st: g.st, ver: g.take, accepted: g.accepted, role: `${g.s} s · ${g.cast.length} in frame`, model: "sd25", ...at("take", g.take) }),
      ].filter(Boolean).map((n, i, row) => (n.kind === "shots" ? { ...n, h: Math.min(CARD, Math.max(...row.slice(1, 4).map((m) => m.h)), 44 + 22 * n.seg.shots.length) } : n)), scene[g.id]];
    });
    const place = (title, x, y, list, perRow, label) => {
      let row = y;
      for (let s = 0; s < list.length; s += perRow) {
        const members = list.slice(s, s + perRow);
        members.forEach((n, i) => nodes.push({ ...n, x: x + i * (W + GAP), y: row + LABEL }));
        row += Math.max(...members.map((n) => LABEL + n.h)) + GAP;
      }
      const width = Math.min(list.length, perRow) * (W + GAP) - GAP, height = row - GAP - y;
      groups.push({ id: "g:" + title, kind: "group", x: x - PAD, y: y - TITLE - PAD, w: width + 2 * PAD, h: height + TITLE + 2 * PAD, label: label ? `${title} · ${label}` : title });
      return y + height + TITLE + 2 * PAD + GAP;
    };
    let y = 0;
    for (const [title, list] of sections) y = place(title, 0, y + TITLE + PAD, list, 2);
    let x = 2 * (W + GAP) + 2 * PAD + GAP;
    y = TITLE + PAD;
    for (const [title, list, label] of segments) y = place(title, x, y, list, 4, label) + TITLE + PAD;
    x += 4 * (W + GAP) + 2 * PAD + GAP;
    place("EP006 cut", x, TITLE + PAD, [node({ id: "cut", kind: "cut", pic: "img/cover-ep6.jpg", label: "Cut · v1", st: "you", ver: "v1", accepted: null, role: "EP006 cut", model: "drama-cli edit" })], 1);
    // Only what drama-cli records: "is made from the accepted version of", each stage's manifest pinning the files it used
    // (short_drama doc/drama-cli/image-references.md, section 1; lineage.json's links). Never the order of the row: the
    // photoreal storyboard is for the person only and feeds nothing (image-references.md:54, D141); the blocking
    // reference and both storyboards take the location's plate, the first frame and the video its plate at the
    // segment's time of day (image-references.md:53, D122); the take is made from the video request, which takes the
    // line-art storyboard, the time plate, the blocking, the look sheets and the props; the cut from the takes.
    const edges = [], has = new Set(nodes.map((n) => n.id));
    const edge = (from, to) => has.has(from) && has.has(to) && edges.push([from, to]);
    for (const sc of P.scenes) for (const g of sc.segs) {
      const s = (kind) => `${g.id}/${kind}`, plate = sc.place, timed = `${sc.place}/times/${sc.time}`;
      const props = (g.refs || []).map(([, , asset]) => asset).filter((asset) => P.props.some((p) => p.id === asset));
      for (const to of ["blocking", "frame", "storyboard", "photoreal", "take"]) edge(s("shots"), s(to));
      for (const to of ["blocking", "storyboard", "photoreal"]) edge(plate, s(to));
      for (const to of ["frame", "take"]) edge(timed, s(to));
      for (const look of g.cast) for (const to of ["blocking", "frame", "storyboard", "photoreal", "take"]) edge(look, s(to));
      for (const to of ["frame", "storyboard", "photoreal", "take"]) edge(s("blocking"), s(to));
      for (const prop of props) for (const to of ["storyboard", "photoreal", "take"]) edge(prop, s(to));
      edge(s("storyboard"), s("take"));
      edge(s("frame"), s("take"));
      edge(s("take"), "cut");
    }
    return { nodes: [...groups, ...nodes], edges };
  }
  /* The picked node's panel, directly under it, as infinite-canvas's prompt panel and astorie's node panel stand (glass): the prompt
     with each Image N as a chip of that picture and the pictures it names, the versions with what the person decided, request.json,
     and what the node is; a pill row of drama-cli's settings; the hand controls disabled until phase 2. Read-only. */
  /* Out of date in this sample: the Case file, made from bible b0002 while b0003 is accepted. */
  const outOfDate = (n) => n.st === "stale" || n.stale || n.id === "file";
  /* A node's picture or video at its own ratio, whole (liblib's node): the file says its size once loaded, the box follows
     it, and the size shows in the label's corner. */
  const sized = (src) => (S.dims[src] ? `aspect-ratio:${S.dims[src][0]} / ${S.dims[src][1]}` : "");
  const measure = (src) => (e) => { const w = e.target.naturalWidth, h = e.target.naturalHeight; if (w && h && !S.dims[src]) set({ dims: { ...S.dims, [src]: [w, h] } }); };
  const dims = (src) => S.dims[src] && html`<span class="dims">${S.dims[src][0]} × ${S.dims[src][1]}</span>`;
  function NodePanel({ node: item, style, uses, reads, docked: forced }) {
    // Each stage is its own node, on its own version (S.at, which a link may name).
    const at = item.at, ood = at && item.seg && window.EXTRA.outOfDateAt(item.seg.id, at);
    const node = { ...item, label: item.seg ? `EP006 ${item.seg.id} · ${item.label}` : item.label, stale: !!ood };
    // A stage this sample has no picture of says so, with no state it can't show (master's review of v12).
    const missing = node.kind !== "shots" && !node.pic;
    const spec = node.kind === "take" && node.seg.spec;
    // A shared reference's home is Assets (§16): its versions, prompt and review live there, and the canvas only links to it.
    const home = homeTab(node.asset || node.id);
    const open = S.dtab;
    const parts = home ? [] : node.kind === "shots" || missing ? [["details", "Details"]] : [["prompt", "Prompt"], ...(spec ? [["versions", "Versions"], ["request", "Request"]] : []), ["details", "Details"]];
    const chips = (line) => line.split(/(Image \d+)/).map((part) => { const m = part.match(/^Image (\d+)$/); return m ? html`<span class="pchip"><img src=${spec.images[m[1] - 1]} alt=""/>${part}</span>` : part; });
    // Under the node by default, the industry's convention; docked right on asking, or when the board has no room for it
    // above or below the node. The viewer's choice is kept in this browser.
    const docked = forced || S.dock === "right";
    const dock = (to) => { set({ dock: to }); try { localStorage.setItem("studio.canvas.dock", to); } catch (e) { /* a convenience */ } };
    const acc = node.accepted === node.ver ? "accepted" : node.accepted ? `accepted ${node.accepted}` : "none accepted";
    const why = node.problems ? node.problems.join("; ") : node.id === "file" ? "Changed file: bible/v3/bible.json" : ood ? `Made from ${ood.from}, which is out of date` : "";
    // §15 progressive disclosure: by default its state and what needs the maker; prompt, versions, request and details on demand.
    // What waits, named as the object it is (Codex round 4, F2): a take, the cut, a storyboard.
    const needs = node.st === "you" ? (home ? "Waits for your review in Assets." : node.kind === "take" ? `Take ${node.ver} waits for you: watch it, then accept, send back or note.` : node.kind === "cut" ? `Cut ${node.ver} waits for you: watch it, then accept or send back.` : `${node.label} ${node.ver} waits for your review.`)
      : outOfDate(node) ? "Nothing for you: the agent redraws what is out of date." : node.st === "back" ? "Nothing for you: the agent redoes it." : "";
    return html`<div class=${"npanel" + (docked ? " docked" : "")} role="dialog" aria-label=${node.label} style=${style}>
      <div class="nhead"><b class="fill">${node.label}</b>${!missing && html`${Status(node.st === "stale" ? "accepted" : node.st)}${outOfDate(node) ? Status("stale", "Out of date") : Status("line", "Up to date")}`}
        ${!forced && html`<button class="ibtn" title=${docked ? "Under the node" : "Dock right"} aria-label=${docked ? "Under the node" : "Dock right"} onClick=${() => dock(docked ? "under" : "right")}>${I(docked ? "square-half-bottom" : "square-half")}</button>`}
        <button class="ibtn" aria-label="Close" onClick=${() => set({ sel: null, cam: S.camBack || S.cam, camBack: null })}>${I("x")}</button></div>
      ${missing ? html`<p class="needs">Not in this sample: the replay has no picture of this stage.</p>` : html`<div class="nstate"><span class="mono">current ${node.ver || "v1"} · ${acc}</span>${why && html`<span class="why">${I("warning")}${why}</span>`}</div>
      ${needs && html`<p class="needs">${needs}</p>`}`}
      ${home ? html`<p class="subtle nhome">Its versions, prompt and review: <button class="linkbtn" onClick=${() => openHome(node.asset || node.id, "EP006 · Canvas", node.at)}>Assets › ${{ cast: "Characters", scenes: "Locations", props: "Props" }[home]} › ${node.label}</button></p>`
        : html`<div class="ndisc">${parts.map(([k, l]) => html`<button aria-expanded=${String(open === k)} aria-controls="npart" onClick=${() => set({ dtab: open === k ? null : k })}>${l}${I(open === k ? "caret-up" : "caret-down")}</button>`)}</div>`}
      ${!home && open && html`<div id="npart" class="npart" role="region" aria-label=${parts.find(([k]) => k === open)[1]}>
        ${open === "prompt" && (spec ? html`<ol class="refs">${spec.images.map((u, i) => html`<li title=${"Image " + (i + 1)}><img src=${u} alt=""/><b>${i + 1}</b></li>`)}</ol>
          <div class="prompt">${spec.prompt.split("\n").map((line) => html`<p>${chips(line)}</p>`)}</div>` : html`<p class="subtle">The agent hasn't returned this version's spec.json and request.json.</p>`)}
        ${open === "versions" && html`<ol class="versions">${spec.versions.map(([v, st, said]) => html`<li><b class="mono">${v}</b>${Status(st)}${said && html`<span class="subtle">${said}</span>`}</li>`)}</ol>`}
        ${open === "request" && html`<pre class="mono">${JSON.stringify({ model: spec.model, content: [{ type: "text", text: spec.prompt.slice(0, 60) + "…" }, ...spec.images.map((u) => ({ type: "image_url", image_url: { url: "@" + u }, role: "reference_image" }))], duration: spec.seconds, ratio: spec.ratio, resolution: spec.resolution }, null, 2)}</pre>`}
        ${open === "details" && html`<dl><dt>Kind</dt><dd>${node.role}</dd><dt>Version</dt><dd class="mono">${node.ver}</dd><dt>Used by</dt><dd>${uses || "—"}</dd><dt>Reads</dt><dd>${reads || "—"}</dd>${node.problems && node.problems.length ? html`<dt>Why</dt><dd>${node.problems.map((said) => html`<span class="why">${said}</span>`)}</dd>` : null}</dl>`}
        ${open === "details" && node.kind === "shots" && html`<ol class="shotsfull">${node.seg.shots.map(([time, size, angle, camera, visual, audio]) => html`<li><b class="mono">${time}</b> <span class="subtle">${size} · ${angle}</span><p>${camera}</p><p>${visual}</p><p class="subtle">${audio}</p></li>`)}</ol>`}
      </div>
      ${spec && html`<div class="nfoot"><span class="pill mono">${spec.model}</span><span class="pill mono">${[spec.ratio, spec.resolution, spec.seconds + " s"].join(" · ")}</span></div>`}`}
      <p class="subtle nask">To redo or change it, ask the agent in the sidebar.</p>
    </div>`;
  }

  function Canvas() {
    const ref = useRef(null);
    const { nodes: NODES, edges: EDGES } = board();
    const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
    const nameOf = (id) => (byId[id].seg ? `${byId[id].seg.id} · ${byId[id].label}` : byId[id].label);
    // Review goes to the selected object's own review, by its identity (Codex round 4, F2): a take to that take in the
    // review room, the cut to its version in the Cut room, a storyboard to its review in the queue; none for another.
    const reviewOf = (n, from) => {
      if (n.kind === "take") { const ti = P.takes.findIndex((t) => t.seg === n.seg.id && t.take === n.ver); return ti < 0 ? null : () => { set({ ti, showPrev: false }); jump({ screen: "review" }, from); }; }
      if (n.kind === "cut") return () => jump({ screen: "cut", at: { kind: "cut", ver: n.ver } }, from);
      if (n.kind === "storyboard" || n.kind === "photoreal") return () => jump({ screen: "reviews" }, from);
      return null;
    };
    const { x, y, k } = S.cam;
    // B5: a picked node is placed under the pills with its bar above it and room for its panel below (or beside, docked).
    const PILLS = 64, BAR = 46, PANEL = 220, DOCKED = 440;
    const place = (n, kk = k) => { const el = ref.current; if (!el) return { k: kk, x, y };
      const tall = BAR + ((n.h || 196) + 26) * kk + (S.dock === "right" ? 0 : 10 + PANEL);
      const top = Math.max(PILLS, PILLS + (el.clientHeight - PILLS - tall) / 2);
      return { k: kk, x: (el.clientWidth - (S.dock === "right" ? DOCKED : 0)) / 2 - (n.x + (n.w || 300) / 2) * kk, y: top + BAR - (n.y - 26) * kk }; };
    // merecdesperez44323-lab: a picked node zooms in to a readable size (D37). Figma's Zoom to selection (Shift+2), as React Flow's
    // fitView({ nodes }) does it: the node fills the room its bar and panel leave, up to 150%. Esc or Fit returns.
    const readable = (n) => { const el = ref.current; if (!el) return k;
      const roomH = el.clientHeight - PILLS - BAR - (S.dock === "right" ? 0 : 10 + PANEL) - 16, roomW = el.clientWidth - (S.dock === "right" ? DOCKED : 0) - 80;
      return Math.min(1.5, roomH / ((n.h || 196) + 26), roomW / (n.w || 300)); };
    const pick = (n, at) => set({ sel: n.id, at: at || n.at || null, follow: false, camBack: S.camBack || S.cam, cam: place(n, readable(n)) });
    const letGo = () => set({ sel: null, cam: S.camBack || S.cam, camBack: null });
    // Arriving with a pick (Back from Lineage or Assets, or the List's selection) places it, as a click would.
    useEffect(() => { const n = S.sel && byId[S.sel]; if (n) pick(n, S.at); }, []);
    useEffect(() => {
      if (!S.follow) return;
      const order = ["seg01/take", "seg03/take", "seg04/take", "seg02/take"]; let i = 0;
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
    // The board's extent, for Fit and the minimap: every group and node.
    const left = Math.min(...NODES.map((n) => n.x)), top = Math.min(...NODES.map((n) => n.y - (n.kind === "group" ? 0 : LABEL)));
    const right = Math.max(...NODES.map((n) => n.x + n.w)), bottom = Math.max(...NODES.map((n) => n.y + n.h));
    const fitted = () => { const el = ref.current, bw = el ? el.clientWidth : 1100, bh = el ? el.clientHeight : 800;
      const kk = Math.min(1, (bw - 80) / (right - left), (bh - 160) / (bottom - top)); return { k: kk, x: 40 - left * kk, y: 80 - top * kk }; };
    const fit = () => set({ follow: false, camBack: null, cam: fitted() });
    const wire = ([a, b]) => { const A = byId[a], B = byId[b]; const x1 = A.x + A.w, y1 = A.y + A.h / 2, x2 = B.x, y2 = B.y + B.h / 2; const m = (x1 + x2) / 2;
      return html`<path class=${S.sel === a || S.sel === b ? "hot" : ""} d=${`M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`}/>`; };
    const sel = S.sel && byId[S.sel];
    return html`<div class="main">
      <${TopBar} crumbs=${[own.drama(), ...(sel && sel.seg ? [own.ep(), `${sel.seg.id} · ${sel.label} ${sel.ver}`] : sel && homeTab(sel.asset || sel.id) ? [own.assets(), own.tab(homeTab(sel.asset || sel.id)), sel.label + " · " + sel.ver] : ["EP006"])]}/>
      <div class="body" style="position:relative">
        <div class=${"board " + (S.panning ? "panning" : "")} style=${`--grid:${48 * k}px;--gx:${x % (48 * k)}px;--gy:${y % (48 * k)}px;--dot:${k < 0.12 ? 0.8 : 1.15}px`} ref=${ref} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerLeave=${up} onWheel=${wheel}>
          <div class=${"layer" + (k < 0.35 ? " far" : "")} style=${`transform:translate(${x}px,${y}px) scale(${k})`}>
            <svg class="wires" width="1" height="1">${EDGES.map(wire)}</svg>
            ${NODES.filter((n) => n.kind === "group").map((g) => html`<div class="group" style=${`left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px`}><span class="gl">${g.label}</span></div>`)}
            ${NODES.filter((n) => n.kind !== "group").map((n) => html`<div class=${"cnode is-" + n.kind + (S.sel === n.id ? " sel" : "")} style=${`left:${n.x}px;top:${n.y - LABEL}px;width:${n.w}px`}>
              <div class="lab">${I(ICON[n.kind])}<span class="name">${n.label}</span>${n.model && html`<span class="model">${n.model}</span>`}${n.kind !== "shots" && !n.pic ? null : n.st !== "accepted" ? Status(n.st) : outOfDate(n) && Status("stale")}${n.pic && dims(n.pic)}</div>
              ${n.kind === "shots"
                // A segment's shots, as breakdown.json's Shot gives them: time, size, angle, camera, then what is seen and heard.
                // Far out it keeps its title bar only, as ComfyUI collapses a node (and the export draws text).
                ? html`<div class="card shotlist" style=${`height:${n.h}px`} onClick=${() => pick(n)}>
                    <b class="stitle">${n.seg.shots.length} shots · ${n.seg.s} s</b>
                    <ol class="srows">${n.seg.shots.map(([time, size, , , visual]) => html`<li title=${visual}><span class="mono">${time}</span> · ${size} · ${visual}</li>`)}</ol></div>`
                : html`<div class="card" style=${n.pic && S.dims[n.pic] ? sized(n.pic) : `height:${n.h}px`} onClick=${() => pick(n)}>
                    ${n.pic ? html`<img src=${n.pic} alt="" draggable="false" onLoad=${measure(n.pic)}/>` : html`<div class="none">Not in this sample</div>`}
                    ${n.kind === "take" && n.pic && html`<span class="play"><i>${I("play")}</i></span>
                      ${/* The take's inline player (D39): on the picked take and on hover, in media-chrome's control bar order, as
                         Premiere's, Frame.io's and YouTube's: play, time, the slider, duration, sound, full screen. Muted until the sound is on;
                         a hover previews it, and leaving pauses it where it is (LibTV, YouTube's hover previews). */ ""}
                      <div class=${"vbar" + (S.sel === n.id ? " shown" : "")} role="group" aria-label=${"Play " + n.seg.id + " take " + n.ver}>
                        <button class="vb" aria-label="Play" onClick=${(e) => { e.stopPropagation(); toast("Plays the take here, muted until you turn the sound on."); }}>${I("play")}</button>
                        <span class="vt">0:00</span><span class="vtrack"><i></i></span><span class="vt">0:${String(n.seg.s).padStart(2, "0")}</span>
                        <button class="vb" aria-label="Unmute" onClick=${(e) => { e.stopPropagation(); toast("Turns the take's sound on."); }}>${I("speaker-slash")}</button>
                        <button class="vb" aria-label="Enter fullscreen mode" onClick=${(e) => { e.stopPropagation(); toast("Plays the take full screen."); }}>${I("corners-out")}</button></div>`}</div>`}</div>`)}
          </div>
        </div>
        <div class="ctop"><${EpisodeHead}/><button class="follow" aria-pressed=${String(S.follow)} onClick=${() => set({ follow: !S.follow })}>${S.follow && html`<span class="live"></span>`}${S.follow ? "Following the agent" : "Follow the agent"}</button>
          <span class="fill"></span><${ProjectChips}/><${SaysLine}/></div>
        ${sel && (() => {
          // Above the node its action bar. Its panel goes where the board has room, never over the node or its bar: under
          // the node, else above the bar, else docked right (Codex re-review F: the Case file's panel covered its own bar).
          const W = 560, MIN = 180, bw = ref.current ? ref.current.clientWidth : 1100, bh = ref.current ? ref.current.clientHeight : 800;
          const cx = x + (sel.x + (sel.w || 300) / 2) * k, top = y + (sel.y - 26) * k, bottom = y + (sel.y + (sel.h || 196)) * k;
          const barTop = Math.max(PILLS, top - BAR), left = Math.max(12, Math.min(bw - W - 12, cx - W / 2));
          const below = bh - bottom - 10 - 12, above = barTop - 8 - PILLS;
          const at = S.dock === "right" ? "" : below >= MIN ? `top:${bottom + 10}px;max-height:${below}px` : above >= MIN ? `bottom:${bh - barTop + 8}px;max-height:${above}px` : null;
          const uses = EDGES.filter((e) => e[0] === sel.id).map((e) => nameOf(e[1])).join(", "), reads = EDGES.filter((e) => e[1] === sel.id).map((e) => nameOf(e[0])).join(", ");
          const home = homeTab(sel.asset || sel.id), stage = sel.at || null, gid = sel.kind === "shots" || sel.kind === "photoreal" ? undefined : window.EXTRA.lineageOf(sel.seg ? sel.seg.id : sel.id, stage && stage.kind), from = "Canvas · " + sel.label + (stage ? " · " + stage.kind + " " + stage.ver : "");
          return html`<div class="nbar" role="toolbar" aria-label=${"Act on " + sel.label} style=${`left:${Math.max(12, cx - 150)}px;top:${barTop}px`}>
              ${home
                // A reference's home is Assets: the canvas links there, with no second copy of its review (§16).
                ? html`<button class=${"btn sm " + (sel.st === "you" ? "primary" : "ghost")} onClick=${() => openHome(sel.asset || sel.id, from, sel.at)}>${sel.st === "you" ? "Review in Assets" : "Open in Assets"}</button>`
                // The UI views and decides (D70): Review leads to Accept or Send back on this
                // exact item; redo, notes and other steering go to the agent sidebar.
                : html`${sel.st === "you" && reviewOf(sel, from) ? html`<button class="btn sm primary" onClick=${reviewOf(sel, from)}>Review</button>` : null}`}
              <button class="ibtn" title=${gid ? "Lineage" : "Lineage: this sample traces seg03 and what it reads"} aria-label="Lineage" disabled=${!gid} onClick=${() => openLineage(gid, from)}>${I("tree-structure")}</button>
              <button class="ibtn" title="Download" aria-label="Download" onClick=${() => toast("Downloads the picture.")}>${I("download-simple")}</button></div>
            <${NodePanel} node=${sel} uses=${uses} reads=${reads} docked=${at === null} style=${at ? `left:${left}px;width:${W}px;${at}` : ""}/>`;
        })()}
        ${S.minimap && html`<div class="minimap" aria-hidden="true">${(() => { const m = Math.min(152 / (right - left), 88 / (bottom - top)), at = (px, o) => 8 + (px - o) * m;
            return html`${NODES.filter((n) => n.kind !== "group").map((n) => html`<i style=${`left:${at(n.x, left)}px;top:${at(n.y, top)}px;width:${n.w * m}px;height:${n.h * m}px`}></i>`)}
          <b style=${`left:${at(-x / k, left)}px;top:${at(-y / k, top)}px;width:${(ref.current ? ref.current.clientWidth : 900) * m / k}px;height:${(ref.current ? ref.current.clientHeight : 600) * m / k}px`}></b>`; })()}</div>`}
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
          <button class="ibtn" title="Lay out again" aria-label="Lay out again" onClick=${() => { set({ cam: fitted() }); toast("Every node back where drama-cli's layout puts it."); }}>${I("tree-structure")}</button>
          <button class="ibtn" title="Shortcuts (?)" aria-label="Shortcuts" onClick=${() => set({ keysOpen: true })}>${I("question")}</button></div>
        ${S.keysOpen && html`<div class="scrim" onClick=${(e) => { if (e.target === e.currentTarget) set({ keysOpen: false }); }}>
          <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="keys-t"><h2 id="keys-t">Canvas shortcuts</h2>
            <p class="subtle">Copy, paste, delete, group and undo come with phase 2, when the canvas makes items by hand.</p>
            <dl class="keys">${[["V", "Move: pick and drag items, draw a box to pick several"], ["H", "Hand: drag the board"], ["Space + drag", "Drag the board, whatever the tool"], ["⌘ +  /  ⌘ −", "Zoom in / out"], ["⌘ 0", "Fit to screen"], ["⌘ A", "Pick every item"], ["Esc", "Let go of the pick, close its panel and zoom back"], ["?", "This list"]].map(([key, what]) => html`<dt><kbd>${key}</kbd></dt><dd>${what}</dd>`)}</dl>
            <div class="acts"><button class="btn" onClick=${() => set({ keysOpen: false })}>Close</button></div></div></div>`}
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
    /* D70: every decision also appears in the agent conversation of the session it goes to, as the maker made
       it: each take accepted (with their words) or sent back (with its reason). Mirrored once the send goes through. */
    const sendIt = () => {
      set({ rfield: null }); submit("review");
      if (S.outcome !== "ok") return;
      const said = P.takes.map((t) => S.verdict[t.id] === "back" ? `You sent back EP006 ${t.seg} ${t.take}: “${(S.reason[t.id] || "").trim()}”` : `You accepted EP006 ${t.seg} ${t.take}${(S.words || "").trim() ? `: “${S.words.trim()}”` : ""}`);
      set({ chats: { ...S.chats, EP006: [...((S.chats || {}).EP006 || []), ...said] } });
    };
    // The first send and Send again ask the same way: the draft may have changed in between.
    const confirmSend = () => set({ dialog: { title: "Send your review?", body: P.takes.map((t) => `${t.seg} ${t.take}: ${S.verdict[t.id] === "accept" ? "Accept" : "Send back — “" + (S.reason[t.id] || "").trim() + "”"}`).join("\n") + (P.takes.some((t) => S.verdict[t.id] === "back") ? "\nSending back shoots new takes: that spends." : ""), ok: "Send review", cancel: "Keep reviewing", run: sendIt } });
    useEffect(() => {
      const kd = (e) => { if (/textarea|input/i.test(e.target.tagName) || S.screen !== "review" || ((S.subs || {}).review && (S.subs || {}).review !== "failed")) return;
        if (e.key === " ") { e.preventDefault(); set({ playing: !S.playing }); }
        else if (e.key === "a" && S.watched[P.takes[S.ti].id]) setV("accept");
        else if (e.key === "b") setV("back");
        else if (e.key === "ArrowDown") set({ ti: Math.min(P.takes.length - 1, S.ti + 1), showPrev: false });
        else if (e.key === "ArrowUp") set({ ti: Math.max(0, S.ti - 1), showPrev: false }); };
      window.addEventListener("keydown", kd); return () => window.removeEventListener("keydown", kd);
    }, []);
    const done = P.takes.filter((t) => S.verdict[t.id] && (S.verdict[t.id] !== "back" || (S.reason[t.id] || "").trim())).length;
    const pct = (S.t / dur) * 100, seen = ((S.maxT[tk.id] || 0) / dur) * 100;
    const needsWords = v === "back";
    // IA r2 (§16): the room decides; it is no home. A take, its versions and an accepted take live in their segment in
    // EP006's Canvas, and a character in Assets: the room links there, landing on it, and Back returns to the room.
    const seg = P.scenes.flatMap((sc) => sc.segs).find((g) => g.id === tk.seg);
    const inSeg = (id, ver, label) => openStage(id, { kind: "take", ver }, label);
    const here = "Review · " + tk.seg + " " + tk.take;
    return html`<div class="main">
      <${TopBar} crumbs=${[own.drama(), own.ep(), here]} right=${html`<span class="muted hide-s" style="font-size:12px">${P.takes.length - done} of ${P.takes.length} waiting</span>`}/>
      <${SaysLine}/>
      <div class="room">
        <nav class="reel" aria-label="Takes waiting">
          <h3>EP006 · waiting for you</h3>
          ${P.takes.map((t, i) => html`<button class="ritem" aria-current=${String(i === S.ti)} onClick=${() => set({ ti: i, showPrev: false })}>
            <img src=${t.poster} alt=""/><span><b>${t.seg} · ${t.take}</b><small>${t.scene.split(" · ").slice(0, 1)} · ${t.dur} s</small>
            ${S.verdict[t.id] ? Status(S.verdict[t.id] === "accept" ? "accepted" : S.verdict[t.id] === "back" ? "back" : "accepted", S.verdict[t.id] === "accept" ? "Accept" : "Send back") : S.watched[t.id] ? Status("you", "Watched") : Status("you", "Not watched")}</span></button>`)}
          <h3 style="margin-top:14px">Accepted in EP006</h3>
          <button class="ritem" title="Open seg02 on EP006's Canvas" onClick=${() => inSeg("seg02", "t01", "Review · EP006 takes")}><img src=${"img/cover-ep6.jpg"} alt=""/><span><b>seg02 · t01</b><small>Scene 1 · 15 s</small>${Status("accepted")}</span></button>
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
</div>
            ${needsWords && html`<textarea readonly=${locked} placeholder="Why it goes back (required). The agent shoots again with your words." value=${S.reason[tk.id] || ""} onInput=${(e) => step("reason:" + tk.id, { reason: { ...S.reason, [tk.id]: e.target.value } })}></textarea>`}
            <span class="hint">${I(watched ? "check-circle" : "clock")}${watched ? "Watched to the end." : `Watched ${Math.round(seen)}% · Accept unlocks at the end.`}${v === "back" && " Sending back may shoot a new take."}</span>
            <span class="hint subtle">Keys: Space play · A accept · B send back · ↑↓ next take</span>
          </div>
          <div style="padding:10px 16px 0;border-top:1px solid var(--border);background:var(--surface-dim)"><input class="search" style="width:100%;height:32px" readonly=${locked} placeholder="Your words for the record, e.g. Approved. seg03 opens on Luca." value=${S.words || ""} onInput=${(e) => step("words", { words: e.target.value })}/></div>
          ${locked
            ? html`<div class="sendbar sent"><${Submission} id="review" to="EP006's agent" onSend=${confirmSend} kept="Your draft is kept."/>
                ${sendState === "sent" && html`<span class="muted" style="font-size:12px">Your decisions are kept as sent; to change one, tell the agent in the panel.</span>`}</div>`
            : html`<div class="sendbar">
            ${sendState === "failed" && html`<${Submission} id="review" to="EP006's agent" onSend=${confirmSend} kept="Your draft is kept."/>`}
            <span class="pips">${P.takes.map((t) => html`<i class=${S.verdict[t.id] === "accept" ? "a" : S.verdict[t.id] === "back" ? "b" : ""}></i>`)}</span>
            <span class="muted fill" style="font-size:12px">${done} of ${P.takes.length} decided${changed ? html` · <b style="color:var(--text-primary)">Draft: ${changed} ${changed === 1 ? "item" : "items"} changed</b>` : ""}</span>
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
      <div class="ph"><b>Prototype controls</b><span class="fill"></span><button class="ibtn" aria-label="Close the prototype controls" aria-expanded="true" onClick=${() => set({ proto: false })}>${I("x")}</button></div>
      <p>Not part of the app: they set what the sample shows. Phase 1: viewing and deciding, and editing the cut's spec (D70) · Canvas and Lineage read-only · sample project, our own test pictures.</p>
      <span class="pl">Screen</span><div class="seg wrap" role="group" aria-label="Screen">${[["home", "Home"], ["reviews", "Reviews"], ["upload", "Upload"], ["script", "Script"], ["story", "Bible"], ["episodes", "Episodes"], ["canvas", "Canvas"], ["graph", "Graph"], ["review", "Review"], ["cut", "Cut"], ["delivery", "Delivery"], ["outofdate", "Out of date"]].map(([k, l]) => html`<button aria-pressed=${String(S.screen === k)} onClick=${() => go(k)}>${l}</button>`)}</div>
      <label class="select">State<select aria-label="State" value=${S.state} onChange=${(e) => { const v = e.target.value; set({ state: v, dramaStop: v === "stopping" ? "stopping" : v === "stopped" ? "stopped" : null, answered: {}, attach: null, sver: null, sform: null, sdraft: "", sdec: null, subs: { ...(S.subs || {}), script: undefined } }); }}>
        ${[["normal", "Normal"], ["scriptRewriting", "Script: rewriting"], ["scriptYou", "Script: v1 waiting for you"], ["scriptBack", "Script: v1 sent back, v2 rewriting"], ["scriptYou2", "Script: v2 waiting for you"], ["scriptOriginal", "Script: only the original"], ["fresh", "Nothing out of date"], ["cutnewer", "Cut: a newer cut exists"], ["cutinputs", "Cut: draft inputs changed"], ["cutrefused", "Cut: drama-cli refuses the edit"], ["nostop", "No stop yet"], ["stopping", "Stopping"], ["stopped", "Stopped"], ["redline", "drama-cli: red line"], ["budget", "drama-cli: refused (no code)"], ["cap", "drama-cli: cap reached"], ["env", "drama-cli: Pine access denied"], ["several", "drama-cli: two questions open"], ["ended", "drama-cli: setup stopped after two (rc3 T1)"], ["agentAsks", "The agent asks (nothing recorded, rc5 T4)"], ["finishAsks", "The agent asks to finish EP006"], ["spendlimit", "Pine credits used up"]].map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></label>
      <label class="select" title="What a send, a check or a Reconcile finds">Outcome<select aria-label="Outcome" value=${S.outcome} onChange=${(e) => set({ outcome: e.target.value })}>
        ${[["ok", "Goes through"], ["refused", "Not submitted (the engine says)"], ["unknown", "No answer"]].map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></label>
      <div class="seg" role="group" aria-label="Theme">${[["dark", "Dark", "moon-stars"], ["light", "Light", "sun-dim"]].map(([k, l, ic]) => html`<button aria-pressed=${String(S.theme === k)} onClick=${() => set({ theme: k })}>${I(ic)}${l}</button>`)}</div>
    </section>`;
  }
  function App() {
    applyTheme();
    const sc = S.screen;
    const main = { home: html`<${Home}/>`, reviews: html`<${Reviews}/>`, episodes: html`<${Episodes}/>`, canvas: html`<${Canvas}/>`, review: html`<${Review}/>` }[sc] || html`<${window.EXTRA[sc]}/>`;
    return html`<div class="app"><${Rail}/><${Side}/>${main}<${AgentPanel}/></div><${Proto}/><${Dialog}/>
      <div class="toasts" aria-live="polite">${S.toasts.map((t) => html`<div class="toast">${t.text}${t.action && html`<button onClick=${t.action.run}>${t.action.label}</button>`}</div>`)}</div>`;
  }
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyB" && e.altKey && (e.metaKey || e.ctrlKey) && !studioPage()) { e.preventDefault(); setAgent(agentMode() === "open" ? "closed" : "open"); }
  });
  window.PD = { html, I, S, set, go, own, jump, openHome, openStage, openLineage, stageNode, toast, money, Status, TopBar, SaysLine, ProjectChips, AgentPanel, SPENT_COVERS, useEffect, useRef, Mark, draw, Submission, submit, recheck };
  // screens.js draws first, once its screens are registered.
})();
