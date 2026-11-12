import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { assertStorageReady, getDb } from '../db'
import { isAdmin } from '../auth'
import { BugReportFeedbackService } from './feedback-service'

async function readInput(): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of process.stdin) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += data.length
    if (size > 1024 * 1024) throw new Error('Historical feedback input is too large')
    chunks.push(data)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  return text ? JSON.parse(text) : {}
}

/** Owner-controlled database command; default preview neither migrates nor records proof. */
export async function historicalFeedbackCommand(args: string[]): Promise<unknown> {
  if ([process.env.CI, process.env.GITHUB_ACTIONS].some(value => value && value !== 'false')) throw new Error('Historical feedback operations cannot run in CI')
  const { values } = parseArgs({ args, options: { execute: { type: 'boolean' }, actor: { type: 'string' } }, allowPositionals: false })
  const value = await readInput()
  const db = getDb()
  try {
    const service = new BugReportFeedbackService(db)
    if (!values.execute) return await service.previewHistoricalFeedback(value)
    const actor = values.actor ? await db.prepare(`SELECT id,username FROM users WHERE id=?
      AND NOT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=users.id)`).get<{ id: string; username: string }>(values.actor) : undefined
    if (!actor || !isAdmin(actor.username)) throw new Error('Execute requires --actor with a current administrator site ID')
    await assertStorageReady(db)
    return await service.executeHistoricalFeedback(actor.id, value)
  } finally { await db.close() }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await historicalFeedbackCommand(process.argv.slice(2))
    process.stdout.write(JSON.stringify(result) + '\n')
    if (result && typeof result === 'object' && 'errors' in result && Array.isArray(result.errors)
      && (result.errors.length || ('reconciliation' in result && result.reconciliation && typeof result.reconciliation === 'object'
        && 'status' in result.reconciliation && result.reconciliation.status !== 'completed'))) process.exitCode = 2
  } catch (error) { console.error(error instanceof Error ? error.message : 'Historical feedback failed'); process.exitCode = 1 }
}
