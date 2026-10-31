# Vajra

npm package vs source integrity analyzer. See `VAJRA_TEAM_PRD.md`.

## Service (Assignment D)

- Server: `tsx apps/server/src/index.ts` — binds 127.0.0.1:3000
- Storage: SQLite at `./data/vajra.db`
- Exports: JSON/Markdown via `/api/analyses/:id/export?format=`

## Known gaps

- Ingestion (owner B) not implemented; analyses fail honestly.
- CLI commands are stubs pending ingestion.
- Watch monitoring and e2e tests pending.