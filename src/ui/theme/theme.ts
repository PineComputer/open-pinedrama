// The maker's theme: Dark (the look merecdesperez44323-lab chose, and the first run's), Light, or the
// system's choice. Reveric's tokens switch on <html data-palette data-theme>, data-theme being
// the brightness resolved (design/themes.css); the studio uses the classic palette.

export type ThemeChoice = "dark" | "light" | "system";

const KEY = "studio.theme";
const dark = () => window.matchMedia("(prefers-color-scheme: dark)");

export function themeChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "system" || saved === "dark") return saved;
  } catch {
    // Storage may be blocked; the choice is only a convenience.
  }
  return "dark";
}

function resolve(choice: ThemeChoice): "dark" | "light" {
  return choice === "system" ? (dark().matches ? "dark" : "light") : choice;
}

let following: (() => void) | undefined;

/** Applies the choice now and, for the system's, whenever the system changes. */
export function applyTheme(choice: ThemeChoice = themeChoice()): void {
  const root = document.documentElement;
  root.dataset.palette = "classic";
  root.dataset.theme = resolve(choice);
  following?.();
  following = undefined;
  if (choice === "system") {
    const query = dark();
    const update = () => (root.dataset.theme = resolve("system"));
    query.addEventListener("change", update);
    following = () => query.removeEventListener("change", update);
  }
}

export function setTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // As above: the theme still applies for this window.
  }
  applyTheme(choice);
}
