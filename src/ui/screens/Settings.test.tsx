// Settings, About: Reveric's notice, word for word and linking to Reveric, as its NOTICES ask
// (AGPLv3 section 7(b)), and the studio's licence with its source.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { setLang } from "../i18n.ts";
import { REVERIC, Settings, SOURCE } from "./Settings.tsx";

const replay = { mode: "replay" as const, version: "0.3.0", dataDir: "/data", stopping: 0 };

describe("Settings, About", () => {
  it.each(["en", "zh"] as const)("says the studio is based on Reveric by looplj, linking to it (%s)", (lang) => {
    setLang(lang);
    render(<Settings app={replay} onChange={() => {}} />);
    const about = screen.getByRole("region", { name: lang === "en" ? "About" : "关于" });
    expect(within(about).getByRole("link", { name: "Based on Reveric by looplj." })).toHaveAttribute("href", "https://github.com/looplj/reveric");
    expect(REVERIC).toBe("https://github.com/looplj/reveric");
    expect(within(about).getByRole("link", { name: lang === "en" ? "Source code" : "源代码" })).toHaveAttribute("href", SOURCE);
    setLang("en");
  });
});

describe("Settings, Theme", () => {
  it("is dark at first, the look merecdesperez44323-lab chose, and keeps the maker's choice", async () => {
    const user = userEvent.setup();
    localStorage.removeItem("studio.theme");
    render(<Settings app={replay} onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.palette).toBe("classic");
    expect(localStorage.getItem("studio.theme")).toBe("light");
    await user.click(screen.getByRole("radio", { name: "As the system" }));
    expect(screen.getByRole("radio", { name: "As the system" })).toBeChecked();
    localStorage.removeItem("studio.theme");
  });
});
