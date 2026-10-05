import type { PostgresDatabase } from '../database/postgres'
export type ExecutionStamp = Array<{ kind: 'card' | 'user'; id: string; epoch: number }>
export class ExecutionRevokedError extends Error { readonly code = 'execution_revoked' }

/** Admission and publication compare the shared generation; epochs never enter undo. */
export class ExecutionAccess {
  readonly db: PostgresDatabase
  constructor(db: PostgresDatabase) { this.db = db }

  async revision(): Promise<number> {
    return (await this.db.prepare('SELECT COALESCE(sum(epoch), 0)::bigint AS revision FROM execution_epochs').get<{ revision: number }>())!.revision
  }

  async assertRevision(revision: number): Promise<void> {
    this.db.assertInTransaction()
    await this.db.exec('SELECT pg_advisory_xact_lock_shared(975)')
    if (revision !== await this.revision()) throw new ExecutionRevokedError('Access changed during session initialization; try again')
  }

  async capture(cardIds: readonly string[], userIds: readonly string[] = []): Promise<ExecutionStamp> {
    const subjects = [...new Set(cardIds)].map(id => ({ kind: 'card' as const, id }))
    const all: Array<{ kind: 'card' | 'user'; id: string }> = [...subjects, ...[...new Set(userIds)].map(id => ({ kind: 'user' as const, id }))]
    const stamp: ExecutionStamp = []
    for (const subject of all.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`))) {
      const row = await this.db.prepare('SELECT epoch FROM execution_epochs WHERE kind=? AND subject_id=?').get<{ epoch: number }>(subject.kind, subject.id)
      stamp.push({ ...subject, epoch: row?.epoch ?? 0 })
    }
    return stamp
  }

  async assert(stamp: ExecutionStamp): Promise<void> {
    this.db.assertInTransaction()
    // The global transaction lock covers short admission/write/publication
    // checks only. Rule execution and retry waiting never hold a DB transaction.
    await this.db.exec('SELECT pg_advisory_xact_lock_shared(975)')
    for (const subject of stamp) {
      const current = await this.db.prepare('SELECT epoch FROM execution_epochs WHERE kind=? AND subject_id=?').get<{ epoch: number }>(subject.kind, subject.id)
      if ((current?.epoch ?? 0) !== subject.epoch) throw new ExecutionRevokedError('This session was invalidated; open a fresh game')
      if (subject.kind === 'user' && await this.db.prepare('SELECT 1 FROM account_deletion_requests WHERE user_id=?').get(subject.id)) throw new ExecutionRevokedError('Account deletion is pending')
    }
  }

  async check(stamp: ExecutionStamp): Promise<void> { await this.db.transaction(() => this.assert(stamp))() }
}
