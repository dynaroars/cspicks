# Agent instructions for CS conference data

These instructions apply to every task under `csconfs/`.

- Before researching or changing conference records, read
  `AGENT_RESEARCH_GUIDE.md` and `UPDATE_CONFERENCE_METADATA.md` completely.
- Treat `data/conferences.json` as the local source of truth. Do not introduce
  synchronization with another repository or a runtime schedule service.
- Start research from the record's official edition `link` and `seriesLink`.
  Follow official year navigation or validate the site's adjacent-year URL
  pattern before using broad web search.
- Use official conference, sponsoring-society, or proceedings pages as
  evidence. Third-party trackers are discovery leads only.
- Research agents are read-only: return structured evidence and let the
  coordinating agent apply reviewed updates centrally.
- Never infer unannounced dates, places, or chairs from a prior edition. Report
  `NOT FOUND` when an official fact is unavailable.
- Apply shared metadata consistently to every submission cycle for the same
  conference year, preserve calendar dates without timezone shifts, and keep
  projected deadlines marked `estimated`.
- After data changes, run the unit tests, production build, and focused CS
  Confs browser test listed in `UPDATE_CONFERENCE_METADATA.md`.
