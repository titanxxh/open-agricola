import { createHash, randomUUID } from 'node:crypto'
import type { CommandErrorCode, CommandIdentity, CommandOutcome, CommandReceipt, CommandScope } from '../../shared/contract/protocol/commands'
import type { PostgresDatabase } from '../database/postgres'
import { canonicalJson } from './replay-codec'

const SCOPE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export class CommandError extends Error {
  readonly code: CommandErrorCode
  constructor(code: CommandErrorCode, message: string) { super(message); this.code = code }
}
export type CommandRequest = CommandIdentity & {
  actorId: string; fingerprint: string; targetRoomId: string | null; resultRoomId: string | null
}
export type CommandReceiptWrite = { request: CommandRequest; outcome: CommandOutcome }
export type CommandLookup = { kind: 'unknown' } | { kind: 'pending'; request: CommandRequest } | { kind: 'completed'; receipt: CommandReceipt }
type RequestRow = { fingerprint: string; target_room_id: string | null; result_room_id: string | null; outcome_json: string | null }

/** Private operational records. No raw command payload or player Frame is archived here. */
export class CommandStore {
  readonly db: PostgresDatabase
  private readonly testClock?: () => number
  constructor(db: PostgresDatabase, clock?: () => number) { this.db = db; this.testClock = clock }

  private async now(): Promise<number> {
    return this.testClock?.() ?? (await this.db.prepare('SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now').get())!.now as number
  }

  async issueScope(actorId: string): Promise<CommandScope> {
    if (!actorId) throw new Error('Command scope requires an authenticated actor')
    const now = await this.now()
    const scope = { scopeId: randomUUID(), expiresAt: now + SCOPE_LIFETIME_MS }
    await this.db.prepare('INSERT INTO command_scopes(scope_id, actor_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(scope.scopeId, actorId, now, scope.expiresAt)
    return scope
  }

  async resumeScope(actorId: string, scopeId?: string): Promise<CommandScope> {
    if (scopeId === undefined) return this.issueScope(actorId)
    if (UUID.test(scopeId)) {
      const row = await this.db.prepare('SELECT expires_at FROM command_scopes WHERE scope_id = ? AND actor_id = ?').get(scopeId, actorId) as { expires_at: number } | undefined
      if (row && row.expires_at > await this.now()) return { scopeId, expiresAt: row.expires_at }
    }
    throw new CommandError('command_scope_expired', 'The command scope expired; refresh and choose again')
  }

  private async checkScope(actorId: string, identity: CommandIdentity, lock: boolean): Promise<void> {
    if (!UUID.test(identity?.scopeId ?? '') || !UUID.test(identity?.commandId ?? '')) throw new CommandError('command_identity_required', 'A stable command identity is required')
    const scope = await this.db.prepare(`SELECT expires_at FROM command_scopes WHERE scope_id = ? AND actor_id = ?${lock ? ' FOR UPDATE' : ''}`).get(identity.scopeId, actorId) as { expires_at: number } | undefined
    if (!scope || scope.expires_at <= await this.now()) throw new CommandError('command_scope_expired', 'The command scope expired; refresh and choose again')
  }

  private decode(actorId: string, identity: CommandIdentity, row: RequestRow | undefined): CommandLookup {
    if (!row) return { kind: 'unknown' }
    if (row.outcome_json !== null) return { kind: 'completed', receipt: { scopeId: identity.scopeId, commandId: identity.commandId, outcome: JSON.parse(row.outcome_json) as CommandOutcome } }
    return { kind: 'pending', request: { scopeId: identity.scopeId, commandId: identity.commandId, actorId, fingerprint: row.fingerprint, targetRoomId: row.target_room_id, resultRoomId: row.result_room_id } }
  }

  async lookup(actorId: string, identity: CommandIdentity): Promise<CommandLookup> {
    return this.db.transaction(async () => {
      await this.checkScope(actorId, identity, true)
      const row = await this.db.prepare('SELECT * FROM command_requests WHERE scope_id = ? AND command_id = ?').get(identity.scopeId, identity.commandId) as RequestRow | undefined
      return this.decode(actorId, identity, row)
    })()
  }

  async reserve(actorId: string, identity: CommandIdentity, targetRoomId: string | null, command: Record<string, unknown>, resultRoomPrefix?: string | null, reservedRoomId?: string): Promise<Exclude<CommandLookup, { kind: 'unknown' }>> {
    const { requestId: _requestId, scopeId: _scopeId, commandId: _commandId, commandContext, ...body } = command
    if (commandContext && typeof commandContext === 'object') {
      const { scopeId: _scope, commandId: _id, ...input } = commandContext as Record<string, unknown>
      body.commandContext = input
    }
    const fingerprint = createHash('sha256').update(canonicalJson({ targetRoomId, command: body })).digest('hex')
    return this.db.transaction(async () => {
      await this.checkScope(actorId, identity, true)
      let row = await this.db.prepare('SELECT * FROM command_requests WHERE scope_id = ? AND command_id = ?').get(identity.scopeId, identity.commandId) as RequestRow | undefined
      if (row && row.fingerprint !== fingerprint) throw new CommandError('command_content_conflict', 'The command identity was already used for different input')
      if (!row) {
        const resultRoomId = body.type === 'createRoom' || body.type === 'newGame' ? reservedRoomId ?? `${resultRoomPrefix ? reservedRoomId ?? `${resultRoomPrefix}-` : ''}${randomUUID()}` : targetRoomId
        row = { fingerprint, target_room_id: targetRoomId, result_room_id: resultRoomId, outcome_json: null }
        await this.db.prepare(`INSERT INTO command_requests(scope_id, command_id, fingerprint, target_room_id, result_room_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`).run(identity.scopeId, identity.commandId, fingerprint, targetRoomId, resultRoomId, await this.now())
      }
      if (reservedRoomId && row.result_room_id !== reservedRoomId) throw new CommandError('command_content_conflict', 'Command destination changed')
      return this.decode(actorId, identity, row) as Exclude<CommandLookup, { kind: 'unknown' }>
    })()
  }

  /** Call inside the SAME transaction that writes Room/Replay or lifecycle metadata. */
  async complete(request: CommandRequest, outcome: CommandOutcome): Promise<CommandReceipt> {
    this.db.assertInTransaction()
    await this.checkScope(request.actorId, request, true)
    const row = await this.db.prepare('SELECT * FROM command_requests WHERE scope_id = ? AND command_id = ? FOR UPDATE').get(request.scopeId, request.commandId) as RequestRow | undefined
    if (!row || row.fingerprint !== request.fingerprint) throw new CommandError('command_content_conflict', 'Command reservation changed')
    if (row.outcome_json !== null) {
      if (row.outcome_json !== canonicalJson(outcome)) throw new CommandError('command_content_conflict', 'A committed command cannot change its result')
      return { scopeId: request.scopeId, commandId: request.commandId, outcome: JSON.parse(row.outcome_json) as CommandOutcome }
    }
    await this.db.prepare('UPDATE command_requests SET outcome_json = ?, completed_at = ? WHERE scope_id = ? AND command_id = ?').run(canonicalJson(outcome), await this.now(), request.scopeId, request.commandId)
    return { scopeId: request.scopeId, commandId: request.commandId, outcome }
  }

  async cleanup(): Promise<void> {
    await this.db.prepare('DELETE FROM command_scopes WHERE expires_at <= ?').run(await this.now())
  }
}
