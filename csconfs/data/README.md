# Conference schedule data

`conferences.json` is the local source of conference schedule records used by
`csconfs.html`. It is versioned and deployed with CS Picks. The page does not
fetch schedule data from another repository or service.

Each entry includes its CS Picks `venueKeys`; those keys connect schedules to
the shared CSRankings/CORE venue-set and research-area filters. Preserve those
mappings when editing or adding records.

The local records also preserve the final unpublished metadata work from the
retired schedule project, including conference dates, places, general and
program chairs, verification status, and expanded rolling-deadline cycles.

## Data credits

The records were assembled through official conference-site research and
contributor corrections. [CSRankings](https://csrankings.org/) and
[CORE](https://portal.core.edu.au/conf-ranks/) define the venue sets and
research-area mappings. Historical acceptance and submission totals came from
[emeryberger/csconferences](https://github.com/emeryberger/csconferences).

These are credits, not runtime or maintenance dependencies: the deployed page
reads only the local JSON file.
