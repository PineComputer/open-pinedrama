# drama-cli screenplay validate records

A real `validate.json`, the record `drama-cli screenplay validate` keeps beside a screenplay version, used by the
studio's tests to style the Fountain by each line's kind (`file_lines`, short_drama D173). `make.py` wrote it with
drama-cli v0.7.6 (short_drama bfdeb695) from `rc5-t1.fountain`: no model call, no network, no spend. The temporary
project's path is replaced by `/work/drama`.

| File | What it is |
|---|---|
| `rc5-t1.fountain` | Lines of Codex's rc5 T1 screenplay (家里家外): a Chinese action line, and a note before a forced `@` cue |
| `rc5-t1.validate.json` | Its record: the original itself, ready, with each line's kind |

To make it again, from a checkout of drama-cli at the version the studio's skill runs, with its dependencies installed:

```sh
python path/to/fixtures/validate/make.py path/to/fixtures/validate
```
