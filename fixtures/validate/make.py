"""A real `drama-cli screenplay validate` record (validate.json, D173's file_lines) of rc5-t1.fountain, from drama-cli's
own command: no model call, no network. Paths under the temporary project become /work/drama."""
import json, shutil, subprocess, sys, tempfile
from pathlib import Path

out = Path(sys.argv[1])
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp) / "drama"
    (root / "inputs").mkdir(parents=True)
    screenplay = shutil.copy(out / "rc5-t1.fountain", root / "inputs" / "screenplay.fountain")
    brief = root / "inputs" / "brief.md"
    brief.write_text("# 家里家外\n", encoding="utf-8")
    run = lambda *args: subprocess.run([sys.executable, "-m", "drama_cli", *map(str, args)], check=True, capture_output=True)
    run("init", root, "--preset", "zh-cn-live-sfw", "--inputs.screenplay", screenplay, "--inputs.brief", brief, "--screenplay-language", "zh")
    run("screenplay", "validate", screenplay, "--config", root / "drama-cli.cfg.yaml")
    record = json.loads((root / "screenplay" / "v1" / "validate.json").read_text(encoding="utf-8"))
    text = json.dumps(record, ensure_ascii=False, indent=2).replace(str(root), "/work/drama")
    (out / "rc5-t1.validate.json").write_text(text + "\n", encoding="utf-8")
    print("rc5-t1", len(text))
