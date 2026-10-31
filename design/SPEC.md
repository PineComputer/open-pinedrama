# Studio re-theme: tokens, icons, components

This is the spec for the pro direction (https://claude.ai/artifact/8v2dRgRKL1Gpu7fZyWG1uR). Its source of truth is studio.css, screens.js and app.js in this folder. Colours, type, space and radii are reveric's tokens (themes.css, tokens.css; classic palette). Values not in those tokens are listed here.

## Theme
- `<html data-palette="classic" data-theme="light|dark">`. The Light/Dark/System setting resolves System from prefers-color-scheme. Dark is the default look.
- Fonts: system sans for UI, system mono for ids, codes, money and times. Courier Prime (or the mono stack) is used only for Fountain text.
- Our own layout sizes: `--rail 52px`, `--side 248px`, `--agent 360px`, `--insp 380px`, `--top 52px`.

## Icons
Phosphor regular, 70 names (icons.js). Sizes: 16 default, 18 in IconButton and NavRail, 15 in Segmented, 14 in chevrons and steps, 24 in AgentBall.

## Components (work-04's names; class in the prototype)
| Component | Class | Spec |
|---|---|---|
| Button | .btn | Pill, 1px border-input. Sizes sm 26 / md 32 / lg 40. Variants: primary (accent bg, on-accent text), secondary (transparent + border), ghost (no border), danger (error text, 40% error border). 12.5px/600. |
| IconButton | .ibtn | 32 square, radius-medium, hover = --hover, `.on` = --selected. |
| StatusChip | .st | 22 high pill, 11px/600, 6px dot. States: you (warning-text), work (pulsing text-primary), accepted (success), back / redline / err (error), stale (dashed dot). Over pictures: blurred canvas 72%. |
| Segmented | .seg | Track: surface-container, 1px border, pill, 3px padding. Item 28 high; on = surface-container-high + 1px border-input ring. |
| Tabs | .utabs | Underline tabs, 40 high, 2px text-primary underline, count in text-subtle. |
| FilterChip | .fchip | 30 high pill; on = accent / on-accent. Used on Episodes. |
| Dialog | .dialog | 440 max, radius-2xl, shadow-dialog, actions right: Cancel (secondary), then primary or danger (filled error). |
| Toast | .toast | Accent bg, bottom centre, an optional underlined action. |
| NavRail | .rail | 52 wide, surface-dim, 36px buttons, current = --selected. The brand mark sits at the bottom. |
| Sidebar | .side | 248, surface-dim, collapsible from the rail's first button. Holds the project head, nav items (.navi, 36 high, count badge in warning-text), EpisodeTree (.tree, 28-high rows: code, now-line, dot) and a BudgetMeter foot. |
| Breadcrumb | .crumb | 13px, last item text-primary/600, caret separators. Phone: last item only. |
| TopBar | .top | 52 high: back, Breadcrumb, then StopControl and NextReview (primary sm with count). |
| EpisodeViews | .seg in .bar2 | List / Canvas, inside an episode only. Story, Assets, Episodes and Delivery have no view switch; Lineage opens from an item (IA §3). |
| ProjectChip | .chip | 34 high pill, surface-container; preset (26px face), spec, spent (tooltip: "Agent turns and video, priced when each turn ends."). |
| BudgetMeter | .meter | 4px track; solid = spent, dashed = in flight. |
| StopControl | in .top | "Stop drama" (danger sm) → Dialog → "Stopping…" (disabled, spinner) → "Stopped" chip + "Resume". |
| StopBanner | .banner | Dashed error border: "Stopping — keep the app open". The solid variant reads "<title> is stopped" with Resume. |
| StopCard | .stopcard | radius-2xl. Header 12px/700: red line uses the error bg; budget, cap and env use surface-container-high. Body: title, Code (mono), "drama-cli said" (mono 11.5, surface-container box, verbatim), actions, note. |
| DramaCard | .pcard | 3:4 cover, StatusChip top-left, progress bar 3px, title 14/700, meta, tags. |
| NewDramaCard | .newcard | Dashed border, 48px plus circle; drop target. |
| EpisodeCard | .epcard | 9:16 cover, radius-large, code tag top-left, StatusChip top-right, 5-step strip at the bottom (d solid, w dashed, y warning), title, now-line, spent (mono). |
| AgentPanel | .agent | 360, surface-dim. Sections: Running (.arow with Watch/Stop), Decisions (.dec, 34×46 thumbs), Process (.process + .steps), messages (.msg), Recent work, Next chips, Composer (radius-xl, send 30px circle). Floating: 380, radius-2xl, shadow-dialog. |
| AgentBall | .ball | 52 circle, badge (warning-text), spinning ring when busy. |
| FollowPill | .follow | 34 pill, live dot. Labels "Following the agent" / "Follow the agent". |
| CanvasToolbar | .ctool | Bottom-left pill: fit, zoom out, % readout, zoom in, minimap toggle. |
| Minimap | .minimap | 168×104, bottom right next to the ball. |
| CanvasNode | .cnode | Label above (icon + name + StatusChip), picture card radius 10, selected = 1px text-primary ring. A segment node pairs its board with its latest take. |
| NodeDetail | .detail | 300 floating card: picture, kv, Review / Lineage, read-only note. |
| ReviewRoom | .room | Reel 232 · Stage (9:16 player, 60px white play button) · Inspector 380. |
| TakeCompare | .seg in .controls | "t02 · new" / "t01 · earlier". |
| VerdictBar | .verdict | Accept (success when on) / Send back (error) / Accept with note (accent). Accept stays disabled until the take is watched to the end. A reason is required for Send back. |
| SendBar | .sendbar | Pips per item, "n of m decided", "Send review". |
| SetupSteps | .setup | 26px numbered circles: you = warning fill, work = pulsing ring. |
| Dropzone | .dropzone | Dashed, surface-container; over = --selected. |
| PresetPicker | .preset | Radio cards, 2 columns. Shows no recommendation (the person chooses). |
| FountainDiff | .fpanes | "Your file" (numbered) · "Fountain" (screenplay.md). Clicking a line highlights both sides. A question line uses warning-bg with Day/Night Segmented. |
| AcceptInWords | .faccept | Textarea plus Send back and "Accept the rewrite". Accept needs the answer and the words. |
| CastCard | .castcard | A character in Assets › Characters. 16:9 sheet; name, version, role, "Also called" tags, Finding, card verdicts (.mini). |
| PlateCard | .placecard | A location in Assets › Locations. 9:14 picture. |
| Finding | .finding | warn (warning-bg) / err (deletion-bg), 14px icon. |
| LineageGraph | .graph | Columns: Screenplay · Bible · Looks, plates, props · Storyboards · Takes · Cut. Nodes 156×112: the picture over two lines, the name on the first (ellipsised past the card's width), the version and state chip on the second. Upstream and downstream wires turn solid text-primary; stale is dashed; unrelated nodes drop to 40% opacity. |
| ExportMenu | .exportmenu, .menu, .mi | In the drama's top bar, before Stop. Two downloads: ComfyUI workflow (.json, the lineage each stop returns) and infinite-canvas (.zip, with the hint "Open infinite-canvas → Import → choose this file"). Each is disabled, saying why, until a stop has returned its file. |
| StaleBar | .stalebar | Dashed. Gives the reason from the export; never a cost. One action: "Ask the agent to redo them", sent as a steering note. No "Keep as is": drama-cli has no action for keeping a stale item. |
| CutTimeline | .tl | Segment strips by length, NotePins (18px warning circles) at their times, and a playhead. |
| NoteList | .noterow / .addnote | Times in a warning-bg mono button that seeks; adds at the playhead with Enter. |

## Labels (ship as written)
Accept, Send back, Accept with note, Send review, Next review, Stop drama, Stopping…, Stopped, Resume, Keep running, Stop analyzing, Review the rewrite, Accept the rewrite, Upload script, Start, Accept cut, Following the agent / Follow the agent, List / Canvas, Lineage, Script / Story / Assets / Episodes / Delivery, Characters / Locations / Props, Out of date.

"Studio" names the app only. Graph, World and Bible / Cast / World as navigation are retired: the bible lives in Story, and Lineage is a view of an item, not a page (IA §3, §10, §16).
