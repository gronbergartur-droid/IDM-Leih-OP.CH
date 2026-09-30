# IDM-Leih-OP.CH Architecture v2.2

```text
IDM-Leih-OP.CH
│
├── IDM Mobile
│   ├── LEIH-SIEB Scanner
│   ├── SET
│   ├── Eingang/Ausgang
│   ├── Fälle
│   ├── Lieferanten
│   ├── Ärzte
│   ├── Historie
│   ├── Archiv
│   └── Audit
│
├── IDM Intelligence
│   ├── Repair Photo Analysis
│   ├── Instrument Recognition
│   ├── Photo Archive
│   ├── Archive Matching
│   ├── Repair History
│   └── Cloud Agent
│
└── IDM Analytics
    ├── Dashboard
    ├── Leihsieb Analytics
    ├── Supplier Analytics
    ├── Instrument Analytics
    ├── Repair Analytics
    └── Deviation Analytics
```

Shared foundation:
- Supabase PostgreSQL
- Auth
- RLS
- Storage
- existing dataProvider abstraction
- shared audit model

Separation is by responsibility, not by unrelated products.
