"""Real `drama-cli export comfyui` workflows, drama-cli's lineage of a project (drama_cli/lineage.py, graph), from
drama-cli's own offline test builders (tests/test_stages.py): no model call, no network. One take is shot and
collected; then its time plate is replaced, or, from a fresh copy, its location's plate. Paths under the temporary
project become /work/drama."""
import json, sys
from pathlib import Path
from unittest import mock

sys.path[:0] = [".", "tests"]
import offline  # noqa: F401  refuses the network (tests/offline.py)
from drama_cli import env, export, invocation, lineage, records, stages
from tests.test_provider_connection import FixtureConnection
from tests.test_stages import (accepted_breakdown, accepted_first_frames, accepted_image, accepted_story,
                               accepted_time_plate, make_project, write)

out = Path(sys.argv[1])


def shot():
    tmp, proj = make_project()
    accepted_story(proj)
    breakdown = accepted_breakdown(proj)
    accepted_image(proj, "assets/characters/lin/v1", "asset://fixture")
    accepted_image(proj, "assets/scenes/office/v1")
    # A time plate is drawn from its location's plate and pins its pointers, as drama-cli's own does.
    accepted_time_plate(proj, "office", "Day", stages._stage_inputs(proj.stage("assets/scenes/office"), "image-1.jpg"))
    accepted_first_frames(proj, breakdown)
    with mock.patch.object(stages, "emit"):
        stages.video_prompts(proj, "EP001")
    with invocation.scope(lambda *_: None, runtime=FixtureConnection()), mock.patch.object(stages, "emit"), \
            mock.patch.object(records, "cost_valuation", return_value="customer"):
        stages.shoot(env.Env({}), proj, "EP001", ["seg01"], new_take=True)
    take = proj.root / "episodes/EP001/segments/seg01/t01"
    write(take / "video.mp4", "a take")
    job = records.load_record(take / "job.json").model_dump(mode="json", exclude_none=True)
    records.write_json(take / "job.json", {**job, "state": "downloaded"})
    with mock.patch.object(stages.media, "probe", return_value={"duration": 5.0}):
        stages.take_manifest(proj, take)
    return tmp, proj


def save(name, proj):
    # As `drama-cli export comfyui` writes it (drama_cli/export.py, run).
    text = json.dumps(export.comfyui(lineage.graph(proj)), ensure_ascii=False, indent=1).replace(str(proj.root), "/work/drama")
    (out / f"{name}.json").write_text(text + "\n", encoding="utf-8")
    print(name, len(text))


tmp, proj = shot()
save("shot", proj)
accepted_image(proj, "assets/scenes/office/times/Day/v2")
save("time-plate-replaced", proj)
tmp.cleanup()
tmp, proj = shot()
accepted_image(proj, "assets/scenes/office/v2")
save("location-plate-replaced", proj)
tmp.cleanup()
