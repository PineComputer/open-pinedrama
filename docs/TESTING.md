# Testing

How the studio is tested, and how to write a test for a change. Every change starts with a test
that fails, and is done when it passes. No test reaches the network or Pine, and none costs anything.

## Four layers

| Layer | Tool | What it checks | Where | Run |
|---|---|---|---|---|
| Logic and the engine's API | Vitest, Hono's `app.request()` | Pure functions, the flow, reviews, and each HTTP route the UI calls, in process | `src/**/*.test.ts` | `npm run check` |
| Components | Vitest, Testing Library, user-event, MSW | A screen or component rendered in jsdom, used the way a maker uses it, with the engine answered by MSW | `src/ui/**/*.test.tsx` | `npm run check` |
| End to end | Playwright, axe | The built studio served by its engine in replay, in a browser, through a whole flow | `e2e/*.spec.ts` | `npm run e2e` |
| Screenshots | Playwright | The design system's components and a few key screens, light and dark | `e2e/screenshots.spec.ts` and the pictures beside it | `npm run e2e`, on Linux in CI |

Most tests belong in the first two layers: they are fast and point at the cause. An
end-to-end test covers a flow a maker walks, not every branch of it.

## Rules

- **Find elements by role and visible name**, as a screen reader does:
  `getByRole("button", { name: "Approve A" })`, `getByRole("textbox", { name: "Your answer" })`.
  A test written this way also checks that the control is accessible, and survives a change
  of style. Use `data-testid` only where an element has no role, such as a canvas node.
- **Act as the maker does**, with user-event: clicks, typing, the review keys (A, R, J, K, C),
  ⌘↵. Don't call handlers or set state directly.
- **Check what reaches the engine.** `src/ui/test/server.ts` keeps every request a test sent;
  assert the method, the path, how many times, and the body. The answers come from
  `src/ui/test/fixtures.ts`, typed with `src/shared/types.ts`, so a change on either side of
  the contract shows in the tests.
- **Render at a URL.** A component that links or reads the place renders with
  `renderAt(ui, path)` (`src/ui/test/router.tsx`): the real route tree on a memory history.
  Assert where a click went with `href(router)`, never the window's location.
- **Every state is a fixture**: empty, at work, waiting for the maker, a red line, the budget
  spent, a cap reached, an error. A table of fixtures drives one test per state.
- **Test every state of a control**: enabled, disabled and why, busy, done.
- **Screenshots are Linux's.** Fonts render differently on each system, so the pictures are
  made and compared on Linux, as CI runs; other systems skip them. To make them again after a
  deliberate change, run CI, download the failed run's `playwright-report` artifact, review the
  new pictures, and commit them beside the spec.
- **Fix time and motion.** Use `vi.useFakeTimers()` in component tests. End-to-end runs with
  reduced motion (`playwright.config.ts`), so text is never caught mid-fade by a contrast
  check or a screenshot. Replay runs at 20× speed.
- **Accessibility.** Every page an end-to-end test visits is checked with axe
  (`e2e/axe.ts`); a serious or critical problem fails the test. Problems the studio had
  before the checks began are listed there with the item that fixes them; take an entry out
  when it is fixed.
- **Product rules are tests.** A rule the studio keeps is written as a test that fails if it
  breaks: a preset is never chosen for the maker; the maker decides every take and cut; a
  take or picture in flight is waited on, never sent again; phase 1 generates and edits
  nothing by hand: its hand actions are disabled, say why, and do nothing.
- **A test must fail without the change.** Before calling a test done, break the code it
  guards and watch it fail.
- **Never weaken, skip or delete a test to get a green run.** If a test is wrong, say why in
  the commit.

## Running them

```sh
npm run check            # typecheck, logic, engine API and component tests
npx vitest --project ui  # component tests only, in watch mode
npm run e2e              # end to end; builds the UI first
npx playwright test --ui # end to end, step by step, with the trace viewer
```

`npm run e2e` builds the UI, then starts an engine in replay for each spec file, on ports from
4391 up (`STUDIO_E2E_PORT` changes the first), each with a new, empty data folder, so no spec
sees another's dramas. A new spec file is added to `PROJECTS` in `playwright.config.ts`; the maker's walk runs in
the light and the dark theme. Locally it drives the installed Chrome; CI installs
Playwright's Chromium. A failed run keeps its trace in `test-results/`; CI uploads it.

No test needs replay's sample media (`fixtures/replay/samples/`, Git LFS): CI checks out without
it, and replay then draws its placeholders. A test reads a returned file's path from the file
(`FileItem.path`), never a fixed extension, so it holds with the samples or without.
