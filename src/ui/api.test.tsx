// Live updates reaching the UI: a page showing the drama's project fetches it again when the
// engine says the project changed, once for a burst, and never shows an older answer over a
// newer one.
import { render, screen, waitFor } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { ProjectView } from "../shared/project.ts";
import { useResource } from "./api.ts";
import { changed } from "./test/live.ts";
import { calls, server } from "./test/server.ts";

function Project() {
  const { data } = useResource<ProjectView>("/api/dramas/d1/project", ["project:d1"]);
  return <p>{data === undefined ? "loading" : data.state === null ? "no report yet" : `bible ${data.state.bible.accepted ?? "none"}`}</p>;
}

function view(accepted: string | null): ProjectView {
  return {
    state: {
      preset: "zh-cn-live-sfw",
      bible: { current: accepted, candidate: null, accepted, usable: accepted !== null, run: [], errors: [] },
      characters: {},
      locations: {},
      props: {},
      episodes: {},
    },
    sessions: [],
    problems: [],
    names: null,
  };
}

/** Answers each GET of the project with the next of `answers`, waiting each one's delay first. */
function answers(...list: { value: ProjectView | Omit<ProjectView, "state"> & { state: null }; after?: number }[]) {
  let n = 0;
  server.use(
    http.get("/api/dramas/d1/project", async () => {
      const next = list[Math.min(n++, list.length - 1)];
      if (next.after) await delay(next.after);
      return HttpResponse.json(next.value);
    }),
  );
}

const fetched = () => calls("GET", "/api/dramas/d1/project").length;

describe("the drama's project on a page", () => {
  it("is fetched again when the engine says the project changed", async () => {
    answers({ value: { state: null, sessions: [], problems: [], names: null } }, { value: view("v1") });
    render(<Project />);
    await screen.findByText("no report yet");
    changed("project:d1");
    await screen.findByText("bible v1");
    expect(fetched()).toBe(2);
  });

  it("isn't fetched again for another drama's change", async () => {
    answers({ value: view(null) });
    render(<Project />);
    await screen.findByText("bible none");
    changed("project:d2");
    changed("drama:d1");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(fetched()).toBe(1);
  });

  it("is fetched once for a burst of changes", async () => {
    answers({ value: view(null) }, { value: view("v2") });
    render(<Project />);
    await screen.findByText("bible none");
    for (let n = 0; n < 5; n++) changed("project:d1");
    await screen.findByText("bible v2");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(fetched()).toBe(2);
  });

  it("never shows an older answer that arrives after a newer one", async () => {
    // The second fetch is slow and the third fast: the third's answer must stay on screen.
    answers({ value: view(null) }, { value: view("v1"), after: 400 }, { value: view("v2") });
    render(<Project />);
    await screen.findByText("bible none");
    changed("project:d1");
    await waitFor(() => expect(fetched()).toBe(2));
    changed("project:d1");
    await screen.findByText("bible v2");
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.getByText("bible v2")).toBeInTheDocument();
  });
});
