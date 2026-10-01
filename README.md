# IDM Mobile

Mobile-first Instrumentenmanagement-App für die AEMP (Aufbereitungseinheit für
Medizinprodukte). Kernmodul: **LEIH-SIEB SCANNER** mit vollständigem
Lieferanten-, Fall- und Vorher/Nachher-Lebenszyklus.

Leihsiebe werden per Smartphone-Kamera fotografiert. Die App erkennt Barcode,
QR-Code und Text (OCR) auf dem Etikett, gleicht den Sieb-Code (z. B. `LEIH 04`
oder `SSW-LEIH-04-02`) mit einer Referenzdatenbank ab und führt Anwender:innen
durch eine manuelle Instrumenten-Kontrolle (erwartete vs. erkannte Instrumente,
fehlende/zusätzliche Instrumente) — inklusive verpflichtender Bestätigung vor
dem Speichern. Beim Eingang eines Leihsiebs wird daraus ein **Sieb-Fall**
eröffnet; nach der Operation wird ein zweiter (Ausgangs-)Scan erfasst und
automatisch mit dem Eingang verglichen (Modul „Vorher/Nachher-Vergleich“).

## Roadmap: IDM Intelligence & IDM Analytics (v2.2)

Erweiterung um zwei zusätzliche Module — **IDM Intelligence** (assistive
KI-Fotoanalyse für Reparaturen/Instrumente, immer mit Pflichtbestätigung
durch Menschen) und **IDM Analytics** (read-only KPI-Dashboard) — siehe
[`docs/roadmap/v2.2/`](docs/roadmap/v2.2/README.md), insbesondere
`MASTER-PROMPT-v2.2.md` für die vollständige Spezifikation. Bestehende
Funktionalität bleibt dabei unverändert.

Stand: Phase 2–8 umgesetzt (Reparaturen-Modul, KI-Fotoanalyse, Foto-Archiv,
IDM Analytics MVP, Advanced Analytics, Cloud-Agent-Analytics,
Security-/Performance-Hardening — siehe die jeweiligen Abschnitte weiter
unten). Phase 8 ist als laufender Prozess zu verstehen (Security, Privacy,
Performance, Audit, Offline-Sync, Spital-Pilot); dieser erste Durchgang
deckt Security/Privacy ab, Offline-Sync und der eigentliche Spital-Pilot
sind eigene, noch nicht begonnene Vorhaben.

## KI-Nutzung: nur unterstützend

Barcode-, QR- und Texterkennung sind **rein unterstützende** Funktionen:

- Jeder erkannte Sieb-Code muss von der/dem Anwender:in bestätigt oder
  korrigiert werden, bevor ein Abgleich mit der Referenzdatenbank erfolgt.
- Es gibt keine automatische Instrumentenerkennung per Bildverarbeitung. Die
  Instrumenten-Kontrolle (vorhanden/fehlend, zusätzliche Instrumente) ist
  immer eine explizite, manuelle Aktion pro Instrument.
- Ein Scan kann erst gespeichert werden, nachdem alle Positionen kontrolliert
  wurden und die Anwender:in die Ergebnisse ausdrücklich bestätigt hat
  (Schritt „Bestätigung“, siehe `SummaryStep`).

### KI-Vergleich (Vorher/Nachher)

Der Vorher/Nachher-Vergleich vergleicht **nicht** die beiden Fotos pixelweise
per Bildverarbeitung. Eine zuverlässige automatische Erkennung einzelner
Chirurgie-Instrumente auf einem Foto würde ein eigens trainiertes
Bildverarbeitungsmodell voraussetzen, das hier nicht zur Verfügung steht –
ein unbestätigtes „KI hat X erkannt“ wäre im medizinischen Kontext riskant.

Stattdessen berechnet `src/features/cases/comparison.ts` einen
deterministischen Diff zwischen der **von Anwender:innen bestätigten**
Eingangs-Checkliste und der bestätigten Ausgangs-Checkliste desselben Falls:
fehlende Instrumente, Mengenabweichungen und neue/entfernte Zusatz-
Instrumente werden so zuverlässig und nachvollziehbar erkannt. Für „falsche
Instrumente“ (Verwechslungen) schlägt eine einfache Namensähnlichkeits-
Heuristik mögliche Paare vor („Schere“ fehlt, „Klemme“ ist neu aufgetaucht) –
klar als KI-Vorschlag gekennzeichnet und nie automatisch übernommen.

## Tech-Stack

- **React + TypeScript + Vite**, mobile-first mit Tailwind CSS v4
- **@zxing/browser** – Barcode-/QR-Code-Erkennung aus dem Kamerabild
- **tesseract.js** – OCR-Texterkennung
- **react-router-dom** – Navigation
- **@supabase/supabase-js** – vorbereitet, siehe unten

## Architektur

```
src/
  types/database.ts        Domain-Typen, 1:1 zum geplanten Supabase-Schema
  data/referenceData.ts    Seed-/Demo-Referenzdaten (Sieb-Codes, Lieferanten)
  lib/
    currentUser.ts          Leichtgewichtige "wer ist angemeldet"-Kennung
                             (kein echtes Login, siehe unten)
    supabase/client.ts      Supabase-Client (nur aktiv, wenn ENV gesetzt)
  services/
    dataProvider.ts        Backend-agnostisches Interface
    localProvider.ts        Lokale/Demo-Implementierung (localStorage)
    supabaseProvider.ts     Supabase-Implementierung (gleiche Schnittstelle)
    index.ts                 Schaltet automatisch zwischen den beiden um
  features/
    scanner/                LEIH-SIEB SCANNER (Kamera, Erkennung, Abgleich,
                             Instrumenten-Kontrolle); unterstützt drei Modi:
                             eigenständige Kontrolle, Fall-Eingang, Fall-Ausgang
    cases/                    Sieb-Fälle: Eingang ↔ Ausgang, Vergleichs-Engine
                             (comparison.ts), Fälle-Liste & -Detail
    suppliers/                Lieferantenverwaltung: CRUD, Detailseite mit
                             Sieb-Referenzen und vollständiger Fall-Historie
    trays/                    Sieb-Referenzen anlegen/bearbeiten (Instrumente,
                             Lieferanten-Zuordnung)
    history/                 Sieb-Historie (Liste + Detailansicht je Scan)
    audit/                    Audit-Log (jede Aktion mit Datum/Zeit/Benutzer)
supabase/
  migrations/0001_init.sql  Schema: suppliers, trays, tray_instruments,
                             scans, loan_cases, audit_log (inkl. RLS-Policies)
  migrations/0002_auth_roles.sql  Echtes Supabase Auth: profiles-Tabelle,
                             Rollen (admin/op_leitung/mitarbeiter/lieferant),
                             verschärfte RLS (aktives Profil + manipulations-
                             sichere performed_by-Zuordnung)
  seed.sql                  Demo-Daten, analog zu data/referenceData.ts
```

Jeder Screen greift ausschliesslich über `dataProvider` (aus
`src/services/index.ts`) auf Daten zu – nie direkt auf `LocalDataProvider`
oder `SupabaseDataProvider`. Das ist die einzige Stelle, die beim Wechsel auf
ein echtes Supabase-Projekt angepasst werden muss.

## Supabase aktivieren

1. Migrationen `supabase/migrations/0001_init.sql` und
   `supabase/migrations/0002_auth_roles.sql` (in dieser Reihenfolge) auf
   einem Supabase-Projekt ausführen (optional: `supabase/seed.sql` für
   Demo-Daten).
2. `.env.local` aus `.env.example` erstellen und
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (Publishable Key)
   eintragen.
3. Ohne diese beiden Variablen läuft die App automatisch mit dem lokalen
   Mock-Provider (`localStorage`) weiter – keine Codeänderung nötig.
4. **Keine Anonymous Sign-Ins aktivieren.** Diese App ist eine klinische
   Anwendung ohne öffentliche Schreibrechte; es gibt bewusst keinen
   anonymen Zugriff mehr (siehe „Authentifizierung & Rollen" unten). Falls
   „Anonymous Sign-Ins" im Projekt aus einem früheren Schritt aktiviert
   wurde, im Supabase-Dashboard unter Authentication → Sign In / Providers
   deaktivieren – die App verwendet sie ohnehin nicht mehr, und selbst ein
   anonym angemeldetes Konto bliebe dank `profiles.active = false`
   ohne Lese-/Schreibzugriff.
5. Das erste jemals registrierte Konto wird automatisch als aktiver
   **Admin** angelegt (siehe `handle_new_auth_user()` in
   `0002_auth_roles.sql`) – damit ist nach der Migration immer sofort ein
   Admin-Zugang vorhanden. Jedes weitere Konto startet inaktiv
   (`mitarbeiter`, `active = false`) und muss über die
   Benutzerverwaltung (`/benutzer`, nur für Admins) freigeschaltet werden.

## Module

- **LEIH-SIEB SCANNER** – Foto, Barcode/QR/OCR-Erkennung, Abgleich,
  Instrumenten-Kontrolle. Läuft als eigenständige Kontrolle (`/scanner`)
  oder als Eingangs-/Ausgangs-Scan eines Sieb-Falls. Auf dem Aufnahme-Schritt
  kann statt der Live-Kamera auch ein Foto aus der Fotobibliothek des
  Telefons gewählt werden. Erkennt zusätzlich GS1/UDI-Etiketten (Pflicht-
  Kennzeichnung praktisch aller EU-Medizinprodukte-Hersteller, u. a. KARL
  STORZ): Artikelnummer (REF), GTIN, Charge und Verfallsdatum werden aus dem
  „(01)…(10)…(17)…"-Format extrahiert (siehe `recognition/gs1.ts`) und als
  zusätzlicher Erkennungs-Kandidat sowie Info-Karte angezeigt – ein Treffer
  setzt voraus, dass die REF/GTIN als Alias beim jeweiligen Sieb hinterlegt
  ist (Lieferantenverwaltung → Sieb bearbeiten).
- **Sieb-SET erfassen** (`/scanner/set`) – für eine Lieferung mit mehreren
  Leihsieben: 2 bis 10 Siebe erfassen, pro Sieb 1 bis 3 Fotos (Kamera oder
  Fotobibliothek – Übersicht Pflicht, Detail-/Barcode-Nahaufnahmen optional).
  Anschliessend wird jedes Sieb einzeln anhand all seiner Fotos erkannt,
  zugeordnet und kontrolliert – jedes Sieb ergibt einen eigenen, unabhängigen
  Scan-Eintrag (kein Sammel-Scan mehrerer Siebe in einem Eintrag).
- **Lieferantenverwaltung** (`/lieferanten`) – vollständiges CRUD: anlegen,
  bearbeiten, aktivieren/deaktivieren, löschen (blockiert, solange noch
  Siebe zugeordnet sind – stattdessen deaktivieren). Detailseite zeigt alle
  zugeordneten Sieb-Referenzen und die komplette Fall-Historie
  (Sieb-Code, Datum, Eingang, Ausgang, Operation, Abweichungen).
- **Sieb-Referenzen** (`/sieb/neu`, von der Lieferantenseite aus) – neues
  Leihsieb erfassen: Code, Alias-Bezeichnungen, Instrumentenliste, Zuordnung
  zu einem *aktiven* Lieferanten (Pflichtfeld).
- **Sieb-Fälle / Vorher-Nachher-Vergleich** (`/faelle`) – Eingang eröffnet
  einen Fall; nach der Operation wird der Ausgang erfasst und automatisch mit
  dem Eingang verglichen (fehlende/zusätzliche Instrumente, Mengenabweichungen,
  Verwechslungs-Vorschläge – siehe „KI-Vergleich“ oben). Jeder erkannte Code
  wird beim Ausgang gegen das erwartete Sieb geprüft; bei Abweichung erscheint
  ein Warnhinweis, ohne den Ablauf zu blockieren. Beim Eingang kann optional
  der **Operateur** (Belegarzt) aus der Ärzteliste zugeordnet werden – das
  entspricht der Spalte auf dem intern geführten Whiteboard (OP-Datum /
  Leih-Set / Operateur / Retour); Retour selbst ist bereits über den
  Fall-Status und die Lieferanten-Benachrichtigung abgebildet.
- **Ärzteliste** (`/aerzte`) – Belegärzte/Operateure nach Fachbereich, aus
  der internen Telefonliste übertragen (aktuell Orthopädie und Gynäkologie).
  Wird beim Sieb-Fall-Eingang als Operateur-Auswahl verwendet; weitere
  Ärzte/Fachbereiche können über „+“ ergänzt werden.
- **Sieb-Bereitschaft nach Sterilisation** (auf der Fall-Detailseite, sobald
  der Ausgang erfasst ist) – der Hygiene-Pass der aktuellen
  Sterilisationscharge (Chargen-Ausdruck, bei jedem Zyklus anders) wird
  fotografiert; die App sendet dem hinterlegten Lieferanten-Kontakt
  automatisch eine E-Mail mit Standardtext und dem Foto als Anhang, dass das
  Sieb abholbereit ist. Versand läuft über die Edge Function
  `supabase/functions/send-sieb-ready-email` (Resend) – siehe
  „Sieb-Bereitschaft per E-Mail“ unten für die Einrichtung.
- **Reparaturen** (`/reparaturen`, v2.2 Phase 2 + 3 – siehe
  `docs/roadmap/v2.2/`) – defekte/beschädigte Instrumente melden: Foto
  Gesamtansicht (Pflicht), Defekt- und REF/Artikel-Nahaufnahme (optional),
  Fehlerbeschreibung, optionale Sieb-Zuordnung. Optional kann eine
  **KI-Analyse** der Fotos gestartet werden (Cloud Agent, siehe „KI-Fotoanalyse
  für Reparaturen" unten) – liefert einen Instrument-/REF-Vorschlag,
  Defekt-Kandidaten und Confidence; muss von einer Person explizit
  übernommen, korrigiert oder abgelehnt werden, bevor er als bestätigter
  Wert gilt. Offene Reparaturen lassen sich als abgeschlossen markieren;
  jede Meldung/Analyse/Bestätigung/Abschluss wird im Audit-Log erfasst.
- **Sieb-Historie** (`/historie`) – jeder einzelne Scan (auch Eingangs-/
  Ausgangs-Scans eines Falls) bleibt hier zusätzlich einsehbar.
- **Audit-Log** (`/audit`) – jede Lieferanten-, Sieb- und Fall-Aktion sowie
  jede Kontroll-Bestätigung wird lückenlos mit Datum, Uhrzeit und Benutzer
  protokolliert (append-only).
- **Benutzerverwaltung** (`/benutzer`, nur Admins) – Konten freischalten,
  Rollen zuweisen, Lieferanten-Konten verknüpfen. Siehe
  „Authentifizierung & Rollen" unten.
- **Archiv** (`/archiv`, Admins und OP-Leitung) – lädt pro Monat ein
  ZIP mit Lieferanten, Sieb-Referenzen, Sieb-Fällen, Scans (Eingang/
  Ausgang/Kontrolle), Hygiene-Pass-Fotos und Audit-Log als zweite,
  lokale Kopie herunter – für die in der Schweiz üblichen 10 Jahre
  Aufbewahrungspflicht. Die Daten in Supabase bleiben davon unberührt
  (keine Löschung); siehe `src/features/archive/generateMonthlyArchive.ts`
  für den genauen ZIP-Aufbau.

### Authentifizierung & Rollen

Gegen ein echtes Supabase-Projekt verlangt die App ein echtes Login
(E-Mail/Passwort, `src/features/auth/LoginPage.tsx` +
`src/lib/auth/AuthContext.tsx`) – kein anonymer oder öffentlicher
Schreibzugriff. Vier Rollen: **Admin**, **OP-Leitung**, **Mitarbeiter:in**,
**Lieferant** (`src/types/database.ts` → `UserRole`).

- Neue Konten (Registrierung in der App oder direkt im Supabase-Dashboard)
  landen inaktiv in der `profiles`-Tabelle und sehen nach der Anmeldung nur
  einen „Wartet auf Freigabe"-Bildschirm – RLS blockiert für inaktive
  Konten jeden Lese- und Schreibzugriff auf Spitaldaten
  (`is_active_user()` in `0002_auth_roles.sql`).
- Admins schalten Konten frei und weisen Rollen zu unter **Benutzerverwaltung**
  (`/benutzer`, nur in der Navigation sichtbar für Admins;
  `src/features/users/UserManagementPage.tsx`). Ein Lieferanten-Konto kann
  zusätzlich einem Lieferanten-Datensatz zugeordnet werden.
- Ein Nicht-Admin kann sich nicht selbst freischalten oder befördern – ein
  Datenbank-Trigger (`prevent_self_role_escalation()`) blockiert das
  serverseitig, unabhängig vom Client.
- **Revisionssichere Zuordnung**: `performed_by` (Scans, Fälle) und
  `audit_log.performed_by` müssen laut RLS exakt dem angemeldeten Konto
  entsprechen (`current_display_name()`); ein Client kann keine fremde
  Identität vortäuschen. Jede Aktion trägt damit automatisch Benutzer,
  Datum und Uhrzeit.
- Im lokalen Mock-Modus (ohne `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`)
  bleibt die bisherige, nicht-authentifizierte Geräte-Kennzeichnung
  (`src/lib/currentUser.ts`, Namensfeld oben rechts) unverändert aktiv –
  dort gibt es weiterhin kein Login, da es sich um eine reine
  Offline-Demo ohne Mehrbenutzerbetrieb handelt.

**Wichtig für die Registrierungs-E-Mail**: Im Supabase-Dashboard unter
**Authentication → URL Configuration** müssen *Site URL* und *Redirect URLs*
auf die tatsächliche App-URL zeigen (aktuell `https://app.idm-leih-op.ch/`,
siehe „Eigene Domain" unten, plus `http://localhost:5173` für lokale
Entwicklung gegen das echte Projekt).
Ohne einen passenden Eintrag in *Redirect URLs* lehnt Supabase den
Bestätigungslink-Redirect ab. Der Client nutzt zusätzlich `flowType: 'pkce'`
(`src/lib/supabase/client.ts`), weil die App `HashRouter` verwendet
(GitHub Pages hat kein Server-Rewrite) und der klassische „implicit"-Flow
sein Token als `#access_token=...`-Fragment anhängt - das kollidiert mit
dem eigenen Routing-Fragment des Routers. PKCE hängt stattdessen ein
`?code=...`-Query-Argument an, das den Router nicht stört.

## Entwicklung

```bash
npm install
npm run dev      # Dev-Server
npm run build    # Typecheck + Produktions-Build
npm run lint
npm run test     # Vitest - Regressionstests für Kernlogik (siehe unten)
```

Die Kamera-/OCR-Funktionen benötigen HTTPS oder `localhost`, da Browser den
Zugriff auf `getUserMedia` sonst blockieren.

### Tests

Vitest deckt die Kernlogik ab, die Scanner/SET/Fälle/Audit tragen - ohne
Kamera/OCR/Barcode zu mocken, da das kaum Mehrwert böte:

- `src/features/cases/comparison.test.ts` - der Vorher/Nachher-Vergleichsmotor
- `src/features/scanner/recognition/identifierPatterns.test.ts`,
  `gs1.test.ts` - Sieb-Code- und GS1/UDI-Erkennung aus OCR-/Barcode-Text
- `src/features/scanner/scannerTypes.test.ts` - Identifier-Normalisierung
- `src/services/localProvider.test.ts` - kompletter Eingang → Ausgang →
  Abweichung → Audit-Log-Ablauf über `LocalDataProvider`

`.github/workflows/ci.yml` führt Lint, Typecheck, Tests und Build bei jedem
Pull Request und Push auf `main` aus (zuvor gab es keine automatische
Prüfung auf Pull Requests).

## Deployment (GitHub Pages)

Die App lässt sich als reine statische SPA auf GitHub Pages veröffentlichen
(`.github/workflows/deploy-pages.yml`, baut bei jedem Push auf `main`).
Einmalig einzurichten:

1. **Settings → Pages → Source: „GitHub Actions"** im Repository aktivieren
   (dieser eine Schritt lässt sich nicht per API/Workflow erledigen).
2. **Settings → Secrets and variables → Actions → Variables** – zwei
   Repository-Variablen anlegen: `VITE_SUPABASE_URL` und
   `VITE_SUPABASE_ANON_KEY` (Werte aus `.env.local`/Supabase-Dashboard).
   Das ist der öffentliche Publishable Key, keine geheime Server-Rolle –
   der Zugriffsschutz kommt ausschliesslich über RLS
   (`supabase/migrations/0002_auth_roles.sql`), nicht über die
   Geheimhaltung dieses Keys. Ohne diese beiden Variablen baut die
   Seite im lokalen Mock-Modus.
3. Danach läuft jeder Push auf `main` automatisch durch Build + Deploy;
   die Standard-URL lautet `https://<owner>.github.io/<repo>/`.

Der Login-/Registrierungs-/Freischaltungs-Ablauf wurde live im echten Browser
gegen die produktive Seite verifiziert (Registrierung, Bestätigungs-E-Mail,
Login, Admin-Freischaltung unter `/benutzer`).

### Eigene Domain

Die App läuft unter der eigenen Domain **`https://app.idm-leih-op.ch`**
(Infomaniak) statt der GitHub-Standard-URL:

- `public/CNAME` enthält `app.idm-leih-op.ch` – GitHub Pages liest diese
  Datei aus dem veröffentlichten Build und setzt/aktualisiert die
  Custom-Domain-Einstellung automatisch bei jedem Deploy.
- `VITE_BASE_PATH` im Workflow ist auf `/` gesetzt (statt
  `/<repo-name>/`), da die eigene Domain die App direkt an der Wurzel
  ausliefert.
- Bei Infomaniak (Zone DNS des Domains) liegt eine CNAME-Eintrag
  `app` → `<owner>.github.io.`.
- Einmalig zu prüfen: **Settings → Pages** im Repository sollte die
  Custom Domain `app.idm-leih-op.ch` zeigen (füllt sich nach dem ersten
  Deploy mit der `CNAME`-Datei automatisch) und **„Enforce HTTPS"**
  aktiviert sein, sobald GitHub das TLS-Zertifikat ausgestellt hat
  (kann nach DNS-Umstellung einige Minuten bis Stunden dauern).
- Supabase **Authentication → URL Configuration** (Site URL,
  Redirect URLs) muss auf `https://app.idm-leih-op.ch/` zeigen, sonst
  schlägt der Bestätigungs-Link-Redirect fehl (siehe oben).

Für Deployments ausserhalb von GitHub Pages: `vite.config.ts` liest den
Basis-Pfad aus `VITE_BASE_PATH` (Default `/`) – für einen Server, der die
App an der Domain-Wurzel ausliefert, muss diese Variable beim Build nicht
gesetzt werden.

## Sieb-Bereitschaft per E-Mail (Resend)

Nach dem Ausgangs-Scan eines Sieb-Falls kann der Hygiene-Pass der aktuellen
Sterilisationscharge fotografiert werden; die App benachrichtigt daraufhin
automatisch den Lieferanten per E-Mail (Standardtext + Foto als Anhang), dass
das Sieb abholbereit ist (`supabase/functions/send-sieb-ready-email`). Diese
Funktion läuft mit dem JWT der anmeldenden Person, nicht mit dem Service-Role-
Key – dieselben RLS-Regeln wie überall sonst gelten also auch hier.

Einrichtung (einmalig):

1. Konto auf [resend.com](https://resend.com) anlegen (kostenloser Tarif
   reicht für den Start) und einen API-Key erstellen.
2. Im Supabase-Dashboard unter **Edge Functions → send-sieb-ready-email →
   Secrets** (oder projektweit unter **Project Settings → Edge Functions →
   Secrets**) die Variable `RESEND_API_KEY` mit diesem Key anlegen.
3. **Wichtig für den Produktivbetrieb**: Ohne eigene verifizierte Absender-
   Domain bei Resend funktioniert nur der Sandbox-Absender
   `onboarding@resend.dev` – dieser liefert ausschliesslich an die beim
   Resend-Konto selbst hinterlegte E-Mail-Adresse aus, nicht an beliebige
   Lieferanten. Für echten Versand an Lieferanten-Adressen muss bei Resend
   eine eigene Domain verifiziert und deren Absenderadresse als zusätzliche
   Secret-Variable `RESEND_FROM_EMAIL` (z. B. `sieb-logistik@spital.ch`)
   hinterlegt werden.
4. Voraussetzung pro Lieferant: eine hinterlegte E-Mail-Adresse in der
   Lieferantenverwaltung (`contactEmail`) – ohne diese blockiert die App den
   Versand mit einer entsprechenden Fehlermeldung.

Ohne gesetzten `RESEND_API_KEY` liefert die Funktion einen klaren Fehler
zurück, statt fehlzuschlagen; die App zeigt diesen direkt auf der
Hygiene-Pass-Seite an.

## KI-Fotoanalyse für Reparaturen (v2.2 Phase 3 – IDM Intelligence Pilot, Claude)

Auf einer gemeldeten Reparatur (`/reparaturen/:id`) kann eine KI-Analyse der
Fotos gestartet werden (`supabase/functions/analyze-repair-photo`, ruft die
Claude API von Anthropic mit Vision auf). Das Ergebnis ist **immer nur ein
Vorschlag**: Instrument-Kandidat, REF/Artikelnummer (falls lesbar),
sichtbare Defekt-Kandidaten aus einer festen, vorsichtig formulierten Liste,
Confidence und Begründung. Die KI bewertet nie, ob ein Instrument sicher
oder einsatzfähig ist – das entscheidet ausschliesslich das Fachpersonal.
Das Personal muss den Vorschlag explizit **übernehmen, korrigieren, als
anderes Instrument erfassen oder ablehnen**; der ursprüngliche KI-Vorschlag
bleibt dabei unverändert gespeichert (nie überschrieben), zusätzlich zum
final bestätigten Wert samt Person und Zeitpunkt. Jede Analyse und jede
Bestätigung wird im Audit-Log protokolliert. Wie beim E-Mail-Versand läuft
die Funktion mit dem JWT der anmeldenden Person, nicht mit dem
Service-Role-Key.

Einrichtung (einmalig):

1. Einen API-Key unter [console.anthropic.com](https://console.anthropic.com)
   erstellen.
2. Im Supabase-Dashboard unter **Edge Functions → analyze-repair-photo →
   Secrets** (oder projektweit unter **Project Settings → Edge Functions →
   Secrets**) die Variable `ANTHROPIC_API_KEY` mit diesem Key anlegen.
3. Optional: `ANTHROPIC_MODEL` setzen, um ein anderes Modell als die
   Standardeinstellung (Claude Sonnet 5) zu verwenden.

Ohne gesetzten `ANTHROPIC_API_KEY` liefert die Funktion einen klaren Fehler
zurück, statt fehlzuschlagen oder ein Ergebnis vorzutäuschen; die App zeigt
diesen direkt auf der Reparatur-Detailseite an. Im lokalen Mock-Modus (ohne
Supabase) ist die KI-Analyse grundsätzlich nicht verfügbar – die App
behauptet nie, dass eine Cloud-Analyse stattgefunden hat, ohne echtes
Backend.

## Foto-Archiv & Ähnlichkeitssuche (v2.2 Phase 4 – Photo Archive)

Beim Melden einer Reparatur wird aus dem Übersichtsfoto ein **perceptual
difference-hash (dHash)** berechnet (`src/features/repair/imageHash.ts`) –
rein client-seitig, deterministisch, ohne zusätzliche KI-Kosten oder
Netzwerkaufruf. Auf der Reparatur-Detailseite werden damit frühere Meldungen
mit ähnlichem Foto gefunden (Hamming-Distanz zwischen den Hashes, Schwelle
`SIMILARITY_MATCH_THRESHOLD`) und als Karte **„Ähnliche frühere Meldungen“**
mit Ähnlichkeits-Prozentwert verlinkt. Wie jeder KI/Heuristik-Vorschlag im
Haus ist das ein reiner Hinweis für das Fachpersonal, kein automatischer
Abgleich oder eine Identitätsaussage – zwei Fotos ähnlicher Instrumente
können ähnliche Hashes ergeben, ohne dasselbe Instrument zu sein.

Eine echte Vektor-/Embedding-Ähnlichkeitssuche (semantische Bildsuche statt
reiner Pixel-Struktur) ist im Master-Prompt explizit als **optionale**
Erweiterung markiert und hier bewusst nicht umgesetzt; der dHash-Ansatz
deckt den Kernfall (wiederkehrender Defekt am selben/sehr ähnlichen
Instrument erkennen) ohne zusätzliche Infrastruktur oder Kosten ab.

## IDM Analytics (v2.2 Phase 5 – Analytics MVP)

Read-only KPI-Dashboard unter `/analytics` (Dashboard-Kachel „Analytics“,
sichtbar für Admin/OP-Leitung sowie im lokalen Demo-Modus; siehe
[`docs/roadmap/v2.2/MASTER-PROMPT-v2.2.md`](docs/roadmap/v2.2/MASTER-PROMPT-v2.2.md)
Abschnitt 8/9/11/12). Nutzt ausschliesslich bestehende `dataProvider`-Getter
(keine neuen Tabellen/Migrationen) und berechnet alle Kennzahlen client-seitig
in reinen, unabhängig getesteten Funktionen
(`src/features/analytics/utils/analyticsCalculations.ts`):

- **Filter**: Zeitraum (Heute/7/30/90 Tage/Dieses Jahr/Benutzerdefiniert) und
  Lieferant.
- **KPI-Gruppen**: Leihsiebe (aktive Siebe, Eingänge, Ausgänge, offene Fälle,
  Einsätze, Ø Verweildauer), Fälle (feste Heute/7/30-Tage-Fenster,
  unabhängig vom gewählten Zeitraum), Abweichungen (Gesamt sowie fehlende/
  zusätzliche/falsche Instrumente, Mengenabweichungen, nicht erkannt) und
  Reparatur (Fälle, offen/abgeschlossen, Wiederholungsreparaturen nach
  12-Monats-Fenster).
- **Lieferanten-Analytics**-Tabelle mit reinen Zahlen je Lieferant (Siebe,
  Fälle, Abweichungen, offene Fälle) — bewusst ohne automatische
  Gut/Schlecht-Bewertung.
- **Defektarten**-Übersicht ausschliesslich aus **bestätigten**
  KI-Vorschlägen (`aiConfirmation === 'accepted'`); eine korrigierte,
  abgelehnte oder umgeleitete KI-Angabe fliesst nicht ein.

Bewusste Vereinfachungen für die MVP-Phase (dokumentiert direkt im Code):
„offene" Kennzahlen sind immer ein aktueller Status-Snapshot statt
zeitraum-gefiltert; „nicht erkannt" bildet auf nicht zugeordnete
Scan-Ergebnisse ab, da der Soll/Ist-Vergleich keine eigene
„nicht erkannt"-Kategorie pro Instrument kennt; detaillierte
Durchlaufzeiten (Eingang→OP→Ausgang) und Instrument-Analytics sind laut
Roadmap explizit erst Phase 6. Nie werden fehlende Zeitstempel erfunden —
ohne ausreichende Daten wird „N/A“ bzw. „Keine ausreichenden Daten“
angezeigt.

## Advanced Analytics (v2.2 Phase 6)

Erweitert das Analytics-Dashboard um:

- **Durchlaufzeiten** (Eingang→OP, OP→Ausgang, Eingang→Ausgang) als neue
  KPI-Gruppe auf `/analytics`. Eingang→OP/OP→Ausgang werden nur berechnet,
  wenn ein OP-Datum vorliegt **und** zeitlich plausibel zwischen Eingang
  und Ausgang liegt — sonst „N/A“, nie ein erfundener oder negativer Wert.
- **Instrument-Analytics** (`/analytics/instrumente`, verlinkt von der
  Hauptseite): Vorkommen (Summe der Referenzmenge über alle Sieb-Kompositionen),
  Fälle, Abweichungen, Reparaturen und eine Wiederholungsreparatur-Markierung
  je Instrument. Da es noch keine REF-Stammdatentabelle gibt, wird nach
  normalisiertem Instrumentennamen gruppiert (siehe
  `computeInstrumentAnalytics` in `analyticsCalculations.ts`).
- **Export**: Button „Als Excel exportieren“ auf `/analytics` lädt eine
  `.xlsx`-Momentaufnahme (Übersicht, Lieferanten-Analytics,
  Instrument-Analytics) für den aktuell gewählten Filter herunter —
  protokolliert im Audit-Log (`analytics_exported`, Migration
  `0011_analytics_export_audit.sql`). `exceljs` wird dafür per
  dynamischem Import nachgeladen, damit die Haupt-Bundle-Grösse für alle
  anderen Seiten unverändert bleibt.

## Cloud Agent Analytics (v2.2 Phase 7)

Freitext-Fragen-Feld „Frage an die Daten (Cloud Agent)" auf `/analytics`
(ruft die Supabase Edge Function `supabase/functions/analytics-query` auf,
nutzt denselben `ANTHROPIC_API_KEY` wie Phase 3 — kein zusätzliches Secret
nötig). Beispiele: „Wie viele Fälle hatten Abweichungen?“, „Welches
Instrument hat am meisten Reparaturen?“.

Sicherheitsdesign (siehe `docs/roadmap/v2.2/MASTER-PROMPT-v2.2.md`
Abschnitt 13 „Every numeric answer must be traceable“): die KI bekommt
**niemals** rohe Fall-/Scan-/Reparaturdaten, sondern ausschliesslich den
bereits berechneten, bereits aggregierten KPI-„Snapshot“, den die Seite
selbst anzeigt (`AnalyticsSnapshot` — dieselben Zahlen aus
`analyticsCalculations.ts`, inkl. Zeitraum/Lieferanten-Filter). Die KI
kann also nur Zahlen zitieren, die bereits existieren, nie neue
berechnen oder schätzen; bei nicht beantwortbaren Fragen antwortet sie
explizit „Diese Frage kann anhand der verfügbaren Daten nicht beantwortet
werden.“ statt zu raten. Jede Antwort gibt zusätzlich ihre „Basis“ an
(welche Snapshot-Felder verwendet wurden). Im lokalen Demo-Modus (ohne
Supabase) ist die Funktion grundsätzlich nicht verfügbar — die App
behauptet nie, dass eine Cloud-Agent-Antwort vorliegt, ohne echtes
Backend.

## Production Hardening: Security-/Privacy-Audit (v2.2 Phase 8)

Erster Durchgang der Phase-8-Härtung, basierend auf einem Audit mit
Supabases eigenen Security-/Performance-Advisors
(`mcp__Supabase__get_advisors`), umgesetzt in
`supabase/migrations/0012_security_performance_hardening.sql`:

- **RLS-Initplan-Fix**: Alle RLS-Policies, die `is_active_user()`,
  `is_admin()`, `current_display_name()` oder `auth.uid()` direkt
  aufrufen, wurden auf `(select ...)` umgestellt, damit Postgres sie
  einmal pro Query statt einmal pro Zeile auswertet – reine
  Performance-Optimierung, keine Verhaltensänderung (betrifft alle
  9 Tabellen mit RLS, nicht nur die vom Advisor markierte `profiles`-Tabelle).
- **Least Privilege**: `EXECUTE` auf die fünf `SECURITY DEFINER`-Funktionen
  (`is_active_user`, `is_admin`, `current_display_name`,
  `handle_new_auth_user`, `prevent_self_role_escalation`) wurde der
  `anon`-Rolle entzogen – nicht angemeldete Zugriffe können diese nicht
  mehr direkt per RPC aufrufen. Die `authenticated`-Rolle behält die
  Berechtigung bewusst, da RLS-Auswertung und der
  `prevent_self_role_escalation`-Trigger (läuft bei jedem
  `profiles`-Update, nicht nur bei Rollenänderungen) sie weiterhin
  benötigen – verifiziert via `has_function_privilege(...)` nach dem
  Deployment.
- **Fehlende Indizes**: `loan_cases.operateur_id` und
  `scans.operateur_id` hatten keinen Index für ihren Foreign Key.

Bewusst nicht in diesem Durchgang behoben:
- **„Leaked Password Protection“** ist eine Auth-Service-Einstellung
  (Supabase Dashboard → Authentication → Policies), keine
  Datenbank-Migration kann sie setzen – manuell im Dashboard zu
  aktivieren.
- **„Unused index“**-Hinweise (13 Indizes) sind bei diesem frühen,
  noch nicht im Spitalbetrieb laufenden Datenvolumen erwartet und
  wurden absichtlich nicht entfernt – sie decken bereits bekannte,
  künftige Abfragemuster ab (Status-/Datums-Filter, Alias-/
  Fachgebiets-Suche).
- Geprüft und unauffällig befunden: kein Supabase-Storage-Bucket im
  Einsatz (Fotos liegen als Data-URLs in Text-Spalten, bereits durch
  dieselbe Tabellen-RLS geschützt), kein Service-Role-Key im
  Frontend-Bundle (nur der öffentliche Anon-Key), keine sensiblen Daten
  in `console.*`-Aufrufen.

### Zweiter Durchgang: Anwendungs-Performance

- **N+1-Abfrage behoben**: `/analytics` lud bisher die Instrumente jedes
  Siebs einzeln (`getTrayInstruments(trayId)` einmal pro Sieb parallel,
  also N Requests für N Siebe). Neue `DataProvider`-Methode
  `getAllTrayInstruments()` lädt alle Sieb-Instrumente in einem einzigen
  Request; `analyticsService.ts` gruppiert sie clientseitig nach
  Sieb-ID. Reiner Laufzeitgewinn, insbesondere relevant, sobald der
  Sieb-Katalog im Spitalbetrieb wächst.
- **Lazy-Loading erweitert**: `/analytics`, `/analytics/instrumente` und
  `/benutzer` (alle drei Admin-/OP-Leitung-only) werden jetzt wie
  Scanner/SET-Scanner/Archiv per `React.lazy()` nachgeladen statt im
  initialen Bundle enthalten zu sein. Gemessener Effekt ist bewusst
  ehrlich benannt: da React Router ohne explizites `lazy()` keine
  automatische Code-Teilung pro Route vornimmt, bleiben ca. 20 weitere,
  seltener besuchte CRUD-/Detail-Routen (Lieferanten, Siebe, Ärzte,
  Fälle, Reparaturen, Historie, Audit …) weiterhin Teil des initialen
  Bundles; die tatsächliche Einsparung am Erstladevolumen durch diesen
  Schritt liegt bei nur ca. 3–4 KB (gzip). Eine vollständige
  routenweise Code-Teilung über alle übrigen Screens wäre ein deutlich
  grösserer, eigener Umbau mit entsprechendem Testaufwand und ist
  bewusst nicht Teil dieses Durchgangs.

## OCR offline betreiben

Die OCR-Engine (Worker-Skript + Wasm-Core von tesseract.js) liegt lokal unter
`public/tesseract/` und wird ohne CDN-Abhängigkeit ausgeliefert – wichtig für
Spitalnetzwerke ohne (oder mit eingeschränktem) Internetzugang.

Das Sprachmodell („traineddata") wird von tesseract.js standardmässig von
einem CDN nachgeladen. Für einen vollständig lokalen Betrieb:

1. `eng.traineddata.gz` einmalig herunterladen und intern (z. B. im
   `public/`-Ordner oder auf einem internen Server) ablegen.
2. `VITE_TESSERACT_LANG_PATH` auf das Verzeichnis dieser Datei setzen.

Ohne diese Variable funktioniert die App weiterhin – die Texterkennung lädt
das Sprachmodell dann beim ersten Scan einmalig vom CDN nach.
