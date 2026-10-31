# The Double Life of My Billionaire Husband (paper-vows)

Replay's sample drama from double-life-r4: short_drama `outputs/projects/double-life-r4`, the en-us-live-sfw production of six episodes (2026-10-21).

Every file is the source project's own, at its own path and version, as drama-cli wrote it (pictures at most 1280 px, takes and cuts muted H.264 at CRF 32, metadata stripped; absolute paths in specs and requests made relative).

- `lineage.json`: `drama-cli export comfyui` on an APFS clone of the project, with drama-cli ade90c55; an older project's config was brought to the current schema on the clone only, for the read.
- `infinite-canvas.zip`: `drama-cli export infinite-canvas` on the same clone, its media swapped for the web copies by the sha256 each entry's name carries.
- `files/`: each file the lineage shows, with spec.json, request.json and a take's last_frame.jpg beside it.

The cast, places, props, episodes and versions in `fixtures/replay/dramas.json` come from the bible and breakdowns at the lineage's versions; the cuts' clip points from each cut.json.
