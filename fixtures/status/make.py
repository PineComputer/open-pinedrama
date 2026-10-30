"""Real `drama-cli status` reports at four points of a project, from drama-cli v0.7.4's own offline test builders
(tests/test_stages.py): no model call, no network. Paths under the temporary project become /work/drama."""
import json, sys
from pathlib import Path
from unittest import mock

sys.path[:0] = [".", "tests"]
from drama_cli import stages
from tests.test_stages import (accepted_blocking, accepted_breakdown, accepted_image, accepted_story, accepted_storyboards,
                               accepted_time_plates, make_project)

out = Path(sys.argv[1])


def save(name, proj):
    with mock.patch.object(stages, "emit"):
        report = stages.status(proj)
    text = json.dumps(report, ensure_ascii=False, indent=2).replace(str(proj.root), "/work/drama")
    (out / f"{name}.json").write_text(text + "\n", encoding="utf-8")
    print(name, len(text))


tmp, proj = make_project()
save("new", proj)
accepted_story(proj)
accepted_image(proj, "assets/scenes/office/v1")
accepted_image(proj, "assets/characters/lin/v1", "asset://asset-1")
save("story", proj)
bible = proj.root / "bible" / "v1" / "bible.json"
(out / "bible.json").write_text(json.dumps(json.loads(bible.read_text(encoding="utf-8")), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("bible", bible.stat().st_size)
breakdown = accepted_breakdown(proj, blocking=False, storyboards=False)
save("needs", proj)
accepted_time_plates(proj)
accepted_blocking(proj, breakdown)
accepted_storyboards(proj, breakdown)
save("boards", proj)
