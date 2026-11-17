// Owner-only read-only helper run INSIDE the formal app container: formal rows left for deleted acceptance accounts.
// Input on stdin: { accounts: [{ label, id }] }. Prints labels and counts only.
import assert from 'node:assert/strict'

const app = '/app'
const chunks = []; let bytes = 0
for await (const chunk of process.stdin) { bytes += chunk.length; assert.ok(bytes < 16_384, 'input too large'); chunks.push(chunk) }
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
const { getDb } = await import(`${app}/server/db.ts`)
const db = getDb(), out = {}
try {
  for (const account of input.accounts) {
    const count = async sql => Number((await db.prepare(sql).get(account.id))?.n ?? 0)
    out[account.label] = { users: await count('SELECT count(*) AS n FROM users WHERE id=?'), beta_access: await count('SELECT count(*) AS n FROM beta_access WHERE user_id=?'),
      sessions: await count('SELECT count(*) AS n FROM sessions WHERE user_id=?') }
  }
  console.log(JSON.stringify(out))
} finally { await db.close() }
process.exit(0)
