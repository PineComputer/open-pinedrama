// Delivery (IA §16): every episode's delivered and latest cut, each row linking to its episode's Cut and no player.
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DeliveryRow } from "../../shared/types.ts";
import { file } from "../test/fixtures.ts";
import { renderAt } from "../test/router.tsx";
import { answer } from "../test/server.ts";
import { Delivery } from "./Delivery.tsx";

const cut = (code: string, version: string) => file({ kind: "cut", name: "cut.mp4", path: `drama/episodes/${code}/edit/${version}/cut.mp4`, type: "video/mp4", episode: code, version });

describe("Delivery", () => {
  it("links each episode's cuts to its Cut and offers only the delivered one to download, with no player", async () => {
    const delivered = cut("EP001", "v1");
    const rows: DeliveryRow[] = [
      { code: "EP001", title: "The Wedding", accepted: delivered, latest: { file: cut("EP001", "v2"), review: { reviewId: "r1", kind: "cut", state: "open", notes: [] }, together: 1 } },
      { code: "EP002", title: "Booked" },
    ];
    answer("/api/dramas/d1/delivery", rows);
    await renderAt(<Delivery dramaId="d1" />, "/d/d1/delivery");
    const first = (await screen.findByText("EP001")).closest("tr") as HTMLElement;
    expect(within(first).getByRole("link", { name: "v1" })).toHaveAttribute("href", "/d/d1/e/EP001/cut");
    expect(within(first).getByRole("link", { name: "v2" })).toHaveAttribute("href", "/d/d1/e/EP001/cut");
    expect(within(first).getByText("Waits for you")).toBeInTheDocument();
    expect(within(first).getByRole("link", { name: "Download v1" })).toHaveAttribute("href", `${delivered.url}&download=1`);
    const second = screen.getByText("EP002").closest("tr") as HTMLElement;
    expect(within(second).getByText("No cut yet")).toBeInTheDocument();
    expect(within(second).queryByRole("link", { name: /Download/ })).toBeNull();
    expect(document.querySelector("video")).toBeNull();
    // One h1, the page's title, with its sections h2 under it (axe page-has-heading-one, heading-order; Codex rc5 C21).
    expect(screen.getAllByRole("heading").map((heading) => [heading.tagName, heading.textContent])).toEqual([["H1", "Delivery"]]);
  });
});
