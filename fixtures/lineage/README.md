# drama-cli lineage exports

Real `drama-cli export comfyui` workflows, drama-cli's own lineage of a project, used by the
studio's tests to read where each version came from (`src/shared/lineage.ts`). `make.py` wrote
them with drama-cli's own offline test builders (`tests/test_stages.py` in the drama-cli
repository), at the first drama-cli whose export carries each node's `problems`: no model call,
no network, no spend. The temporary project's path is replaced by `/work/drama`.

| File | The project |
|---|---|
| `shot.json` | A lead's look, a location's plate and its plate at Day, EP001's breakdown, blocking reference, first-frame reference and storyboard accepted, and seg01's take t01 shot and collected; everything fresh |
| `time-plate-replaced.json` | And a new plate at Day accepted: the take and the video prompts are stale, with drama-cli's reasons |
| `location-plate-replaced.json` | `shot.json`'s project with a new location plate accepted instead: the plate at Day is stale; the take, made from the plate at Day's unchanged files, stays fresh by drama-cli's rule |
| `pine-v0.7.5.json` | Not made by `make.py`: the export a real Pine Computer returned (Codex's end-to-end run rc3), from drama-cli v0.7.5, the release Pine pins, before nodes carried `problems` (short_drama #668); its project path is replaced by `/work/drama`. A screenplay, its bible and three character looks, all fresh |

To make them again, from a checkout of drama-cli at the version the studio's skill runs, with
its development dependencies installed:

```sh
python path/to/fixtures/lineage/make.py path/to/fixtures/lineage
```
