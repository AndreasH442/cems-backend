# AGENTS

Falls mehrere Coding Agents an CEMS arbeiten, gilt zusätzlich zu CLAUDE.md:

## Architecture rules

- Schichtung: API → Application → Domain; Infrastructure/Repositories/Connectors hängen von Domain ab, nie umgekehrt.
- Domain importiert niemals Infrastructure- oder Wendeware-Code.
- Für den ersten Vertical Slice existiert bewusst keine API-Schicht (siehe docs/first-vertical-slice.md) – die Story wird über Integrationstests bewiesen, nicht über HTTP-Endpunkte.

## Tech stack

TypeScript/Node.js, `pg` + Kysely (nur in `infrastructure/repositories`, kein ORM), eigener SQL-Migrationsrunner (`src/infrastructure/db/migrate.ts`), Vitest mit Testcontainers.

## Test commands

- `npm run typecheck` – `tsc --noEmit`
- `npm run lint` / `npm run format` / `npm run format:check` – ESLint (typed) / Prettier
- `npm run test:unit` – reine Funktionen, keine DB (`test/unit`)
- `npm run test:integration` – echte Testcontainers-TimescaleDB, kein Mocking (`test/integration`); braucht laufendes Docker
- `npm test` – beides nacheinander
- `DATABASE_URL=postgres://... npm run migrate:up` / `migrate:down [steps]` – Migrationen gegen eine echte Postgres/TimescaleDB-Instanz anwenden/zurückrollen (jede `.up.sql` hat eine passende `.down.sql`, siehe `src/infrastructure/db/migrations/`)

## Lokal ausprobieren (persistente Dev-DB, kein Testcontainer)

1. `npm run db:up` – startet eine dauerhafte TimescaleDB via docker-compose auf Port 5432 (`.env.example` zeigt die passende `DATABASE_URL`)
2. `npm run demo` – wendet alle Migrationen an, spielt dann die volle Story einmal durch (Wendeware-Fixture → Mapping → Measurement; danach ein Setpoint-nicht-gefolgt-Szenario → Anomaly → Case → Action → Verification SUCCESS) und gibt jeden Schritt lesbar auf der Konsole aus
3. Danach mit einem beliebigen SQL-Client gegen `DATABASE_URL` selbst nachschauen (z. B. `psql`) – jeder `demo`-Lauf legt einen neuen, zeitstempel-benannten Tenant an, nichts wird zurückgesetzt
4. `npm run db:down` – Container stoppen (Daten bleiben im Docker-Volume erhalten, bis es explizit gelöscht wird)

## Migration rules

- Migrationen sind streng versioniert und folgen der Tabellen-Reihenfolge in docs/data-model.md.
- Keine destructive Migration ohne explizite Datenmigrationsstrategie (UP/DOWN/Impact dokumentieren).
- Zusammengesetzte Tenant-FKs gehören von Anfang an in die Foundation-Migrationen, nicht als Nachtrag (ADR-006).

## Code review checklist

- Domain-konform? Tenant-sicher (zusammengesetzte FKs vorhanden)? Vendor-neutral? Migration vorhanden? Rollback bedacht? Tests vorhanden? Metric Registry verändert? Fixture aktualisiert? Secrets ausgeschlossen? Unbekannte Semantik erfunden?

## Forbidden shortcuts

- Kein Agent darf Vendor-Semantik erfinden, nur um einen Test grün zu bekommen.
- Kein Agent ändert mapping_status-Werte außerhalb der sechs registrierten Werte.
- Kein Agent baut Forecast, Business Case/Plan-vs-Actual, Energy Pool, Auth, Billing im ersten Slice.
- Kein Agent aktiviert RLS-Policies vor einem echten Kundenpilotbetrieb.
