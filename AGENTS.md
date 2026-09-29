## Agent skills

### Issue tracker

Issues and specs are tracked as local markdown files under `.scratch/<feature-slug>/` (spec in `spec.md`, one ticket per file in `issues/`). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Visual checks in the browser are agent work. See `docs/agents/triage-labels.md`.

### Merging and migrations

Merge your own PRs with a merge commit once CI is green. The Supabase project `ycbdilsmydvzezhlymty` is pre-production (ADR-0013). Ask the user first before anything destructive in its database (drops, deleting data, writing to `auth.users`), and before changing Supabase Auth settings or secrets. Writing, validating or applying a migration: follow `docs/agents/migrations.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Platform guide

Before any spec or ticket, read `docs/visao-geral-da-plataforma.md`: the funnel, which spec covers each layer, the rules that hold everywhere, how to work a ticket without breaking another, the "Passos do Nan" rule and the order between specs.
