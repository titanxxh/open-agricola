// Owner-only helper run INSIDE the formal app container (`docker exec -w /app`), never on the owner machine.
// Creates exactly the disposable non-admin acceptance accounts D and E in one transaction; prints no passwords.
// Input on stdin: { authorization, operationId, accounts: [{ label, username, password, displayName }] }.
import assert from 'node:assert/strict'

const DISPOSABLE_AUTHORIZATION = 'disposable-nonadmin-prerelease-acceptance-accounts'
const app = '/app'

async function readInput() {
  const chunks = []; let bytes = 0
  for await (const chunk of process.stdin) { bytes += chunk.length; assert.ok(bytes < 16_384, 'input too large'); chunks.push(chunk) }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

assert.match(process.env.EXPECTED_FORMAL_BUILD ?? '', /^[a-f0-9]{40}$/, 'EXPECTED_FORMAL_BUILD is required')
assert.equal(process.env.GAME_BUILD_ID, process.env.EXPECTED_FORMAL_BUILD, 'the live formal build differs from the window')
assert.equal(process.env.NODE_ENV, 'production')
const input = await readInput()
assert.equal(input.authorization, DISPOSABLE_AUTHORIZATION)
assert.match(input.operationId ?? '', /^[a-f0-9-]{36}$/)
assert.deepEqual(input.accounts.map(account => account.label), ['D', 'E'])
const { createLocalUserForTests, isAdmin } = await import(`${app}/server/auth.ts`)
const { getDb } = await import(`${app}/server/db.ts`)
const db = getDb()
try {
  const created = await db.transaction(async () => {
    const rows = []
    for (const account of input.accounts) {
      assert.match(account.username, new RegExp(`^preacc_${account.label.toLowerCase()}_[a-f0-9]{12}$`))
      assert.ok(typeof account.password === 'string' && account.password.length >= 24)
      assert.equal(isAdmin(account.username), false)
      const user = await createLocalUserForTests(account.username, account.password, account.displayName)
      assert.equal(await db.prepare('SELECT 1 FROM beta_access WHERE user_id=?').get(user.id), undefined)
      rows.push({ label: account.label, id: user.id, username: user.username, displayName: user.displayName, isAdmin: false, betaAccess: false })
    }
    return rows
  })()
  console.log(JSON.stringify({ at: new Date().toISOString(), operationId: input.operationId, sourceBuild: process.env.GAME_BUILD_ID, count: created.length, accounts: created }))
} finally { await db.close() }
process.exit(0)
