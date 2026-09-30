# IDM Analytics

Read-only analytics module for IDM-Leih-OP.CH.

Purpose:
- KPI dashboard
- Leihsieb lifecycle metrics
- supplier metrics
- instrument occurrence/repair metrics
- deviation analysis
- repair and repeat-repair analysis
- lifecycle times
- filtered tables and reports

Official analytics must use confirmed operational data. Missing data is shown as N/A; values are never invented.

Route: `/analytics`

Default roles: `admin`, `op_leitung`.

Analytics must not mutate operational IDM data.
