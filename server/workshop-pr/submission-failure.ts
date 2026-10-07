import { nanoid } from 'nanoid'
import type { PostgresDatabase } from '../database/postgres'
import { GitHubApiError } from './github-transport'

export const submissionFailureCode = (error: unknown): string =>
  error instanceof GitHubApiError ? error.code : 'submission_internal_error'

/** Private audit data only. Never serialize the error, its message/cause, URLs or response bodies. */
export async function recordSubmissionFailure(db: PostgresDatabase, context: {
  cardId: string; authorId: string; phase: string; submissionId?: string; attempt?: number
}, error: unknown): Promise<void> {
  const known = error instanceof GitHubApiError
  const diagnostic = known ? error.diagnostic : undefined
  await db.prepare(`INSERT INTO github_propose_audit
    (id,user_id,workshop_card_id,action,error_code,error_message,created_at) VALUES (?,?,?,?,?,?,?)`)
    .run(nanoid(), context.authorId, context.cardId, 'submission_failed', submissionFailureCode(error), JSON.stringify({
      submissionId:context.submissionId, attempt:context.attempt, phase:context.phase,
      kind:diagnostic?.kind ?? (known ? 'submission' : 'internal'),
      status:known ? error.status : undefined,
      operation:diagnostic?.operation, httpStatus:diagnostic?.httpStatus,
      requestId:diagnostic?.requestId, transportCode:diagnostic?.transportCode,
    }), Date.now())
}
