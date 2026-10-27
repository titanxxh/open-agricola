import type { PostgresDatabase as Database } from '../database/postgres'
import { emptyRoomTtlMs, isDevRoom } from './room.ts'
import { persistedRoomAccessError } from './room-access'
import { GameCreationStore } from './game-creation-store'
import type { SoloCreationConfigurationResponse } from '../../shared/contract/game-creation'
import { resolveSoloWorkshopCards } from './workshop-room-cards'
import type {
  CompletedGameContextDescriptor,
  GameContextLifecycle,
  GameContextResponse,
  RemovedGameContextDescriptor,
} from '../../shared/contract/protocol/game-context.ts'

type StoreDatabase = Pick<Database, 'prepare' | 'transaction'>

type ContextRow = {
  room_id: string
  lifecycle: GameContextLifecycle
  phase: 'waiting' | 'playing' | null
  replay_status: 'available' | 'legacy_no_replay' | null
  expires_at: number | null
  removal_reason: string | null
}

type ActiveRow = {
  version: number
  latest_step_no: number | null
  player_index: number
}

type ResultRow = {
  started_at: number
  finished_at: number
  rounds_played: number
  player_count: number
  enable_community_deck: number
  enable_parent_cards: number
  enable_through_the_seasons: number
  enable_farmers_of_the_moor: number
  enable_snake_opening: number
}

type ResultPlayerRow = {
  player_index: number
  display_name: string
  name_is_default: number
  score: number
}

type ReplayRow = {
  schema_version: number
  viewer_build_id: string
  latest_step_no: number
  missing_prefix: number
  first_step_no: number
}

const removedReason = (
  value: string | null,
): RemovedGameContextDescriptor['reason'] =>
  value === 'moderation' || value === 'legal' ? value : 'removed'

export class GameContextStore {
  private readonly db: StoreDatabase

  async readCreationConfiguration(roomId: string, userId?: string): Promise<SoloCreationConfigurationResponse> {
    const source = await new GameCreationStore(this.db).completedSource(roomId, userId)
    if (!source.ok) return source
    const resolved = await resolveSoloWorkshopCards(this.db, source.record.configuration)
    return { ok: true, configuration: source.record.configuration, issues: resolved.issues }
  }
  private readonly now: () => number

  constructor(
    db: StoreDatabase,
    now: () => number = Date.now,
  ) {
    this.db = db
    this.now = now
  }

  private async loadContext(roomId: string): Promise<Awaited<ContextRow | null>> {
    return ((await this.db.prepare(`
      SELECT room_id, lifecycle, phase, replay_status, expires_at, removal_reason
      FROM game_contexts
      WHERE room_id = ?
    `).get(roomId)) as ContextRow | undefined) ?? null
  }

  private async expireActive(roomId: string, now: number): Promise<Awaited<void>> {
    ;(await this.db.transaction(async () => {
      await this.db.prepare('SELECT room_id FROM room_ownership WHERE room_id=? FOR UPDATE').get(roomId)
      const context = await this.db.prepare('SELECT lifecycle, expires_at FROM game_contexts WHERE room_id = ? FOR UPDATE').get<{ lifecycle: string; expires_at: number | null }>(roomId)
      if (!context || context.lifecycle !== 'active') return
      if (await this.hasLiveWork(roomId, now)) return
      const exists = await this.db.prepare('SELECT 1 FROM rooms WHERE id = ?').get(roomId)
      if (exists && (context.expires_at === null || context.expires_at > now)) return
      await this.db.prepare("UPDATE room_ownership SET status='retired', lease_until=0 WHERE room_id=?").run(roomId)
      ;(await this.db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId))
      ;(await this.db.prepare(`
        UPDATE game_contexts
        SET lifecycle = 'expired',
            phase = NULL,
            expires_at = ?,
            updated_at = ?
        WHERE room_id = ? AND lifecycle = 'active'
      `).run(now, now, roomId))
    })())
  }

  private async hasLiveWork(roomId: string, now: number): Promise<boolean> {
    return !!await this.db.prepare(`SELECT 1 FROM room_ownership o JOIN app_instances i USING(instance_id)
      WHERE o.room_id=? AND o.status!='retired' AND o.lease_until>? AND i.lease_until>? AND i.status IN ('starting','ready')
        AND (o.admission_until>? OR EXISTS(SELECT 1 FROM room_presence p WHERE p.room_id=o.room_id AND p.epoch=o.epoch AND p.connected_count>0)
          OR EXISTS(SELECT 1 FROM command_requests r WHERE (r.target_room_id=o.room_id OR r.result_room_id=o.room_id) AND r.outcome_json IS NULL))`)
      .get(roomId, now, now, now)
  }

  async expireInactiveRooms(instanceId: string, loadedIds: readonly string[]): Promise<void> {
    const now = this.now()
    const candidates = await this.db.prepare(`SELECT c.room_id,r.status FROM game_contexts c JOIN rooms r ON r.id=c.room_id
      LEFT JOIN room_ownership o ON o.room_id=r.id LEFT JOIN app_instances i USING(instance_id)
      WHERE c.lifecycle='active' AND r.status IN ('waiting','playing') AND (c.expires_at IS NULL OR c.expires_at<=?)
        AND NOT coalesce(o.development,false) AND NOT EXISTS(SELECT 1 FROM development_room_slots s WHERE s.room_id=r.id)
        AND r.id NOT IN (SELECT value FROM json_array_elements_text(?::json) AS item(value))
        AND (o.room_id IS NULL OR o.instance_id=? OR o.lease_until<=? OR i.lease_until<=? OR i.status NOT IN ('starting','ready'))`)
      .all<{ room_id: string; status: 'waiting' | 'playing' }>(now, JSON.stringify(loadedIds), instanceId, now, now)
    for (const candidate of candidates) {
      await this.db.transaction(async () => {
        const owner = await this.db.prepare('SELECT admission_until,lease_until FROM room_ownership WHERE room_id=? FOR UPDATE')
          .get<{ admission_until: number; lease_until: number }>(candidate.room_id)
        if (owner && owner.lease_until > now && owner.admission_until > now) return
        if (await this.hasLiveWork(candidate.room_id, now)) return
        const context = await this.db.prepare('SELECT lifecycle,expires_at FROM game_contexts WHERE room_id=? FOR UPDATE')
          .get<{ lifecycle: string; expires_at: number | null }>(candidate.room_id)
        if (!context || context.lifecycle !== 'active') return
        if (context.expires_at === null) {
          await this.setActiveExpiry(candidate.room_id, now + emptyRoomTtlMs(candidate))
        } else if (context.expires_at <= now) {
          await this.expireActive(candidate.room_id, now)
        }
      })()
    }
  }

  private async currentContext(roomId: string): Promise<Awaited<ContextRow | null>> {
    const context = (await this.loadContext(roomId))
    if (!context || context.lifecycle !== 'active') return context
    const now = this.now()
    const roomExists = (await this.db.prepare('SELECT 1 FROM rooms WHERE id = ?').get(roomId))
    if (!roomExists || (context.expires_at !== null && context.expires_at <= now)) {
      ;(await this.expireActive(roomId, now))
      return (await this.loadContext(roomId))
    }
    return context
  }

  async lifecycle(roomId: string): Promise<Awaited<GameContextLifecycle | null>> {
    return (await this.currentContext(roomId))?.lifecycle ?? null
  }

  async activeExpiresAt(roomId: string): Promise<Awaited<number | null>> {
    const context = (await this.currentContext(roomId))
    return context?.lifecycle === 'active' ? context.expires_at : null
  }

  async setActiveExpiry(roomId: string, expiresAt: number): Promise<Awaited<void>> {
    ;(await this.db.prepare(`
      UPDATE game_contexts
      SET expires_at = ?, updated_at = ?
      WHERE room_id = ? AND lifecycle = 'active'
    `).run(isDevRoom(roomId) ? null : expiresAt, this.now(), roomId))
  }

  async clearActiveExpiry(roomId: string): Promise<Awaited<void>> {
    ;(await this.db.prepare(`
      UPDATE game_contexts
      SET expires_at = NULL, updated_at = ?
      WHERE room_id = ? AND lifecycle = 'active'
    `).run(this.now(), roomId))
  }

  async resolve(roomId: string, userId?: string): Promise<Awaited<GameContextResponse>> {
    const context = (await this.currentContext(roomId))
    if (!context) {
      return {
        ok: false,
        code: 'unknown_context',
        message: 'Game context not found',
      }
    }

    if (context.lifecycle === 'expired') {
      return { ok: true, roomId, lifecycle: 'expired' }
    }
    if (context.lifecycle === 'removed') {
      return {
        ok: true,
        roomId,
        lifecycle: 'removed',
        reason: removedReason(context.removal_reason),
      }
    }
    if (context.lifecycle === 'active') {
      const accessError = await persistedRoomAccessError(this.db, roomId, userId)
      if (accessError) return accessError
      if (!userId) {
        return {
          ok: false,
          code: 'login_required',
          lifecycle: 'active',
          message: 'Login required',
        }
      }
      const active = (await this.db.prepare(`
        SELECT rooms.version,
               game_replays.latest_step_no,
               room_players.player_index
        FROM rooms
        JOIN room_players
          ON room_players.room_id = rooms.id
         AND room_players.user_id = ?
        LEFT JOIN game_replays ON game_replays.room_id = rooms.id
        WHERE rooms.id = ?
        ORDER BY room_players.player_index LIMIT 1
      `).get(userId, roomId)) as ActiveRow | undefined
      if (!active) {
        return {
          ok: false,
          code: 'not_participant',
          lifecycle: 'active',
          message: 'Only original participants can resume this game',
        }
      }
      return {
        ok: true,
        roomId,
        lifecycle: 'active',
        phase: context.phase === 'waiting' ? 'waiting' : 'playing',
        playerIndex: active.player_index,
        roomVersion: active.version,
        stepNo: Math.max(0, active.latest_step_no ?? 0),
        ...(context.expires_at === null ? {} : { expiresAt: context.expires_at }),
      }
    }

    const result = (await this.db.prepare(`
      SELECT started_at, finished_at, rounds_played, player_count,
             enable_community_deck, enable_parent_cards,
             enable_through_the_seasons, enable_farmers_of_the_moor,
             enable_snake_opening
      FROM game_results
      WHERE room_id = ?
    `).get(roomId)) as ResultRow | undefined
    if (!result) {
      return {
        ok: false,
        code: 'replay_segment_unavailable',
        lifecycle: 'completed',
        message: 'Completed game summary is unavailable',
      }
    }
    const players = (await this.db.prepare(`
      SELECT player_index, display_name, score, name_is_default
      FROM game_result_players
      WHERE room_id = ?
      ORDER BY player_index
    `).all(roomId)) as ResultPlayerRow[]
    const descriptor: CompletedGameContextDescriptor = {
      ok: true,
      roomId,
      lifecycle: 'completed',
      replayStatus: context.replay_status === 'available'
        ? 'available'
        : 'legacy_no_replay',
      result: {
        startedAt: result.started_at,
        finishedAt: result.finished_at,
        roundsPlayed: result.rounds_played,
        playerCount: result.player_count,
        enableCommunityDeck: result.enable_community_deck === 1,
        enableParentCards: result.enable_parent_cards === 1,
        enableThroughTheSeasons: result.enable_through_the_seasons === 1,
        enableFarmersOfTheMoor: result.enable_farmers_of_the_moor === 1,
        enableSnakeOpening: result.enable_snake_opening === 1,
        players: players.map((player) => ({
          playerIndex: player.player_index,
          displayName: player.display_name,
          ...(player.name_is_default === 1 ? { nameIsDefault: true } : {}),
          score: player.score,
        })),
      },
    }
    if (descriptor.replayStatus === 'available') {
      const replay = (await this.db.prepare(`
        SELECT replay.schema_version,
               replay.viewer_build_id,
               replay.latest_step_no,
               replay.missing_prefix,
               MIN(step.step_no) AS first_step_no
        FROM game_replays AS replay
        JOIN game_replay_steps AS step ON step.room_id = replay.room_id
        WHERE replay.room_id = ?
        GROUP BY replay.room_id
      `).get(roomId)) as ReplayRow | undefined
      if (replay) {
        descriptor.replay = {
          firstStepNo: replay.first_step_no,
          lastStepNo: replay.latest_step_no,
          missingPrefix: replay.missing_prefix === 1,
          schemaVersion: replay.schema_version,
          viewerBuildId: replay.viewer_build_id,
        }
      }
    }
    return descriptor
  }
}
