# IDM-Leih-OP.CH — Roadmap v2.2

Planning documents for extending **this** web app (React/Vite/Supabase,
`app.idm-leih-op.ch`) with two new, bounded modules:

- **IDM Intelligence** — assistive, photo-based repair/instrument analysis
  (`IDM-INTELLIGENCE.md`). AI always produces a proposal with confidence +
  evidence; a human must confirm before anything authoritative is stored.
- **IDM Analytics** — a read-only KPI/reporting module (`IDM-ANALYTICS.md`),
  never mutates operational data.

Start with `MASTER-PROMPT-v2.2.md` (the full spec: principles, data model
sketch, phased implementation plan, acceptance tests). `ARCHITECTURE-v2.2.md`
and `CHANGELOG-v2.2.md` are short companion summaries.

None of this is built yet — these are planning docs, not implemented
features. The master prompt's own Phase 0/1 call for inspecting the current
schema and adding regression coverage for the existing Scanner/SET/Fälle/
Audit flows before any new code.

## What was deliberately left out of this repo

The source package for these docs also contained a `CLAUDE.md` and a
`docs/` tree (`status-machine.md`, `data-model.md`, `email.md`,
`docs/phases/phase-0..7`) describing a **different, incompatible v2.1
project**: an offline-first **Expo/React Native** mobile app with n8n
automation and Microsoft Graph email integration, for a Defektmeldung/
Reparatur/Ersatz/Versand workflow (REPA-/ERS-/INS-/ZIP-/SUP- IDs) — that
spec explicitly states "no web version in MVP," which contradicts this
project's actual, deployed web app. It was not added here: placing an
unrelated `CLAUDE.md` at the repo root would mislead any future session
(including this one) about the actual tech stack. If those documents are
still needed for some other project, keep them separate from this
repository.
