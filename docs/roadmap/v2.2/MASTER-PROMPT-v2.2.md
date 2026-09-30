# IDM-Leih-OP.CH — Master Prompt v2.2

## Project
IDM Mobile / IDM-Leih-OP.CH is a mobile-first PWA for AEMP of a Swiss hospital. The existing core is LEIH-SIEB SCANNER: lifecycle control of loaner surgical instrument trays (Leihsiebe) from supplier arrival through OP and return.

This v2.2 extends the existing project with two bounded modules:

1. **IDM Intelligence / Cloud Agent** — photo-based instrument and repair analysis, archive matching, historical analysis and suggestions.
2. **IDM Analytics** — read-only operational analytics, KPIs, trends and reports.

These are modules of the same IDM ecosystem, not replacements for IDM Mobile and not a second operational application.

---

## 1. NON-NEGOTIABLE PRINCIPLES

- Preserve the existing IDM Mobile application and its working functionality.
- Do not rewrite the project or migrate frameworks.
- Do not break LEIH-SIEB SCANNER, SET, Eingang/Ausgang, Fälle, Lieferanten, Ärzte, Historie, Audit, Archiv, Auth, RLS, offline/demo mode.
- Human confirmation is mandatory for AI recognition/correction in the medical context.
- AI produces **Vorschlag + Confidence + Evidence**, never an authoritative medical/operational decision.
- Analytics is read-only and must never mutate operational data.
- Supabase remains the primary operational data source.
- Existing `dataProvider.ts` abstraction remains the application data boundary.
- No service-role key in the browser/mobile client.

---

## 2. EXISTING IDM MOBILE CORE

### Domain
A Leihsieb is a loaner tray with a physical identifier such as `SSW-LEIH-04-02` and alias `LEIH 04`, printed on a metal barcode label.

A Sieb-Fall is the lifecycle case:

`Eingang → OP → Ausgang → Rückgabe/Kontrolle`

The current scanner supports:

- barcode / QR / GS1 / UDI
- OCR via self-hosted Tesseract.js
- camera capture
- reference matching
- mandatory human confirmation
- checklist-based Soll/Ist comparison
- SET intake of 2–10 Siebe
- 1–3 photos per Sieb
- optional Operateur and OP-Datum
- Lieferschein photos and OCR warning keywords
- ZIP export

### Existing stack
- React + TypeScript + Vite
- Tailwind CSS v4
- react-router-dom
- @zxing/browser
- tesseract.js
- @supabase/supabase-js
- jszip
- exceljs
- Supabase Auth / PostgreSQL / Storage / Edge Functions / RLS

### Existing architecture
```text
src/types/database.ts
src/services/dataProvider.ts
src/features/*
supabase/migrations/*.sql
```

`LocalDataProvider` and `SupabaseDataProvider` retain the same interface.

Deployment remains GitHub Pages under:
`https://app.idm-leih-op.ch`

Supabase project:
`IDM-Leih-SSW-OP`

Existing branch/workflow must be preserved unless explicitly changed by the project owner.

---

# 3. TARGET IDM ARCHITECTURE

```text
IDM-Leih-OP.CH
│
├── IDM Mobile
│   ├── LEIH-SIEB SCANNER
│   ├── Sieb-SET erfassen
│   ├── Eingang / Ausgang
│   ├── Sieb-Fälle
│   ├── Lieferanten
│   ├── Ärzte
│   ├── Historie
│   ├── Archiv
│   └── Audit
│
├── IDM Intelligence
│   ├── Fotoanalyse
│   ├── Instrument Recognition
│   ├── Reparatur-Fotoanalyse
│   ├── Foto-Archiv
│   ├── Archivvergleich
│   ├── Wiederholte Instrumente
│   ├── Reparaturhistorie
│   └── Cloud Agent
│
└── IDM Analytics
    ├── Dashboard
    ├── Leihsieb Analytics
    ├── Lieferanten Analytics
    ├── Instrument Analytics
    ├── Reparatur Analytics
    ├── Durchlaufzeiten
    ├── Abweichungen
    └── Reports
```

All modules use the same IDM identity, authentication, database and audit model.

---

# 4. IDM INTELLIGENCE / CLOUD AGENT

The Cloud Agent is an intelligence layer, not a replacement for the Scanner.

## Main use cases

1. Repair photo analysis.
2. Instrument recognition from repair photos.
3. Archive matching against previously confirmed photos.
4. Instrument occurrence analysis across multiple Siebe/Sets.
5. Repair history analysis.
6. Soll/Ist support for Sieb composition.
7. Duplicate/master-data anomaly suggestions.
8. Natural-language analysis of confirmed IDM data at a later stage.

## Processing flow

```text
Photo
 ↓
Existing IDM Scanner / Repair workflow
 ↓
Cloud Agent
 ↓
Recognition + defect evidence + archive matching
 ↓
AI Vorschlag
 ↓
MANUELLE KORREKTUR / BESTÄTIGUNG
 ↓
Backend validation
 ↓
Supabase
```

### AI result must contain

- candidate instrument
- REF / article number where available
- defect candidates based only on visible evidence
- confidence
- evidence
- archive matches
- model/version
- timestamp

Example:

```text
Instrument:
REF 123456

Defekt:
sichtbare Deformation

Confidence:
94 %

Evidence:
✓ Form ähnlich
✓ Hersteller passend
✓ 14 ähnliche Archivbilder
✓ REF bereits in diesem Set vorhanden
```

### Mandatory manual correction

UI must provide:

- `Übernehmen`
- `Korrigieren`
- `Anderes Instrument`
- `Ablehnen`

If corrected, retain both:

- original AI proposal
- final human-confirmed value
- user
- timestamp

Never overwrite the original AI result.

### Confidence policy

- ≥98%: show as strong suggestion, still require human confirmation.
- 90–97%: explicit confirmation required.
- <90%: manual selection required.

These are UX thresholds, not medical certainty.

### Prohibited AI actions

AI must never autonomously:

- declare an instrument safe/unsafe for use;
- perform Ausmusterung;
- close a vigilance/Vorkommnis case;
- approve a repair or KV;
- change authoritative master data;
- change workflow status;
- merge master instrument records;
- bypass RLS or authorization.

All authoritative status changes continue through existing backend rules such as `change_status()`.

---

# 5. REPAIR PHOTO ANALYSIS

The specific purpose is to analyse **the instrument photographed for repair**, not merely generic OCR.

Suggested workflow:

```text
REPA / Defekt
 ↓
Foto Gesamtansicht
 ↓
Foto Defekt
 ↓
Foto REF / Artikel
 ↓
Cloud Agent
 ↓
Instrument candidate
 ↓
Visible defect candidate
 ↓
Archive comparison
 ↓
Human correction
 ↓
REPA-ID
```

Possible visible findings:

- deformation
- visible break
- possible crack
- corrosion
- discoloration
- damaged surface
- missing visible part
- wear
- bent tip
- irregular closure

Use cautious wording such as `sichtbare Deformation` or `möglicher Riss`; do not make a final suitability judgement.

---

# 6. INSTRUMENT MASTER + OCCURRENCES

A single instrument article/REF may occur in multiple Siebe.

Use a conceptual separation between:

### `instrument_master`

- id
- article_no
- REF
- manufacturer
- description
- instrument_type
- supplier_id
- dimensions
- recognition status
- optional embedding
- timestamps

### `instrument_occurrences`

- id
- instrument_master_id
- set_id
- position
- serial
- lot
- status

Example:

`REF 123456` can occur in Sieb A, B, C and D while remaining one master identity.

Do not automatically merge records based on AI.

---

# 7. PHOTO ARCHIVE

Add or extend an image archive associated with confirmed IDM entities.

Conceptual `instrument_images` fields:

- id
- instrument_master_id
- repair_case_id if applicable
- entity / entity_id
- image_type
- storage_path
- image_hash
- embedding
- quality_score
- verified
- created_by
- created_at

A new image can be compared with historical confirmed images using vector similarity where supported.

Archive matching is a recommendation system, not proof of identity.

---

# 8. IDM ANALYTICS

IDM Analytics is a **read-only module** within IDM-Leih-OP.CH.

Route:

`/analytics`

Optional subroutes:

- `/analytics/leihsiebe`
- `/analytics/lieferanten`
- `/analytics/instrumente`
- `/analytics/reparaturen`
- `/analytics/abweichungen`

## Dashboard filters

- Heute
- 7 Tage
- 30 Tage
- 90 Tage
- Dieses Jahr
- Benutzerdefiniert
- Lieferant
- Sieb
- Sieb-Typ
- Instrument / REF
- OP / Operateur
- Status
- Defekt

## KPI groups

### Leihsiebe

- aktive Leihsiebe
- Eingänge
- Ausgänge
- offene Fälle
- Einsätze
- durchschnittliche Verweildauer

### Fälle

- Fälle heute
- Fälle 7/30 Tage
- offene Fälle
- abgeschlossene Fälle

### Abweichungen

- Gesamt
- fehlende Instrumente
- zusätzliche Instrumente
- falsche Instrumente
- Mengenabweichungen
- nicht erkannt

### Reparatur

- Reparaturfälle
- offene Reparaturen
- abgeschlossene Reparaturen
- Wiederholungsreparaturen
- Defektarten

### Durchlaufzeiten

- Eingang → OP
- OP → Ausgang
- Eingang → Ausgang
- Lieferantenzeit / Reparaturzeit where data exists

Never invent missing timestamps. Show `N/A` or `Keine ausreichenden Daten`.

---

# 9. SUPPLIER ANALYTICS

For each supplier show factual metrics:

- number of Siebe
- number of cases
- number of deviations
- missing instruments
- additional instruments
- average case time
- open cases

Do not label a supplier automatically as good/bad.

---

# 10. INSTRUMENT ANALYTICS

Per REF/article:

- occurrence count
- number of Siebe
- number of cases
- deviations
- repairs
- repeat repairs

Example:

```text
REF 123456
Vorkommen: 38
Sieb-Fälle: 24
Reparaturen: 5
Abweichungen: 3
```

---

# 11. REPAIR ANALYTICS

Provide factual views of:

- repairs per month
- repairs by defect type
- repairs by REF
- repairs by supplier
- repeat repairs
- open/closed repair cases

A repeat repair may be defined by multiple repair cases for the same instrument/REF within a configurable period, default 12 months.

Do not turn this into an automatic quality or safety verdict.

---

# 12. DEVIATION ANALYTICS

Use checklist-based Soll/Ist results, not pixel-level photo comparison, for authoritative deviations.

Categories:

- missing instrument
- extra instrument
- wrong instrument
- quantity mismatch
- not recognised

AI image analysis can support a suggestion, but confirmed checklist data is authoritative for official KPI calculations.

---

# 13. CLOUD AGENT + ANALYTICS

The Cloud Agent may later answer natural-language questions over confirmed IDM data.

Examples:

- Wie viele Leihsieb-Fälle wurden im September erfasst?
- Welche REF wurde am häufigsten repariert?
- Welche Instrumente fehlen am häufigsten?
- Wie viele Fälle hatte Lieferant XYZ?
- Wie lange dauerte die durchschnittliche Bearbeitung?
- Welche Instrumente hatten mehrere Reparaturen?

Every numeric answer must be traceable to a query/filter/time range.

Unconfirmed AI suggestions must not be used as official KPI facts.

---

# 14. SECURITY / MEDICAL CONTEXT

- Use existing Supabase Auth and RLS.
- No service-role secret in client code.
- Analytics is read-only.
- AI cannot bypass authorization.
- Patient data must not be introduced into the AI workflow.
- If sensitive information is accidentally present in a photo, apply the project's privacy handling rules.
- AI processing must comply with the hospital-approved privacy/data-processing setup.
- Preserve auditability of AI suggestions and manual corrections.

---

# 15. DATA / CODE ORGANISATION

Prefer additions such as:

```text
src/features/cloud-agent/
src/features/repair/
src/features/analytics/
src/services/aiProvider.ts
src/services/visionService.ts
src/services/archiveSearchService.ts
src/services/analyticsService.ts
```

Do not bypass `dataProvider.ts` from UI components.

Suggested analytics structure:

```text
src/features/analytics/
├── pages/AnalyticsPage.tsx
├── components/
├── services/analyticsService.ts
├── types/analytics.ts
└── utils/analyticsCalculations.ts
```

---

# 16. SUPABASE

Reuse the existing schema wherever possible.

Before adding migrations:

1. inspect current schema;
2. inspect existing RLS;
3. reuse existing tables;
4. add only missing structures;
5. verify access policies;
6. test queries.

Potential analytics views:

- analytics_sieb_cases
- analytics_supplier
- analytics_instruments
- analytics_repairs
- analytics_deviations

Potential intelligence tables:

- instrument_master
- instrument_occurrences
- instrument_images
- recognition_results
- repair_photo_analysis

Names must be reconciled with the actual existing schema before implementation.

---

# 17. PERFORMANCE

Do not load large raw datasets into the browser.

Prefer:

- SQL aggregation
- views
- materialized views where justified
- RPC
- server-side filtering
- pagination

The mobile scanner must remain fast even when the archive becomes large.

---

# 18. OFFLINE / DEMO MODE

Existing LocalDataProvider must continue to work.

If Supabase environment variables are absent, the app remains usable in demo mode.

For Cloud Agent offline operation:

```text
Photo saved locally
 ↓
Sync queue
 ↓
Upload when online
 ↓
Cloud analysis
 ↓
Human confirmation
```

Do not pretend that cloud AI ran while the device was offline.

---

# 19. ROLES

Existing roles:

- admin
- op_leitung
- mitarbeiter
- lieferant

Analytics default access:

- admin
- op_leitung

Optional `mitarbeiter` access according to hospital policy.

Supplier users must not see unrelated suppliers' analytics.

Authorization must be enforced server-side/RLS, not only by hiding UI elements.

---

# 20. ACCEPTANCE TESTS

### Existing IDM

All existing acceptance tests must continue to pass.

### Intelligence

1. Photo produces an instrument candidate.
2. Repair photo produces visible-defect candidates.
3. Archive returns similar confirmed images.
4. Human can correct REF.
5. Human can correct defect.
6. Original AI result remains in audit history.
7. AI cannot change status directly.
8. AI cannot approve Ausmusterung.
9. AI cannot close Vorkommnis.
10. Duplicate processing of the same image is idempotent.
11. Offline photo uploads and is analysed after reconnect.
12. Same master instrument can occur in multiple Siebe.

### Analytics

13. `/analytics` loads.
14. Date filters work.
15. Supplier filters work.
16. KPI values match database queries.
17. Missing timestamps do not create fake durations.
18. Empty states are clean.
19. RLS prevents unauthorised cross-supplier access.
20. Export respects filters if export is enabled.
21. Demo mode works.
22. Scanner still works after Analytics is added.
23. SET workflow still works.
24. Audit still works.

---

# 21. IMPLEMENTATION PHASES

## Phase 0 — Inspect

Inspect the current IDM project, schema, routes, dataProvider, roles and existing tests.

Do not code before understanding existing structure.

## Phase 1 — Preserve Core

Create regression checks for existing Scanner/SET/Fälle/Audit flows.

## Phase 2 — Repair Photo Foundation

Add repair photo storage and UI integration without AI.

## Phase 3 — IDM Intelligence Pilot

Add:

- Cloud Agent endpoint
- instrument recognition
- repair photo analysis
- confidence/evidence
- manual correction
- AI audit

## Phase 4 — Photo Archive

Add image hashing, archive search and optional vector similarity.

## Phase 5 — IDM Analytics MVP

Add:

- dashboard
- KPIs
- date filters
- supplier analytics
- deviation analytics
- repair analytics
- tables

## Phase 6 — Advanced Analytics

Add:

- instrument analytics
- repeat repairs
- lifecycle times
- exports

## Phase 7 — Cloud Agent Analytics

Add natural-language queries over confirmed IDM data and traceable evidence.

## Phase 8 — Production Hardening

Security, privacy, performance, audit, offline sync and hospital pilot.

---

# 22. DEFINITION OF DONE

The extension is complete only when:

- existing IDM Mobile functionality still works;
- Scanner remains operational;
- SET remains operational;
- existing Supabase/RLS/Auth remain intact;
- Repair Photo Analysis works;
- human correction works;
- AI audit works;
- photo archive works;
- `/analytics` works;
- Analytics is read-only;
- KPIs match database data;
- role restrictions work;
- demo mode works;
- offline sync works;
- tests pass;
- no autonomous AI safety/operational decisions exist.

---

# 23. FINAL ARCHITECTURAL RULE

Do not create three unrelated applications.

Use one IDM ecosystem with three clearly separated responsibilities:

```text
IDM Mobile
= Arbeiten

IDM Intelligence
= Erkennen / Vorschlagen / Analysieren

IDM Analytics
= Messen / Berichten / Verstehen
```

All three share the IDM identity and data foundation, while remaining technically modular.

**Human confirms. Backend controls. Database records. Analytics explains.**
