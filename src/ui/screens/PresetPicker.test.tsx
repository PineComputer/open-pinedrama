// The preset cards, as the design draws them (.presets, .preset): one per template, pressed when chosen; none is chosen
// for the maker, and a template drama-cli has no preset for yet is shown, but can't be chosen. The choice is drama-cli's
// preset name.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLang } from "../i18n.ts";
import { PresetChoice } from "./NewDrama.tsx";

afterEach(() => setLang("en"));

describe("PresetChoice", () => {
  it("chooses nothing for the maker", () => {
    render(<PresetChoice value="" onChange={() => {}} />);
    const group = screen.getByRole("group", { name: "Preset" });
    for (const card of within(group).getAllByRole("button")) expect(card).toHaveAttribute("aria-pressed", "false");
  });

  it("offers drama-cli's presets as cards, with what each makes and its name", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PresetChoice value="" onChange={onChange} />);
    const english = screen.getByRole("button", { name: /English vertical drama/ });
    expect(english).toHaveTextContent("en-us-live-sfw");
    await user.click(english);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("en-us-live-sfw");
  });

  it("shows the templates drama-cli has no preset for, greyed and not choosable", () => {
    render(<PresetChoice value="" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /Anime vertical drama/ })).toBeDisabled();
    expect(screen.getAllByText("Coming soon").length).toBeGreaterThan(0);
  });

  it("shows the chosen one as pressed (zh)", () => {
    setLang("zh");
    render(<PresetChoice value="zh-cn-live-sfw" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /中文竖屏短剧/ })).toHaveAttribute("aria-pressed", "true");
  });
});
