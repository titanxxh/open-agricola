import { DEFAULT_PLAYER_PREFERENCES } from '../../shared/domain/player-preferences'
import type { PlayerPreferences } from '../../shared/contract/types'
import type { PostgresDatabase } from '../database/postgres'
import type { Room } from './room'
import { roomSeatOwners } from './room'

type PreferenceRow = { userId: string; autoResolveIndependentReactions: boolean }

/** Account defaults for seat settings (#2039); a game copies them into its seats when it starts. */
export class GamePreferencesStore {
  private readonly db: Pick<PostgresDatabase, 'prepare'>

  constructor(db: Pick<PostgresDatabase, 'prepare'>) { this.db = db }

  /** The account's stored defaults; none stored reads as the global defaults. */
  async read(userId: string): Promise<PlayerPreferences> {
    return (await this.readStored([userId])).get(userId) ?? { ...DEFAULT_PLAYER_PREFERENCES }
  }

  async write(userId: string, preferences: PlayerPreferences): Promise<PlayerPreferences> {
    await this.db.prepare(`INSERT INTO user_game_preferences (user_id, auto_resolve_independent_reactions, updated_at)
      VALUES (?, ?, (extract(epoch FROM clock_timestamp()) * 1000)::bigint)
      ON CONFLICT (user_id) DO UPDATE SET auto_resolve_independent_reactions = EXCLUDED.auto_resolve_independent_reactions,
        updated_at = EXCLUDED.updated_at`)
      .run(userId, preferences.autoResolveIndependentReactions)
    return this.read(userId)
  }

  /** Only accounts that stored a choice; the rest keep the global defaults. */
  async readStored(userIds: readonly string[]): Promise<Map<string, PlayerPreferences>> {
    if (userIds.length === 0) return new Map()
    const rows = await this.db.prepare(`SELECT user_id AS "userId",
      auto_resolve_independent_reactions AS "autoResolveIndependentReactions"
      FROM user_game_preferences WHERE user_id = ANY(?::text[])`).all<PreferenceRow>([...new Set(userIds)])
    return new Map(rows.map(row => [row.userId, { autoResolveIndependentReactions: row.autoResolveIndependentReactions }]))
  }
}

/**
 * Copies each seat owner's stored defaults into the starting game, before its
 * first frame. A hotseat room plays every seat with its creator's defaults.
 * Seats without an account, or whose account stored nothing, keep the global defaults.
 */
export const applySeatPreferenceDefaults = async (
  room: Pick<Room, 'session' | 'hotseat' | 'createdBy' | 'players' | 'seatOwners'>,
  store: GamePreferencesStore | undefined,
): Promise<void> => {
  if (!store) return
  const players = room.session.state.players
  const owners = room.hotseat && room.createdBy
    ? players.map((_, playerIndex) => ({ playerIndex, userId: room.createdBy! }))
    : roomSeatOwners(room)
  const stored = await store.readStored(owners.map(owner => owner.userId))
  for (const { playerIndex, userId } of owners) {
    const preferences = stored.get(userId)
    const player = players[playerIndex]
    if (player && preferences) player.preferences = { ...preferences }
  }
}
