// How long ago something happened, as date-fns words it, in the studio's language.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ago } from "./api.ts";

afterEach(() => vi.useRealTimers());

describe("ago", () => {
  it("words the time since, with date-fns, in English and Chinese", () => {
    vi.useFakeTimers({ now: new Date("2026-10-30T12:00:00Z") });
    expect(ago("2026-10-30T11:55:00Z", "en")).toBe("5 minutes ago");
    expect(ago("2026-10-30T09:00:00Z", "en")).toBe("3 hours ago");
    expect(ago("2026-10-28T12:00:00Z", "zh")).toBe("2 天前");
  });
});
