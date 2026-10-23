// What the studio runs on: the maker's Pine project, the replay, or nothing yet (the app
// then shows its first-run screen). The maker chooses in the app; nothing needs editing.
import type { AppInfo } from "../shared/types.ts";
import { DATA_DIR, VERSION } from "./config.ts";
import { fleet, hasFleet, runningComputers, setFleet, stop } from "./computers.ts";
import type { Fleet } from "./fleet.ts";
import { publish } from "./live.ts";
import { PineFleet } from "./pine-fleet.ts";
import { ReplayFleet } from "./replay-fleet.ts";
import { reconcile } from "./scheduler.ts";
import { type PineProject, checkProject, environmentProject, keyHint, saveMode, saveProject, savedMode, savedProject } from "./settings.ts";

/** At start: the environment's project (a developer's override), the saved one, the replay, or none. */
export function initialFleet(): Fleet | undefined {
  if (process.env.STUDIO_MODE === "replay") return new ReplayFleet();
  const project = environmentProject() ?? savedProject();
  if (project) return new PineFleet(project);
  return savedMode() === "replay" ? new ReplayFleet() : undefined;
}

function use(next: Fleet | undefined): void {
  setFleet(next);
  void reconcile();
  publish("app", "dramas", "inbox");
}

export async function connectPine(project: PineProject): Promise<AppInfo> {
  const clean = { endpoint: project.endpoint.trim().replace(/\/$/, ""), apiKey: project.apiKey.trim() };
  await checkProject(clean);
  saveProject(clean);
  saveMode(null);
  use(new PineFleet(clean));
  return appInfo();
}

export function useReplay(): AppInfo {
  saveMode("replay");
  use(new ReplayFleet());
  return appInfo();
}

/** Forgets the project, after stopping its Computers so none keeps running on the maker's account. */
export async function disconnect(): Promise<AppInfo> {
  if (hasFleet() && fleet().mode === "pine") await Promise.allSettled(runningComputers().map((computer) => stop(computer)));
  saveProject(null);
  saveMode(null);
  use(environmentProject() ? new PineFleet(environmentProject()!) : undefined);
  return appInfo();
}

export function appInfo(): AppInfo {
  const fromEnvironment = environmentProject();
  const project = fromEnvironment ?? savedProject();
  const mode = hasFleet() ? fleet().mode : "none";
  return {
    mode,
    version: VERSION,
    dataDir: DATA_DIR,
    project: mode === "pine" && project ? { endpoint: project.endpoint, keyHint: keyHint(project.apiKey), fromEnvironment: Boolean(fromEnvironment) } : undefined,
  };
}
