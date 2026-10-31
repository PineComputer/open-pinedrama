// The design system's components, used as a maker uses them: found by role and name, operated
// by pointer and keyboard, in each state they have.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button, IconButton } from "./Button.tsx";
import { Dialog } from "./Dialog.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { Menu } from "./Menu.tsx";
import { Segmented } from "./Segmented.tsx";
import { StatusChip } from "./StatusChip.tsx";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import type { Refusal } from "../../shared/refusal.ts";
import { StopCard } from "./StopCard.tsx";
import { Tooltip } from "./Tooltip.tsx";

describe("Button", () => {
  it("runs its action on click and on Enter", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    render(<Button variant="outline" onClick={run}>Upload script</Button>);
    await user.click(screen.getByRole("button", { name: "Upload script" }));
    screen.getByRole("button", { name: "Upload script" }).focus();
    await user.keyboard("{Enter}");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does nothing while disabled, and says why", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    render(<Button variant="outline" onClick={run} disabledReason="Give every item a verdict first">Send review</Button>);
    const button = screen.getByRole("button", { name: "Send review" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Give every item a verdict first");
    await user.click(button);
    expect(run).not.toHaveBeenCalled();
  });

  it("is busy while its action runs: announced, and not pressed twice", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    render(<Button variant="outline" onClick={run} busy>Send review</Button>);
    const button = screen.getByRole("button", { name: "Send review" });
    expect(button).toHaveAttribute("aria-busy", "true");
    await user.click(button);
    expect(run).not.toHaveBeenCalled();
  });

  it("comes in the variants and sizes the design names", () => {
    render(
      <>
        <Button variant="default" size="lg">Primary</Button>
        <Button variant="outline">Secondary</Button>
        <Button variant="ghost" size="sm">Ghost</Button>
        <Button variant="destructive" size="sm">Stop drama</Button>
      </>,
    );
    const shape = (name: string) => [screen.getByRole("button", { name }).dataset.variant, screen.getByRole("button", { name }).dataset.size];
    expect(shape("Primary")).toEqual(["default", "lg"]);
    expect(shape("Secondary")).toEqual(["outline", "default"]);
    expect(shape("Ghost")).toEqual(["ghost", "sm"]);
    expect(shape("Stop drama")).toEqual(["destructive", "sm"]);
  });
});

describe("IconButton", () => {
  it("is named by its label, which it shows as a tooltip too", () => {
    render(<IconButton label="Fit the board" icon="frame-corners" />);
    expect(screen.getByRole("button", { name: "Fit the board" })).toBeInTheDocument();
  });

  it("says when it is on, as the rail's current place is", () => {
    render(<IconButton label="Sidebar" icon="list" on />);
    expect(screen.getByRole("button", { name: "Sidebar" })).toHaveClass("bg-selected");
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
    expect(screen.getByText(words)).toHaveAttribute("data-status", status);
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
    const group = screen.getByRole("radiogroup", { name: "Surface" });
    await user.click(within(group).getByRole("radio", { name: "Canvas" }));
    expect(within(group).getByRole("radio", { name: "Canvas" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "Studio" })).not.toBeChecked();
  });
});

describe("Dialog", () => {
  function Confirm({ onConfirm }: { onConfirm: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="outline" onClick={() => setOpen(true)}>Stop the drama</Button>
        <Dialog open={open} onOpenChange={setOpen} title="Stop the drama?" description="Every Computer it has running stops." confirm={{ label: "Stop it", danger: true, run: onConfirm }} />
      </>
    );
  }

  it("asks, runs on confirm, and closes", async () => {
    const user = userEvent.setup();
    const stop = vi.fn();
    render(<Confirm onConfirm={stop} />);
    await user.click(screen.getByRole("button", { name: "Stop the drama" }));
    const dialog = screen.getByRole("alertdialog", { name: "Stop the drama?" });
    expect(dialog).toHaveAccessibleDescription("Every Computer it has running stops.");
    await user.click(within(dialog).getByRole("button", { name: "Stop it" }));
    expect(stop).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("closes on Escape without running, and gives focus back", async () => {
    const user = userEvent.setup();
    const stop = vi.fn();
    render(<Confirm onConfirm={stop} />);
    const opener = screen.getByRole("button", { name: "Stop the drama" });
    await user.click(opener);
    await user.keyboard("{Escape}");
    expect(stop).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
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
  it("is announced politely, with its action", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Toaster />
        <Button variant="outline" onClick={() => toast("Review sent.", { action: { label: "Undo", onClick: () => undefined } })}>
          Send
        </Button>
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    const shown = await screen.findByText("Review sent.");
    expect(shown.closest("[aria-live=polite]")).not.toBeNull();
    expect(await screen.findByRole("button", { name: "Undo" })).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("names what will appear and the step that brings it", () => {
    render(<EmptyState title="No dramas yet" action={<Button>Upload script</Button>}>Upload a screenplay; the agent takes it from there.</EmptyState>);
    expect(screen.getByRole("heading", { name: "No dramas yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload script" })).toBeInTheDocument();
  });
});

describe("in the maker's language", () => {
  it("says states in Chinese when the studio is in Chinese", async () => {
    const { setLang } = await import("../i18n.ts");
    act(() => setLang("zh"));
    try {
      render(
        <>
          <StatusChip status="you" />
          <StatusChip status="back" />
        </>,
      );
      expect(screen.getByText("等你审")).toBeInTheDocument();
      expect(screen.getByText("已打回")).toBeInTheDocument();
      expect(screen.queryByText(/Waiting|Sent back/)).not.toBeInTheDocument();
    } finally {
      act(() => setLang("en"));
    }
  });
});

describe("StopCard", () => {
  const card = (refusal: Refusal) => render(<StopCard refusal={refusal} />);

  it("says a red line from its code, with drama-cli's words as they came", () => {
    card({ code: "RedLine", message: "Bible v2 is not usable: red line: …", param: null, action: "ask_person" });
    const stop = screen.getByRole("region", { name: "The screenplay crosses a red line" });
    expect(stop).toHaveClass("stopcard", "redline");
    expect(within(stop).getByText("RedLine")).toBeInTheDocument();
    expect(within(stop).getByText("Bible v2 is not usable: red line: …")).toBeInTheDocument();
  });

  it("says which limit a cap reached, by its config key", () => {
    card({ code: "SetLimitExceeded.max_new_takes", message: "seg01 has had 2 new paid takes", param: "shoot.max_new_takes", action: "ask_person" });
    const stop = screen.getByRole("region", { name: "shoot.max_new_takes is reached" });
    expect(within(stop).getByText("Limit")).toBeInTheDocument();
    expect(within(stop).getAllByText("shoot.max_new_takes")).toHaveLength(1);
  });

  it("asks the maker to read a refusal with no kind of its own, such as a bare Refused", () => {
    card({ code: "Refused", message: "Cannot determine Pine artifact access", param: null, action: null });
    const stop = screen.getByRole("region", { name: "The agent needs you to read this" });
    expect(within(stop).getByText("Cannot determine Pine artifact access")).toBeInTheDocument();
    expect(within(stop).queryByText("Limit")).toBeNull();
  });
});
