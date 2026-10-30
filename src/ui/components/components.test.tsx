// The design system's components, used as a maker uses them: found by role and name, operated
// by pointer and keyboard, in each state they have.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { BudgetMeter } from "./BudgetMeter.tsx";
import { Button, IconButton } from "./Button.tsx";
import { Dialog } from "./Dialog.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { Menu } from "./Menu.tsx";
import { Segmented } from "./Segmented.tsx";
import { FindingCount, StatusChip } from "./StatusChip.tsx";
import { Steps } from "./Steps.tsx";
import { Tabs } from "./Tabs.tsx";
import { ToastProvider, useToast } from "./Toast.tsx";
import { Tooltip } from "./Tooltip.tsx";

describe("Button", () => {
  it("runs its action on click and on Enter", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    render(<Button onClick={run}>Upload script</Button>);
    await user.click(screen.getByRole("button", { name: "Upload script" }));
    screen.getByRole("button", { name: "Upload script" }).focus();
    await user.keyboard("{Enter}");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does nothing while disabled, and says why", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    render(<Button onClick={run} disabledReason="Give every item a verdict first">Send review</Button>);
    const button = screen.getByRole("button", { name: "Send review" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Give every item a verdict first");
    await user.click(button);
    expect(run).not.toHaveBeenCalled();
  });

  it("is busy while its action runs: announced, and not pressed twice", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    render(<Button onClick={run} busy>Send review</Button>);
    const button = screen.getByRole("button", { name: "Send review" });
    expect(button).toHaveAttribute("aria-busy", "true");
    await user.click(button);
    expect(run).not.toHaveBeenCalled();
  });

  it("comes in the variants and sizes the design names", () => {
    render(
      <>
        <Button variant="primary" size={40}>Primary</Button>
        <Button variant="secondary" size={36}>Secondary</Button>
        <Button variant="text" size={32}>Text</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="seal">Review now</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Primary" })).toHaveClass("ds-btn", "primary", "s40");
    expect(screen.getByRole("button", { name: "Text" })).toHaveClass("text", "s32");
    expect(screen.getByRole("button", { name: "Review now" })).toHaveClass("seal");
  });
});

describe("IconButton", () => {
  it("is named by its label, which it shows as a tooltip too", () => {
    render(<IconButton label="Fit the board" icon={<svg />} />);
    expect(screen.getByRole("button", { name: "Fit the board" })).toBeInTheDocument();
  });
});

describe("StatusChip", () => {
  it.each([
    ["work", "At work"],
    ["line", "In line"],
    ["you", "Waiting for you"],
    ["accepted", "Accepted"],
    ["back", "Sent back"],
    ["stale", "Stale"],
    ["redline", "Red line"],
    ["failed", "Failed"],
  ] as const)("says %s as “%s”", (status, words) => {
    render(<StatusChip status={status} />);
    expect(screen.getByText(words)).toHaveClass("ds-chip", status);
  });

  it("counts an observer's findings by severity, and shows nothing for none", () => {
    const { container } = render(
      <>
        <FindingCount severity="error" count={1} />
        <FindingCount severity="warn" count={3} />
        <FindingCount severity="warn" count={0} />
      </>,
    );
    expect(screen.getByText("1 error")).toBeInTheDocument();
    expect(screen.getByText("3 warn")).toBeInTheDocument();
    expect(container.querySelectorAll(".ds-chip")).toHaveLength(2);
  });
});

describe("Segmented", () => {
  function Surfaces() {
    const [value, setValue] = useState("studio");
    return <Segmented label="Surface" value={value} onChange={setValue} options={[{ value: "studio", label: "Studio" }, { value: "canvas", label: "Canvas" }, { value: "graph", label: "Graph" }]} />;
  }

  it("presses the option chosen, and only that one", async () => {
    const user = userEvent.setup();
    render(<Surfaces />);
    const group = screen.getByRole("group", { name: "Surface" });
    await user.click(within(group).getByRole("button", { name: "Canvas" }));
    expect(within(group).getByRole("button", { name: "Canvas" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "Studio" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("Tabs", () => {
  function EpisodeTabs() {
    const [value, setValue] = useState("boards");
    return (
      <Tabs label="EP004" value={value} onChange={setValue} tabs={[{ value: "boards", label: "Storyboards" }, { value: "takes", label: "Takes" }, { value: "cut", label: "Cut" }]}>
        <p>{value} shown</p>
      </Tabs>
    );
  }

  it("selects a tab by click and moves with the arrow keys, showing its panel", async () => {
    const user = userEvent.setup();
    render(<EpisodeTabs />);
    expect(screen.getByRole("tab", { name: "Storyboards" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("boards shown");
    await user.click(screen.getByRole("tab", { name: "Takes" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("takes shown");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Cut" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Cut" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Storyboards" })).toHaveFocus();
  });
});

describe("Dialog", () => {
  function Confirm({ onConfirm }: { onConfirm: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Stop the drama</Button>
        <Dialog open={open} onOpenChange={setOpen} title="Stop the drama?" description="Every Computer it has running stops." confirm={{ label: "Stop it", danger: true, run: onConfirm }} />
      </>
    );
  }

  it("asks, runs on confirm, and closes", async () => {
    const user = userEvent.setup();
    const stop = vi.fn();
    render(<Confirm onConfirm={stop} />);
    await user.click(screen.getByRole("button", { name: "Stop the drama" }));
    const dialog = screen.getByRole("dialog", { name: "Stop the drama?" });
    expect(dialog).toHaveAccessibleDescription("Every Computer it has running stops.");
    await user.click(within(dialog).getByRole("button", { name: "Stop it" }));
    expect(stop).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape without running, and gives focus back", async () => {
    const user = userEvent.setup();
    const stop = vi.fn();
    render(<Confirm onConfirm={stop} />);
    const opener = screen.getByRole("button", { name: "Stop the drama" });
    await user.click(opener);
    await user.keyboard("{Escape}");
    expect(stop).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe("Menu", () => {
  it("opens from its button and runs the item chosen by keyboard", async () => {
    const user = userEvent.setup();
    const download = vi.fn();
    render(<Menu label="More" items={[{ label: "Lineage", run: vi.fn() }, { label: "Download", run: download }]} />);
    screen.getByRole("button", { name: "More" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(download).toHaveBeenCalledOnce();
  });
});

describe("Tooltip", () => {
  it("shows its text when its trigger has focus", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip text="Spent of budget">
        <button>$41.20</button>
      </Tooltip>,
    );
    await user.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Spent of budget");
  });
});

describe("Toast", () => {
  function Sender() {
    const toast = useToast();
    return <Button onClick={() => toast("Review sent.", { label: "Undo", run: () => undefined })}>Send</Button>;
  }

  it("is announced politely, with its action", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Sender />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("Review sent.");
    expect(within(region).getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("names what will appear and the step that brings it", () => {
    render(<EmptyState title="No dramas yet" action={<Button>Upload script</Button>}>Upload a screenplay; the agent takes it from there.</EmptyState>);
    expect(screen.getByRole("heading", { name: "No dramas yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload script" })).toBeInTheDocument();
  });
});

describe("Steps", () => {
  it("lists each step with where it stands, the current one marked", () => {
    render(
      <Steps
        label="Analyzing"
        steps={[
          { title: "Read the file", state: "done" },
          { title: "Check the screenplay", state: "now", time: "1:42" },
          { title: "Your review of the Fountain", state: "later" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Analyzing" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.className)).toEqual(["done", "now", "later"]);
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[1]).toHaveTextContent("1:42");
  });
});

describe("BudgetMeter", () => {
  it("shows what was spent of the budget", () => {
    render(<BudgetMeter spentUsd={41.2} budgetUsd={300} />);
    const meter = screen.getByRole("meter", { name: "Spent of budget" });
    expect(meter).toHaveAttribute("aria-valuenow", "41.2");
    expect(meter).toHaveAttribute("aria-valuemax", "300");
    expect(screen.getByText("$41.20 of $300")).toBeInTheDocument();
  });

  it("warns from 80% and says when the budget is spent", () => {
    const { rerender, container } = render(<BudgetMeter spentUsd={250} budgetUsd={300} />);
    expect(container.firstElementChild).toHaveClass("warn");
    rerender(<BudgetMeter spentUsd={300} budgetUsd={300} />);
    expect(container.firstElementChild).toHaveClass("out");
    expect(screen.getByText("Budget spent")).toBeInTheDocument();
  });

  it("with no cap, shows only what was spent, with no bar to fill", () => {
    render(<BudgetMeter spentUsd={12.5} budgetUsd={null} />);
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.getByText("Spent")).toBeInTheDocument();
    expect(screen.getByText("$12.50")).toBeInTheDocument();
  });
});
