// Updates from the app's GitHub releases (electron-builder.config.mjs, publish), checked when
// the app starts and every hour. A build that can install one (Windows, Linux, and a
// macOS build signed with a Developer ID) downloads it quietly and offers to restart into it;
// otherwise it's put in place the next time the app quits. An ad-hoc macOS build can't
// install an update, so it says a new version is out and opens the download page.
import { readFileSync } from "node:fs";
import path from "node:path";
import { app, dialog, shell } from "electron";
// Named, not the default: bundled, the package's default export is undefined.
import { autoUpdater } from "electron-updater";

/** Where the releases are, for a build that can't install one itself. */
const RELEASES = "https://github.com/PineComputer/open-pinedrama/releases/latest";
const EVERY = 60 * 60 * 1000;

/** Whether this build can put an update in place: macOS only takes one signed with the same Developer ID. */
function canInstall(): boolean {
  if (process.platform !== "darwin") return true;
  const { distribution } = JSON.parse(readFileSync(path.join(app.getAppPath(), "package.json"), "utf8")) as { distribution?: string };
  return distribution === "developer-id";
}

export function keepUpdated(): void {
  if (!app.isPackaged) return;
  const installs = canInstall();
  // Its own logger prints a stack for every failed check (offline, no release yet); one line below says enough.
  autoUpdater.logger = null;
  autoUpdater.autoDownload = installs;
  autoUpdater.autoInstallOnAppQuit = installs;
  // Each version is offered once a launch; a "Later" holds until the app starts again.
  const offered = new Set<string>();
  autoUpdater.on("update-available", (info) => {
    if (installs || offered.has(info.version)) return;
    offered.add(info.version);
    void dialog
      .showMessageBox({
        type: "info",
        message: `Pine Drama Studio ${info.version} is out.`,
        detail: "This copy can't update itself on macOS. Download the new version and put it in Applications in place of this one; your dramas stay as they are.",
        buttons: ["Download", "Later"],
      })
      .then(({ response }) => {
        if (response === 0) void shell.openExternal(RELEASES);
      });
  });
  autoUpdater.on("update-downloaded", (info) => {
    if (offered.has(info.version)) return;
    offered.add(info.version);
    void dialog
      .showMessageBox({
        type: "info",
        message: `Pine Drama Studio ${info.version} is ready.`,
        detail: "Restart to use it. Computers at work carry on, and the studio picks them up where they are. Otherwise it's put in place the next time you quit.",
        buttons: ["Restart now", "Later"],
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });
  autoUpdater.on("error", (error) => console.warn("update check:", error.message));
  const check = () => void autoUpdater.checkForUpdates().catch(() => undefined);
  check();
  setInterval(check, EVERY);
}
