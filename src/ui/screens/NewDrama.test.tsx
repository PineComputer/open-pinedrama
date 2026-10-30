// Upload (P5.1): the maker drops one screenplay, chooses how it is made, and starts. The script is
// the only file a drama takes; a second one replaces the first. Start says what it still needs.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLang } from "../i18n.ts";
import { answer } from "../test/server.ts";
import { NewDrama } from "./NewDrama.tsx";

const replay = { mode: "replay" as const, version: "0.3.0", dataDir: "/data", stopping: 0 };

const SCRIPT = "EPISODE 1\n\nINT. TENEMENT FLAT - DAY #1-1#\n\nLIN stands in the doorway.\n\nLIN\nI run this house now.\n";

function script(name = "stepmother.fountain", text = SCRIPT): File {
  return new File([text], name, { type: "text/plain" });
}

/**
 * What the page posted to /api/dramas: its fields and the names of its files. jsdom's FormData can't cross
 * Node's fetch to MSW, so the form is read where the page hands it to fetch, and the engine's answer given there.
 */
function recordStart(): { fields: Record<string, string>; files: string[] }[] {
  const posted: { fields: Record<string, string>; files: string[] }[] = [];
  const pageFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input) !== "/api/dramas" || init?.method !== "POST") return pageFetch(input, init);
    const fields: Record<string, string> = {};
    const files: string[] = [];
    for (const [key, value] of (init.body as FormData).entries()) {
      if (typeof value === "string") fields[key] = value;
      else files.push(value.name);
    }
    posted.push({ fields, files });
    return Response.json({ id: "d1" });
  });
  return posted;
}

afterEach(() => {
  setLang("en");
  vi.restoreAllMocks();
});

describe("Upload", () => {
  it("takes one screenplay: choosing another replaces it", async () => {
    const user = userEvent.setup();
    answer("/api/app", replay);
    render(<NewDrama />);
    const panel = screen.getByRole("region", { name: "Screenplay" });
    expect(within(panel).getByLabelText("Choose a screenplay")).not.toHaveAttribute("multiple");
    await user.upload(within(panel).getByLabelText("Choose a screenplay"), script("first.fountain"));
    expect(within(panel).getByText("first.fountain")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Replace" }));
    await user.upload(within(panel).getByLabelText("Choose a screenplay"), script("second.fountain"));
    expect(within(panel).getByText("second.fountain")).toBeInTheDocument();
    expect(within(panel).queryByText("first.fountain")).not.toBeInTheDocument();
  });

  it("says what Start still needs, one thing at a time", async () => {
    const user = userEvent.setup();
    answer("/api/app", replay);
    render(<NewDrama />);
    const next = screen.getByRole("complementary", { name: "What happens next" });
    const start = within(next).getByRole("button", { name: "Start" });
    expect(start).toBeDisabled();
    expect(within(next).getByText("Add a screenplay to start.")).toBeInTheDocument();
    await user.upload(screen.getByLabelText("Choose a screenplay"), script());
    await user.type(screen.getByRole("textbox", { name: "Title" }), "The Stepmother");
    expect(await within(next).findByText("Choose a preset to start.")).toBeInTheDocument();
    expect(start).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /English vertical drama/ }));
    expect(within(next).getByText("Starts the setup session.")).toBeInTheDocument();
    expect(start).toBeEnabled();
  });

  it("sends the screenplay alone", async () => {
    const user = userEvent.setup();
    answer("/api/app", replay);
    const posted = recordStart();
    render(<NewDrama />);
    await user.upload(screen.getByLabelText("Choose a screenplay"), script());
    await user.type(screen.getByRole("textbox", { name: "Title" }), "The Stepmother");
    await user.click(screen.getByRole("button", { name: /English vertical drama/ }));
    await user.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].files).toEqual(["stepmother.fountain"]);
    expect(posted[0].fields.screenplay).toBe("0");
    expect(posted[0].fields.preset).toBe("en-us-live-sfw");
  });

  it.each(["en", "zh"] as const)("says what happens next, in four steps (%s)", (lang) => {
    setLang(lang);
    answer("/api/app", replay);
    render(<NewDrama />);
    const next = screen.getByRole("complementary", { name: lang === "en" ? "What happens next" : "接下来" });
    expect(within(next).getAllByRole("listitem")).toHaveLength(4);
  });
});
