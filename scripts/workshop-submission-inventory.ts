import { getDb } from '../server/db'
import { WorkshopGitHubApp } from '../server/workshop-pr/github-app'
import { workshopSubmissionInventory } from '../server/workshop-pr/inventory'

// DATABASE_URL and App configuration come from the operator's environment.
// No migrations, grant revocation, remote writes, or card lifecycle changes.
const db = getDb()
try { console.log(JSON.stringify(await workshopSubmissionInventory(db,WorkshopGitHubApp.fromEnv()),null,2)) }
catch { console.error('Workshop inventory failed; verify database access and App configuration.'); process.exitCode = 1 }
finally { await db.close() }
