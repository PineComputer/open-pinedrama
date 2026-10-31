# 我在八零年代当后妈 (houma-ep001-v2)

Replay's sample drama from houma-ep001-v2: short-drama-runs `houma-ep001-v2`, 我在八零年代当后妈 EP001 (2026-10-20). Its bible's title reads 第一集, so the sample takes the brief's title.

Every file is the source project's own, at its own path and version, as drama-cli wrote it (pictures at most 1280 px, takes and cuts muted H.264 at CRF 32, metadata stripped; absolute paths in specs and requests made relative).

- `lineage.json`: `drama-cli export comfyui` on an APFS clone of the project, with drama-cli ade90c55; an older project's config was brought to the current schema on the clone only, for the read.
- `infinite-canvas.zip`: `drama-cli export infinite-canvas` on the same clone, its media swapped for the web copies by the sha256 each entry's name carries.
- `files/`: each file the lineage shows, with spec.json, request.json and a take's last_frame.jpg beside it, and each version's asset-library record (`asset/asset.json`) without the BytePlus account's `GroupId` and `ProjectName`.

The cast, places, props, episodes and versions in `fixtures/replay/dramas.json` come from the bible and breakdowns at the lineage's versions; the cuts' clip points from each cut.json.

Every item reads stale, and that is drama-cli's own answer: the run's accepted.json records are in an older format that today's drama-cli refuses (each lineage node's `problems` says so: `review.path` and `review.sha256` missing, `evaluation` not permitted), so nothing reads as accepted. The original project's config also fails today's schema, and the records are kept as the run wrote them. Its breakdown predates `scene_heading`, so dramas.json's headings are composed from each segment's location and time of day.
