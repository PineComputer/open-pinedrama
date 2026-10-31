# Studio re-theme: tokens, icons, components

This is the spec for the pro direction (https://claude.ai/artifact/8v2dRgRKL1Gpu7fZyWG1uR). Its source of truth is studio.css, screens.js and app.js in this folder. Colours, type, space and radii are reveric's tokens (themes.css, tokens.css; classic palette). Values not in those tokens are listed here.

## Theme
- `<html data-palette="classic" data-theme="light|dark">`. The Light/Dark/System setting resolves System from prefers-color-scheme. Dark is the default look.
- Fonts: system sans for UI, system mono for ids, codes, money and times. Courier Prime (or the mono stack) is used only for Fountain text.
- Our own layout sizes: `--rail 52px`, `--side 248px`, `--agent 360px`, `--insp 380px`, `--top 52px`.

## Icons
Phosphor regular, 70 names (icons.js). Sizes: 16 default, 18 in IconButton and NavRail, 15 in Segmented, 14 in chevrons and steps, 24 in AgentBall.

## Components (work-04's names; class in the prototype)
| Component | Class | Spec | Ground |
|---|---|---|---|
| Button | .btn | Pill, 1px border-input. Sizes sm 26 / md 32 / lg 40. Variants: primary (accent bg, on-accent text), secondary (transparent + border), ghost (no border), danger (error text, 40% error border). 12.5px/600. | HIG Buttons; APG Button |
| IconButton | .ibtn | 32 square, radius-medium, hover = --hover, `.on` = --selected. | APG Button (name from `aria-label`); WCAG 2.2, 2.5.3 Label in Name; HIG Buttons |
| StatusChip | .st | 22 high pill, 11px/600, 6px dot. States: you (warning-text), work (pulsing text-primary), accepted (success), back / redline / err (error), stale (dashed dot). Over pictures: blurred canvas 72%. | [Five maker-facing states](../docs/design-principles.md#4-five-maker-facing-states); WCAG 2.2, 1.4.1 Use of Color (dot plus words); Linear's statuses |
| Segmented | .seg | Track: surface-container, 1px border, pill, 3px padding. Item 28 high; on = surface-container-high + 1px border-input ring. | HIG Segmented controls; APG Radio Group (one choice) |
| Tabs | .utabs | Underline tabs, 40 high, 2px text-primary underline, count in text-subtle. | APG Tabs; HIG Tab views |
| FilterChip | .fchip | 30 high pill; on = accent / on-accent. Used on Episodes. | Material 3 Chips, filter chips; [D34](../docs/decisions.md#d34-2026-10-30--the-episodes-board-filters-by-the-makers-states) |
| Dialog | .dialog | 440 max, radius-2xl, shadow-dialog, actions right: Cancel (secondary), then primary or danger (filled error). | APG Alert and Message Dialogs; HIG Alerts (the default action last, destructive in red) |
| Toast | .toast | Accent bg, bottom centre, an optional underlined action. | Material 3 Snackbar; sonner ([D11](../docs/decisions.md#d11-2026-10-30--mature-libraries-hand-writing-what-one-covers-needs-approval)); never the only feedback ([principle 5](../docs/design-principles.md#5-confirm-only-when-spend-grows-or-done-work-is-affected)) |
| NavRail | .rail | 52 wide, surface-dim, 36px buttons, current = --selected. The brand mark sits at the bottom. | VS Code's Activity Bar; [D16](../docs/decisions.md#d16-2026-10-30--the-navigation-a-studio-wide-rail-the-dramas-tree-one-home-per-object) |
| Sidebar | .side | 248, surface-dim, collapsible from the rail's first button. Holds the project head, nav items (.navi, 36 high, count badge in warning-text), EpisodeTree (.tree, 28-high rows: code, now-line, dot) and a BudgetMeter foot. | VS Code's Primary Sidebar; HIG Sidebars; [D16](../docs/decisions.md#d16-2026-10-30--the-navigation-a-studio-wide-rail-the-dramas-tree-one-home-per-object) |
| Breadcrumb | .crumb | 13px, last item text-primary/600, caret separators. Phone: last item only. | APG Breadcrumb; VS Code's breadcrumbs; [D26](../docs/decisions.md#d26-2026-10-30--crumbs-say-where-a-thing-belongs-back-says-where-you-came-from) |
| TopBar | .top | 52 high: back, Breadcrumb, then StopControl and NextReview (primary sm with count). | HIG Toolbars; VS Code's editor title area; [D26](../docs/decisions.md#d26-2026-10-30--crumbs-say-where-a-thing-belongs-back-says-where-you-came-from) |
| EpisodeViews | .seg in .bar2 | List / Canvas, inside an episode only. Story, Assets, Episodes and Delivery have no view switch; Lineage opens from an item (IA §3). | HIG Segmented controls; [D16](../docs/decisions.md#d16-2026-10-30--the-navigation-a-studio-wide-rail-the-dramas-tree-one-home-per-object) |
| ProjectChip | .chip | 34 high pill, surface-container; preset (26px face), spec, spent (tooltip: "Agent turns and video, priced when each turn ends."). | [Always clear what you act on](../docs/design-principles.md#3-always-clear-what-you-act-on); the chip's look is ours, untested |
| BudgetMeter | .meter | 4px track; solid = spent, dashed = in flight. | APG Meter; HIG Progress indicators |
| StopControl | in .top | "Stop drama" (danger sm) → Dialog → "Stopping…" (disabled, spinner) → "Stopped" chip + "Resume". | HIG Alerts (confirm a destructive action); [principle 5](../docs/design-principles.md#5-confirm-only-when-spend-grows-or-done-work-is-affected); Nielsen 1, visibility of system status |
| StopBanner | .banner | Dashed error border: "Stopping — keep the app open". The solid variant reads "<title> is stopped" with Resume. | Nielsen 1, visibility of system status; APG Alert |
| StopCard | .stopcard | radius-2xl. Header 12px/700: red line uses the error bg; budget, cap and env use surface-container-high. Body: title, Code (mono), "drama-cli said" (mono 11.5, surface-container box, verbatim), actions, note. | NN/g Error-Message Guidelines; [principle 6](../docs/design-principles.md#6-errors-give-the-next-step); [D14](../docs/decisions.md#d14-2026-10-30--missing-credentials-are-their-own-stop-a-budget-refusal-is-the-generic-card) |
| DramaCard | .pcard | 3:4 cover, StatusChip top-left, progress bar 3px, title 14/700, meta, tags. | LocalMiniDrama's project cards (`docs/references/localminidrama-projects.png`) |
| NewDramaCard | .newcard | Dashed border, 48px plus circle; drop target. | LocalMiniDrama's quick-start card (`docs/references/localminidrama-projects.png`); react-dropzone |
| EpisodeCard | .epcard | 9:16 cover, radius-large, code tag top-left, StatusChip top-right, 5-step strip at the bottom (d solid, w dashed, y warning), title, now-line, spent (mono). | [Five maker-facing states](../docs/design-principles.md#4-five-maker-facing-states); the 9:16 cover and step strip are ours, untested |
| AgentPanel | .agent | 360, surface-dim. Sections: Running (.arow with Watch/Stop), Decisions (.dec, 34×46 thumbs), Process (.process + .steps), messages (.msg), Recent work, Next chips, Composer (radius-xl, send 30px circle). Floating: 380, radius-2xl, shadow-dialog. | VS Code's Panel and Chat view; Microsoft's Guidelines for Human-AI Interaction; [D31](../docs/decisions.md#d31-2026-10-30--the-agent-panel-speaks-to-the-pinned-session-else-the-episode-in-view) |
| AgentBall | .ball | 52 circle, badge (warning-text), spinning ring when busy. | Ours, untested: the folded agent panel ([D32](../docs/decisions.md#d32-2026-10-30--narrow-windows-the-sidebar-is-a-drawer-the-agent-is-the-ball)) |
| FollowPill | .follow | 34 pill, live dot. Labels "Following the agent" / "Follow the agent". | Figma's Follow a collaborator (spotlight) |
| CanvasToolbar | .ctool | Bottom-left pill: fit, zoom out, % readout, zoom in, minimap toggle. | React Flow's Controls; Figma's zoom controls |
| Minimap | .minimap | 168×104, bottom right next to the ball. | React Flow's MiniMap |
| CanvasNode | .cnode | Label above (icon + name + StatusChip), picture card radius 10, selected = 1px text-primary ring. A segment node pairs its board with its latest take. Picking a node zooms it to a readable size, its bar and panel in view, up to 150%; Esc, Close or Fit zoom back. A take or cut plays on its node: a control bar over its foot (play, time, slider, duration, sound, full screen) on the picked node and on hover, muted until the sound is on. | React Flow's custom nodes; [D28](../docs/decisions.md#d28-2026-10-30--the-model-badge-stays-on-canvas-nodes) for the model badge; Figma's Zoom to selection and React Flow's fitView({ nodes }), [D37](../docs/decisions.md#d37-2026-10-30--a-picked-node-zooms-to-a-readable-size), for the zoom; liblib's video node, Premiere's, Frame.io's and YouTube's control order and media-chrome, [D39](../docs/decisions.md#d39-2026-10-30--a-take-or-cut-plays-on-its-canvas-node), for a take's player |
| NodeDetail | .detail | 300 floating card: picture, kv, Review / Lineage, read-only note. | React Flow's node toolbar; LibTV's node detail (Codex's review, section 5; no screenshot yet) |
| ReviewRoom | .room | Reel 232 · Stage (9:16 player, 60px white play button) · Inspector 380. | Frame.io's review player with comments; [D17](../docs/decisions.md#d17-2026-10-30--the-maker-watches-every-take-and-every-cut) |
| TakeCompare | .seg in .controls | "t02 · new" / "t01 · earlier". | Frame.io's version stacks and compare; HIG Segmented controls |
| VerdictBar | .verdict | Accept (success when on) / Send back (error) / Accept with note (accent). Accept stays disabled until the take is watched to the end. A reason is required for Send back. | GitHub's review verdicts (Approve, Request changes, Comment); [principle 2](../docs/design-principles.md#2-one-action-one-meaning) |
| SendBar | .sendbar | Pips per item, "n of m decided", "Send review". | GitHub's pending review and Submit review; [D25](../docs/decisions.md#d25-2026-10-30--one-submission-state-for-every-send) |
| SetupSteps | .setup | 26px numbered circles: you = warning fill, work = pulsing ring. | Material Design's steppers; Nielsen 1, visibility of system status |
| Dropzone | .dropzone | Dashed, surface-container; over = --selected. | react-dropzone; HIG Drag and drop |
| PresetPicker | .presets › label.preset | The kit's RadioGroup (Radix; WAI-ARIA APG radio group) as cards, 2 columns: each card a label holding the kit's radio and its text. Shows no recommendation (the person chooses). | APG Radio Group; Radix RadioGroup |
| ReviewingChoice | .presets.one › .preset | The same RadioGroup, one column: "Your reviews", each option its label and hint. | APG Radio Group; [D33](../docs/decisions.md#d33-2026-10-30--the-review-options-name-what-the-maker-watches) |
| FountainDiff | .fpanes | "Your file" (numbered) · "Fountain" (screenplay.md). Clicking a line highlights both sides. A question line uses warning-bg with Day/Night Segmented. | GitHub's split diff view; jsdiff |
| AcceptInWords | .faccept | Textarea plus Send back and "Accept the rewrite". Accept needs the answer and the words. | drama-cli: a screenplay rewrite is accepted in the person's own words (short_drama `screenplay check`, `--person`) |
| AssetCard | .assetcard | A character, location or prop in Assets (D57): the picture at its own ratio, the name, the version and the status pill; nothing else. Grid .assetgrid, 5–6 a row. | Apple Photos and Finder's picture grid; liblib's 资产 library |
| Finding | .finding | warn (warning-bg) / err (deletion-bg), 14px icon. | drama-cli's `understand.policy` severities, after ESLint's `error` and `warn`; NN/g Error-Message Guidelines |
| LineageGraph | .graph | Columns: Screenplay · Bible · Looks, plates, props · Storyboards · Takes · Cut. Nodes 156×112: the picture over two lines, the name on the first (ellipsised past the card's width), the version and state chip on the second. Upstream and downstream wires turn solid text-primary; stale is dashed; unrelated nodes drop to 40% opacity. | drama-cli's `export comfyui` graph; React Flow; [D4](../docs/decisions.md#d4-2026-10-22--the-lineage-is-drawn-natively-comfyui-runs-nowhere) |
| ExportMenu | .exportmenu, .menu, .mi | In the drama's top bar, before Stop. Two downloads: ComfyUI workflow (.json, the lineage each stop returns) and infinite-canvas (.zip, with the hint "Open infinite-canvas → Import → choose this file"). Each is disabled, saying why, until a stop has returned its file. | APG Menu Button; HIG Pull-down buttons; [D20](../docs/decisions.md#d20-2026-10-30--export-belongs-to-its-owner) |
| OutOfDate | .deliv.ood | The drama's Out of date page: one row per item (kind, name, version, the reason in drama-cli's words, its `problems` verbatim, or "Made from …, which is out of date" for what drama-cli calls fresh but was made from an out-of-date version). Groups: Assets, then each episode. The row opens the item's home, its Lineage button the item's Lineage; Back returns with the row marked. One action per group, to the session that owns it: "Ask the setup's agent to redo them", "Ask EP006's agent to redo them". Remaking spends, so it confirms first with its impact ("EP006's agent will remake 3 items: …. It spends from the drama's budget; the earlier versions stay.") and is one submission whose state stays on the group's row, shown by the shared Submission (sending, sent, not submitted: Send again, or no answer: Check, never sent twice); never a price, and no "Keep as is": drama-cli has no action for keeping an out-of-date item. Empty: "Nothing is out of date.", and the sidebar shows no count. | Linear's list views; [D22](../docs/decisions.md#d22-2026-10-30--out-of-date-is-redone-by-its-owners-session-one-row-or-the-whole-group) |
| CutTimeline | .tl | Segment strips by length, NotePins (18px warning circles) at their times, and a playhead. | Premiere's and DaVinci Resolve's timelines; Frame.io's comment markers |
| NoteList | .noterow / .addnote | Times in a warning-bg mono button that seeks; adds at the playhead with Enter. | Frame.io's time-stamped comments |

**Grounds, by strength** ([design principle 14](../docs/design-principles.md#14-every-element-cites-its-ground)):
HIG is Apple's Human Interface Guidelines (https://developer.apple.com/design/human-interface-guidelines);
APG is the WAI-ARIA Authoring Practices Guide, by pattern (https://www.w3.org/WAI/ARIA/apg/patterns/);
WCAG 2.2 (https://www.w3.org/TR/WCAG22/); Nielsen's ten heuristics
(https://www.nngroup.com/articles/ten-usability-heuristics/); NN/g's Error-Message Guidelines
(https://www.nngroup.com/articles/error-message-guidelines/); Material 3 (https://m3.material.io/components).
A tool's name means its own documentation of that feature. "Ours, untested" is checked in the next Codex
walkthrough.

## Labels (ship as written)
Accept, Send back, Accept with note, Send review, Next review, Stop drama, Stopping…, Stopped, Resume, Keep running, Stop analyzing, Review the rewrite, Accept the rewrite, Upload script, Start, Accept cut, Following the agent / Follow the agent, List / Canvas, Lineage, Script / Story / Assets / Episodes / Delivery, Characters / Locations / Props, Out of date.

Names of things (IA §10): Take / 视频版本 (t01, t02…), never 镜头 (a shot) or 片段 (a segment); Cut / 剪辑成片 (v1, v2…), an episode's versioned film; Delivery / 交付, the drama's accepted cuts; Locations, never Scenes, which stay the screenplay's scenes (场戏).

"Studio" names the app only. Graph, World and Bible / Cast / World as navigation are retired: the bible lives in Story, and Lineage is a view of an item, not a page (IA §3, §10, §16).
