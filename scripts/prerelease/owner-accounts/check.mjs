// Owner-only read-only helper run INSIDE the formal app container: whether the requested acceptance usernames exist,
// with their ids and Beta state. Input on stdin: { accounts: [{ label, username }] }. Prints labels, ids and booleans.
import assert from 'node:assert/strict'

const app = '/app'
const chunks = []; let bytes = 0
for await (const chunk of process.stdin) { bytes += chunk.length; assert.ok(bytes < 16_384, 'input too large'); chunks.push(chunk) }
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
const { getDb } = await import(`${app}/server/db.ts`)
const db = getDb(), out = []
try {
  for (const account of input.accounts) {
    const row = await db.prepare('SELECT id FROM users WHERE username=?').get(account.username)
    const beta = row ? !!(await db.prepare('SELECT 1 FROM beta_access WHERE user_id=?').get(row.id)) : false
    out.push({ label: account.label, exists: !!row, id: row?.id ?? null, beta })
  }
  console.log(JSON.stringify(out))
} finally { await db.close() }
process.exit(0)
