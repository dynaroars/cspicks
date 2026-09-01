# CS Confs feature

This directory contains the standalone CS Picks conference-schedule feature:
its controller, schedule utilities, renderer, styles, and local data.

`data/conferences.json` is maintained as part of this repository and is the
page's source of truth. Building and deploying CS Picks does not require another
checkout, a synchronization step, or a runtime data service.

See [UPDATE_CONFERENCE_METADATA.md](UPDATE_CONFERENCE_METADATA.md) for the
local schema, source-quality rules, multi-cycle editing guidance, automated
weekly maintenance, and checks.
Research agents should follow
[AGENT_RESEARCH_GUIDE.md](AGENT_RESEARCH_GUIDE.md) for official-site-first
edition discovery and audits.
Scoped mandatory agent instructions also live in [AGENTS.md](AGENTS.md).

The resumable maintenance controller is available through:

```bash
npm run maintain:csconfs -- run
```

It invokes Codex or Claude as a read-only researcher, validates structured
proposals, updates the local JSON only after the research batch is complete,
and records source evidence under `maintenance/checks.json`.
