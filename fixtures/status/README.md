# drama-cli status reports

Real `drama-cli status` reports, used by the studio's tests to read where a project stands
(`src/shared/project.ts`). `make.py` wrote them with drama-cli v0.7.4's own offline test builders
(`tests/test_stages.py` in the drama-cli repository): no model call, no network, no spend. The
temporary project's path is replaced by `/work/drama`.

| File | The project |
|---|---|
| `new.json` | Its screenplay accepted, nothing made yet |
| `story.json` | The bible, a lead's look and a location's plate accepted |
| `needs.json` | And EP001's breakdown accepted, which needs the location's plate at Day, not made yet |
| `boards.json` | And the plate at Day, EP001's blocking reference and line-art storyboard accepted |

To make them again, from a checkout of drama-cli at the version the studio's skill runs, with
its development dependencies installed:

```sh
python path/to/fixtures/status/make.py path/to/fixtures/status
```
