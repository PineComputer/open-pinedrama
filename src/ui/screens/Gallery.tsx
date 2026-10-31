// design/'s components (design/SPEC.md, "Components") in their states, in the light and the dark
// theme, for review and for the end-to-end checks (e2e/gallery.spec.ts): the design's own markup,
// and the kit's components the screens draw with. Only in development and in the build the
// end-to-end tests make (VITE_GALLERY=1); a release has no such page.
import { useEffect, useState } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { toast } from "sonner";
import type { Refusal } from "../../shared/refusal.ts";
import { Button, IconButton } from "../components/Button.tsx";
import { Dialog } from "../components/Dialog.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { Menu } from "../components/Menu.tsx";
import { Segmented } from "../components/Segmented.tsx";
import { type Status, StatusChip } from "../components/StatusChip.tsx";
import { StopCard } from "../components/StopCard.tsx";
import { Tooltip } from "../components/Tooltip.tsx";
import { Icon } from "../icons.tsx";
import type { DramaView } from "../../shared/types.ts";
import { StopControl } from "../shell/TopBar.tsx";
import { applyTheme, type ThemeChoice, themeChoice } from "../theme/theme.ts";

// The three kinds of stop, in drama-cli's words (shared/refusal.ts).
const STOPS: Refusal[] = [
  { code: "RedLine", message: "Bible v2 is not usable: red line: instructions to make an explosive (EP003 scene 4); report it to the person and pass their decision back with drama-cli bible …", param: null, action: "ask_person" },
  { code: "SetLimitExceeded.max_new_takes", message: "seg01 has had 2 new paid takes, the limit shoot.max_new_takes (2); ask the person before shooting it again", param: "shoot.max_new_takes", action: "ask_person" },
  { code: "Refused", message: "Cannot determine Pine artifact access before provider submission; run pine-artifact status and fix its error before retrying", param: null, action: null },
];

const STATUSES: Status[] = ["work", "line", "you", "accepted", "back", "stale", "redline", "failed"];

// StopControl's states (D74), drawn by the product's own component: running with two Computers working, pausing while
// they stop, and paused. Only the fields it reads.
const computer = (state: string) => ({ id: state, label: "PC-1", state, sessions: [{ id: `s-${state}`, state: "open", waiting: false }] });
const PAUSE_STATES = [
  { status: "production", crew: [computer("running"), { ...computer("running"), id: "running-2" }] },
  { status: "stopped", crew: [computer("stopping")] },
  { status: "stopped", crew: [] },
].map((drama, n) => ({ ...drama, id: `gallery-${n}`, title: "Bride on Bail" }) as unknown as DramaView);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ds-gallery-section" aria-labelledby={`g-${title}`}>
      <h2 id={`g-${title}`}>{title}</h2>
      <div className="ds-gallery-row">{children}</div>
    </section>
  );
}

export default function Gallery() {
  const [theme, setTheme] = useState<ThemeChoice>(themeChoice);
  const [surface, setSurface] = useState("studio");
  const [filter, setFilter] = useState("all");
  const [order, setOrder] = useState("number");
  const [dialog, setDialog] = useState(false);
  // For this page only: the maker's own choice, in Settings, stays as it was.
  useEffect(() => applyTheme(theme), [theme]);
  return (
    <main className="ds-gallery">
      <header className="ds-gallery-head">
        <h1>Components</h1>
        <Segmented label="Theme" value={theme} onChange={setTheme} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
      </header>

      <Section title="Button">
        <button type="button" className="btn primary">Primary</button>
        <button type="button" className="btn">Secondary</button>
        <button type="button" className="btn ghost">Ghost</button>
        <button type="button" className="btn sm danger">
          Stop the episode
        </button>
        <button type="button" className="btn lg primary">
          <Icon name="upload" className="ic" />
          Upload script
        </button>
        <button type="button" className="btn sm primary">
          Next review <span className="n">4</span>
        </button>
        <Button busy>Sending</Button>
        <Button disabledReason="Give every item a verdict first">Send review</Button>
      </Section>

      <Section title="IconButton">
        <button type="button" className="ibtn" aria-label="Fit the board">
          <Icon name="frame-corners" className="ic" />
        </button>
        <button type="button" className="ibtn on" aria-label="Sidebar" aria-pressed="true">
          <Icon name="list" className="ic" />
        </button>
        <IconButton label="Fit the board" icon="frame-corners" />
      </Section>

      <Section title="StatusChip">
        {STATUSES.map((status) => (
          <StatusChip key={status} status={status} />
        ))}
      </Section>

      <Section title="Segmented">
        <div className="seg" role="group" aria-label="Surface">
          {[
            ["studio", "Studio", "squares-four"],
            ["canvas", "Canvas", "flow-arrow"],
            ["graph", "Graph", "tree-structure"],
          ].map(([value, label, icon]) => (
            <button key={value} type="button" aria-pressed={surface === value} onClick={() => setSurface(value)}>
              <Icon name={icon as "list"} className="ic" />
              {label}
            </button>
          ))}
        </div>
        <Segmented label="Order" value={order} onChange={setOrder} options={[{ value: "number", label: "Episode order" }, { value: "needs", label: "Needs you first" }]} />
      </Section>

      <Section title="Tabs">
        <TabsPrimitive.Root defaultValue="bible">
          <div className="tabsrow">
            <TabsPrimitive.List className="utabs" aria-label="Bible">
              {[
                ["bible", "Bible", undefined],
                ["cast", "Cast", 8],
                ["scenes", "Scenes", 6],
                ["props", "Props", 1],
              ].map(([value, label, count]) => (
                <TabsPrimitive.Trigger key={value} value={String(value)}>
                  {label}
                  {count !== undefined && <small> {count}</small>}
                </TabsPrimitive.Trigger>
              ))}
            </TabsPrimitive.List>
          </div>
          {["bible", "cast", "scenes", "props"].map((value) => (
            <TabsPrimitive.Content key={value} value={value} className="ds-gallery-note">
              The drama's {value}.
            </TabsPrimitive.Content>
          ))}
        </TabsPrimitive.Root>
      </Section>

      <Section title="FilterChip">
        {[
          ["all", "All", 24],
          ["you", "Needs you", 3],
          ["work", "Working", 2],
          ["line", "In line", 18],
        ].map(([value, label, count]) => (
          <button key={value} type="button" className="fchip" aria-pressed={filter === value} onClick={() => setFilter(String(value))}>
            {label}
            <small>{count}</small>
          </button>
        ))}
      </Section>

      <Section title="Dialog, Menu, Tooltip, Toast">
        <button type="button" className="btn" onClick={() => setDialog(true)}>
          Open a dialog
        </button>
        <Dialog
          open={dialog}
          onOpenChange={setDialog}
          title="Pause production of Bride on Bail?"
          description="The 2 Computers working stop now; their work stops at its last saved pack. Nothing new starts and nothing more is billed. Nothing is deleted. Resume carries on from where each episode stopped."
          cancel="Keep working"
          confirm={{ label: "Pause production", run: () => toast("Paused.") }}
        />
        <Menu label="More" items={[{ label: "Lineage", run: () => toast("Lineage.") }, { label: "Download", run: () => toast("Downloaded.") }, { label: "Not now", run: () => undefined, disabled: true }]} />
        <Tooltip text="Spent of budget">
          <button type="button" className="btn">
            Hover or focus me
          </button>
        </Tooltip>
        <button type="button" className="btn" onClick={() => toast("Review sent. Everything you accepted is recorded.", { action: { label: "Next review", onClick: () => undefined } })}>
          Show a toast
        </button>
      </Section>

      <Section title="EmptyState">
        <EmptyState title="No dramas yet" action={<button type="button" className="btn primary">Upload script</button>}>
          Upload a screenplay in any format; the agent turns it into a correct Fountain screenplay and takes it from there.
        </EmptyState>
      </Section>

      <Section title="StopControl">
        {PAUSE_STATES.map((drama) => (
          <div key={drama.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StopControl drama={drama} />
          </div>
        ))}
      </Section>

      <Section title="StopBanner">
        {/* Only a stop the engine made for a reason of its own (Drama.tsx); a pause by the maker has none (D74). */}
        <div className="banner done" style={{ flex: "1 1 100%" }}>
          <b>Bride on Bail is stopped</b>
          <span className="grow">Your Pine project doesn't offer the drama skill yet, so nothing was started. Ask Pine to turn it on for the project, then try again.</span>
          <button type="button" className="btn sm">
            Rehearse instead
          </button>
          <button type="button" className="btn sm primary">
            Resume
          </button>
        </div>
      </Section>

      <Section title="StopCard">
        {STOPS.map((refusal) => (
          <div key={refusal.code} style={{ flex: "1 1 320px", alignSelf: "flex-start" }}>
            <StopCard refusal={refusal} episode="EP003" />
          </div>
        ))}
      </Section>

      <Section title="BudgetMeter">
        {[
          [14, 2],
          [84, 6],
          [100, 0],
        ].map(([spent, flying]) => (
          <div key={spent} className="meter" role="meter" aria-label="Spent of the budget" aria-valuemin={0} aria-valuemax={100} aria-valuenow={spent} style={{ width: 220 }}>
            <i style={{ width: `${spent}%` }} />
            {flying > 0 && <i className="fly" style={{ width: `${flying}%` }} />}
          </div>
        ))}
      </Section>
    </main>
  );
}
