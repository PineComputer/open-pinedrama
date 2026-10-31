# The Double Life of My Billionaire Husband (double-life-ep001)

Replay's sample drama from double-life-ep001: short_drama `outputs/projects/double-life-ep001`, the first en-us production of EP001.

Every file is the source project's own, at its own path and version, as drama-cli wrote it (pictures at most 1280 px, takes and cuts H.264 at CRF 32 with their sound (AAC 96k), metadata stripped; absolute paths in specs and requests made relative).

- `lineage.json`: `drama-cli export comfyui` on an APFS clone of the project, with drama-cli ade90c55; an older project's config was brought to the current schema on the clone only, for the read.
- `infinite-canvas.zip`: `drama-cli export infinite-canvas` on the same clone, its media swapped for the web copies by the sha256 each entry's name carries.
- `files/`: each file the lineage shows, with spec.json, request.json and a take's last_frame.jpg beside it, and each version's asset-library record (`asset/asset.json`) without the BytePlus account's `GroupId` and `ProjectName`.

The cast, places, props, episodes and versions in `fixtures/replay/dramas.json` come from the bible and breakdowns at the lineage's versions; the cuts' clip points from each cut.json.

Its breakdown predates `scene_heading`, so dramas.json's headings are composed from each segment's location and time of day.
