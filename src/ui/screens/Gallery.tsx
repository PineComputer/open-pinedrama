// Every component of the design system in every state, in the light and the dark theme, for
// review and for the end-to-end checks (e2e/gallery.spec.ts). Only in development and in the
// build the end-to-end tests make (VITE_GALLERY=1); a release has no such page.
import { useEffect, useState } from "react";
import { BudgetMeter } from "../components/BudgetMeter.tsx";
import { Button, IconButton } from "../components/Button.tsx";
import { Dialog } from "../components/Dialog.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { Menu } from "../components/Menu.tsx";
import { Segmented } from "../components/Segmented.tsx";
import { FindingCount, type Status, StatusChip } from "../components/StatusChip.tsx";
import { Steps } from "../components/Steps.tsx";
import { Tabs } from "../components/Tabs.tsx";
import { useToast } from "../components/Toast.tsx";
import { Tooltip } from "../components/Tooltip.tsx";

type Theme = "system" | "light" | "dark";

const STATUSES: Status[] = ["work", "line", "you", "accepted", "back", "stale", "redline", "failed"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ds-gallery-section" aria-labelledby={`g-${title}`}>
      <h2 id={`g-${title}`}>{title}</h2>
      <div className="ds-gallery-row">{children}</div>
    </section>
  );
}

export default function Gallery() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme | undefined) ?? "system");
  const [surface, setSurface] = useState("studio");
  const [tab, setTab] = useState("boards");
  const [dialog, setDialog] = useState(false);
  const toast = useToast();
  // System: no theme set, so the tokens follow the system's choice (tokens.css).
  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  return (
    <main className="ds-gallery">
      <header className="ds-gallery-head">
        <h1>Components</h1>
        <Segmented label="Theme" value={theme} onChange={setTheme} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
      </header>

      <Section title="Button">
        <Button variant="primary">Primary</Button>
        <Button>Secondary</Button>
        <Button variant="text">Text</Button>
        <Button variant="danger">Stop the drama</Button>
        <Button variant="seal">Review now</Button>
        <Button variant="primary" size={40}>Upload script</Button>
        <Button size={32}>Small</Button>
        <Button busy>Sending</Button>
        <Button disabledReason="Give every item a verdict first">Send review</Button>
        <IconButton label="Fit the board" icon={<span aria-hidden="true">⤢</span>} />
      </Section>

      <Section title="StatusChip">
        {STATUSES.map((status) => (
          <StatusChip key={status} status={status} />
        ))}
        <FindingCount severity="error" count={1} />
        <FindingCount severity="warn" count={3} />
      </Section>

      <Section title="Segmented">
        <Segmented label="Surface" value={surface} onChange={setSurface} options={[{ value: "studio", label: "Studio" }, { value: "canvas", label: "Canvas" }, { value: "graph", label: "Graph" }]} />
      </Section>

      <Section title="Tabs">
        <Tabs label="EP004" value={tab} onChange={setTab} tabs={[{ value: "boards", label: "Storyboards", count: 6 }, { value: "takes", label: "Takes" }, { value: "cut", label: "Cut" }]}>
          <p className="ds-gallery-note">The {tab} of EP004.</p>
        </Tabs>
      </Section>

      <Section title="Dialog, Menu, Tooltip, Toast">
        <Button onClick={() => setDialog(true)}>Open a dialog</Button>
        <Dialog open={dialog} onOpenChange={setDialog} title="Stop the drama?" description="Every Computer it has running stops. What they made stays." confirm={{ label: "Stop it", danger: true, run: () => toast("Stopped.") }} />
        <Menu label="More" items={[{ label: "Lineage", run: () => toast("Lineage.") }, { label: "Download", run: () => toast("Downloaded.") }, { label: "Not now", run: () => undefined, disabled: true }]} />
        <Tooltip text="Spent of budget">
          <button type="button" className="ds-btn s32">Hover or focus me</button>
        </Tooltip>
        <Button onClick={() => toast("Review sent. Everything you accepted is recorded.", { label: "Next review", run: () => undefined })}>Show a toast</Button>
      </Section>

      <Section title="EmptyState">
        <EmptyState title="No dramas yet" action={<Button variant="primary">Upload script</Button>}>
          Upload a screenplay in any format; the agent turns it into a correct Fountain screenplay and takes it from there.
        </EmptyState>
      </Section>

      <Section title="Steps">
        <Steps
          label="Analyzing"
          steps={[
            { title: "Read the file", detail: "41 pages", state: "done", time: "0:12" },
            { title: "Converted to Fountain", detail: "24 episodes, 212 scenes", state: "done", time: "2:05" },
            { title: "Checking the screenplay", state: "now", time: "1:42" },
            { title: "Your review of the Fountain", state: "you" },
            { title: "Story: bible, cast, locations, props", state: "later" },
          ]}
        />
      </Section>

      <Section title="BudgetMeter">
        <BudgetMeter spentUsd={41.2} budgetUsd={300} />
        <BudgetMeter spentUsd={252} budgetUsd={300} />
        <BudgetMeter spentUsd={300} budgetUsd={300} />
        <BudgetMeter spentUsd={12.5} budgetUsd={null} />
      </Section>
    </main>
  );
}
