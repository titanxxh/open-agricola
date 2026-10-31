import type { SerializedGameState } from '../../../shared/session/serialization'
import type { PostgresDatabase } from '../../database/postgres'
import type { RoomMeta } from './room-persistence'

type CaptureOpening = {
  roomId: string
  meta: RoomMeta
  state: Pick<SerializedGameState, 'phase' | 'gameOver' | 'enableCommunityDeck'> | undefined
  committedAt: number
}

/** Permanent lifecycle milestones; the caller owns the fenced Room transaction. */
export class OpeningFacts {
  private readonly insert
  private readonly insertAccount
  private readonly markPlaying

  constructor(db: Pick<PostgresDatabase, 'prepare'>) {
    this.insert = db.prepare(`INSERT INTO game_opening_facts (
      room_id, started_at, playing_at, mode, seat_count, parent_cards,
      through_the_seasons, farmers_of_the_moor, snake_opening,
      moor_balance_rules, community_deck, origin
    ) SELECT @roomId, @startedAt,
      CASE WHEN @startedAt>=tracking_since AND @playing THEN @committedAt::bigint ELSE NULL END,
      @mode, @seats, @parents, @seasons, @moor, @snake, @balance, @community,
      CASE WHEN @startedAt>=tracking_since THEN 'live' ELSE 'legacy' END
    FROM game_opening_tracking WHERE singleton
      AND NOT EXISTS(SELECT 1 FROM room_ownership WHERE room_id=@roomId AND development)
    ON CONFLICT(room_id) DO NOTHING`)
    this.insertAccount = db.prepare('INSERT INTO game_opening_accounts(room_id,user_id) VALUES (?,?)')
    this.markPlaying = db.prepare(`UPDATE game_opening_facts SET playing_at=?
      WHERE room_id=? AND playing_at IS NULL AND origin='live'`)
  }

  async capture({ roomId, meta, state, committedAt }: CaptureOpening): Promise<void> {
    if (meta.status !== 'playing' || meta.startedAt == null) return
    const playing = state?.phase === 'playing' && !state.gameOver
    const inserted = await this.insert.run({
      roomId, startedAt: meta.startedAt, committedAt, playing,
      mode: meta.hotseat ? 'hotseat' : meta.maxPlayers === 1 ? 'solo' : 'multiplayer',
      seats: meta.maxPlayers,
      parents: meta.enableParentCards === true,
      seasons: meta.enableThroughTheSeasons === true,
      moor: meta.enableFarmersOfTheMoor === true,
      snake: meta.enableSnakeOpening === true,
      balance: meta.enableFarmersOfTheMoor === true && meta.enableMoorBalanceRules === true,
      community: state?.enableCommunityDeck ?? null,
    })
    if (inserted.changes) {
      for (const userId of new Set(meta.players.map(player => player.userId))) {
        await this.insertAccount.run(roomId, userId)
      }
    }
    if (playing) {
      await this.markPlaying.run(committedAt, roomId)
    }
  }
}
