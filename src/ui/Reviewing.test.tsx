// Your reviews, as the design draws it (design 126de62): three rows on the kit's RadioGroup, each its label and hint.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewingChoice } from "./Reviewing.tsx";

describe("ReviewingChoice", () => {
  it("shows every option with its hint, the chosen one checked, and reports a new choice", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ReviewingChoice value="every" onChange={onChange} />);
    const group = screen.getByRole("radiogroup", { name: "Your reviews" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(within(group).getByRole("radio", { name: /^Every step/ })).toBeChecked();
    const key = within(group).getByRole("radio", { name: /^Looks, photoreal storyboards, takes and cuts/ });
    expect(key.closest("label")).toHaveTextContent("line-art storyboards go on as the agent makes them");
    await user.click(key);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("key");
  });
});
