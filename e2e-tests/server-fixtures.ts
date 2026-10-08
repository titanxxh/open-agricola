import { test as base } from '@playwright/test'
import { getDb } from '../server/db'

// Playwright can reuse one worker across spec files, as does the server DB singleton.
export const test = base.extend<object, { databaseLifetime: void }>({
  databaseLifetime: [async ({ playwright: _playwright }, runTests) => {
    try { await runTests() } finally { await getDb().close() }
  }, { scope: 'worker', auto: true }],
})
