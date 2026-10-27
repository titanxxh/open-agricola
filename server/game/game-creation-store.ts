import type { GameCreationRecord, SoloCreationConfigurationResponse, SoloCreationErrorCode } from '../../shared/contract/game-creation'
import type { PostgresDatabase } from '../database/postgres'
import { parseGameCreationRecord } from './creation-configuration'
import { CommandError } from './command-store'
import type { CommandOutcome } from '../../shared/contract/protocol/commands'

export class GameCreationError extends CommandError {
  readonly adjustment?: CommandOutcome['creationAdjustment']
  constructor(code: SoloCreationErrorCode | 'command_input_stale', message: string,
    adjustment?: CommandOutcome['creationAdjustment']) { super(code, message); this.adjustment = adjustment }
}

type SourceResult = { ok: true; record: GameCreationRecord }
  | Extract<SoloCreationConfigurationResponse, { ok: false }>

const rejected = (code: SoloCreationErrorCode, message: string): SourceResult => ({ ok: false, code, message })

/** Private creation metadata; authorization never depends on Replay availability. */
export class GameCreationStore {
  private readonly db: Pick<PostgresDatabase, 'prepare' | 'transaction'>
  constructor(db: Pick<PostgresDatabase, 'prepare' | 'transaction'>) { this.db = db }

  async completedSource(roomId: string, userId?: string): Promise<SourceResult> {
    if (!userId) return rejected('login_required', 'Login required')
    return this.db.transaction(async (): Promise<SourceResult> => {
      const context = await this.db.prepare('SELECT lifecycle FROM game_contexts WHERE room_id=? FOR SHARE').get<{ lifecycle: string }>(roomId)
      if (context?.lifecycle === 'removed') return rejected('source_removed', 'This game context was removed')
      if (context?.lifecycle !== 'completed') return rejected('source_not_completed', 'The source game has not completed durably')
      const result = await this.db.prepare('SELECT player_count FROM game_results WHERE room_id=? FOR SHARE').get<{ player_count: number }>(roomId)
      if (result?.player_count !== 1) return rejected('source_not_solo', 'The source is not a completed solo game')
      const players = await this.db.prepare('SELECT user_id FROM game_result_players WHERE room_id=? FOR SHARE').all<{ user_id: string | null }>(roomId)
      if (players.length !== 1 || players[0]?.user_id !== userId) return rejected('not_participant', 'Only the original solo player can reuse this configuration')
      const stored = await this.db.prepare('SELECT configuration_json FROM game_creation_configurations WHERE room_id=?').get<{ configuration_json: string }>(roomId)
      const record = stored ? parseGameCreationRecord(stored.configuration_json) : null
      if (!record) return rejected('creation_configuration_unavailable', 'The original creation configuration is unavailable')
      return { ok: true, record }
    })()
  }
}
