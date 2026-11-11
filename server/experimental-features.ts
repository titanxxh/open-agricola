import { isAdmin } from './auth'
import { getDb } from './db'
import type { PostgresDatabase } from './database/postgres'

type AccountQualification = { isAdmin: boolean; betaAccess: boolean }

async function readAccountQualification(userId: string, db: PostgresDatabase): Promise<AccountQualification | null> {
  const account = await db.prepare(`SELECT u.username, b.user_id IS NOT NULL AS beta_access
    FROM users u LEFT JOIN beta_access b ON b.user_id=u.id WHERE u.id=?`).get<{ username: string; beta_access: boolean }>(userId)
  return account ? { isAdmin: isAdmin(account.username), betaAccess: account.beta_access } : null
}

/** Fresh account qualification remains independent of any gameplay registry. */
export async function betaAccountState(userId: string, db?: PostgresDatabase): Promise<{ betaAccess: boolean }> {
  const account = await readAccountQualification(userId, db ?? getDb())
  return { betaAccess: !!account && (account.isAdmin || account.betaAccess) }
}
