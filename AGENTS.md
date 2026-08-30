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
