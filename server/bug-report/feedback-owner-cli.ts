import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertStorageReady, getDb } from '../db'
import { BugReportFeedbackService } from './feedback-service'

async function input(): Promise<unknown> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of process.stdin) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += data.length
    if (bytes > 16 * 1024 * 1024) throw new Error('Feedback operation input is too large')
    chunks.push(data)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** Internal owner SSH entry. No HTTP route accepts deployment evidence. */
export async function feedbackOwnerCommand(args: string[]): Promise<unknown> {
  if ([process.env.CI, process.env.GITHUB_ACTIONS].some(value => value && value !== 'false')) throw new Error('Owner feedback operations cannot run in CI')
  if (args.length !== 1 || !['record', 'retry', 'status'].includes(args[0])) throw new Error('Usage: feedback-owner-cli.ts record|retry|status')
  const db = getDb()
  try {
    await assertStorageReady(db)
    const service = new BugReportFeedbackService(db)
    if (args[0] === 'status') return await service.listFeedbackOperations()
    const value = await input()
    if (!value || typeof value !== 'object' || Array.isArray(value) || !('operationId' in value) || typeof value.operationId !== 'string') throw new Error('Invalid feedback operation')
    if (args[0] === 'retry') return await service.retryFeedbackOperation(value.operationId)
    if (!('proof' in value)) throw new Error('Deployment proof is required')
    return await service.recordVerifiedDeployment(value.operationId, value.proof)
  } finally { await db.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await feedbackOwnerCommand(process.argv.slice(2))
    process.stdout.write(JSON.stringify(result) + '\n')
  } catch (error) { console.error(error instanceof Error ? error.message : 'Owner feedback operation failed'); process.exitCode = 1 }
}
