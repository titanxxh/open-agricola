import { resolve, join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { getDb } from '../server/db'
import { migratePostgres } from '../server/database/migrations'
import { getResources, closeResources } from '../server/storage/runtime'
import { importSqlite } from './sqlite-import/import'

const [dataRoot, reportPath, confirmation] = process.argv.slice(2)
if (!dataRoot || !reportPath || confirmation !== '--applications-stopped') throw new Error('Usage: import-sqlite.ts <source-data-directory> <report.json> --applications-stopped')
const root = resolve(dataRoot)
const db = getDb()
try {
  await migratePostgres(db)
  const report = await importSqlite({ database: join(root, 'open-agricola.db'), cardArt: join(root, 'card-art'), replayAssets: join(root, 'replay-assets'), viewers: join(root, 'replay-viewers'), erasureLedger: join(root, 'replay-removals.jsonl') }, db, getResources())
  await writeFile(resolve(reportPath), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  console.log('Import passed exact row, recovery, Replay and resource checks. Validation report saved.')
} finally { closeResources(); await db.close() }
