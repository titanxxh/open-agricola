import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import type { PostgresDatabase } from '../../server/database/postgres'
import { parseGameCreationRecord } from '../../server/game/creation-configuration'
import { parseRoomBody } from '../../server/game/persistence/room-body-codec'
import type { SoloCreationConfiguration, SoloHandMode } from '../../shared/contract/game-creation'

export type SoloDurabilityProof = {
  roomId: string
  ownerId: string
  configuration: SoloCreationConfiguration
  ownedSeats: 1
  step0: { count: 1; frameHash: string }
  hands: { occupationCount: number; minorCount: number; occupationSha256: string; minorSha256: string; match: true }
  moor: null | { cards: 10; draw: 9; current: 1; privateSupplySha256: string }
  readOnlyTransaction: true
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const sameHand = (actual: readonly string[], expected: readonly string[]): boolean => actual.length === expected.length && actual.every((id, index) => id === expected[index])

/** Verifies the two official release-smoke configurations without exposing private hands or supply order. */
export async function readSoloDurability({ db, roomId, ownerId, mode, expected }: {
  db: PostgresDatabase
  roomId: string
  ownerId: string
  mode: SoloHandMode
  expected: { occupationHand: readonly string[]; minorHand: readonly string[] }
}): Promise<SoloDurabilityProof> {
  return db.transaction(async () => {
    await db.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const row = await db.prepare(`SELECT r.max_players,r.solo_hand_mode,r.created_by,r.state_json,c.configuration_json
      FROM rooms r JOIN game_creation_configurations c ON c.room_id=r.id WHERE r.id=?`)
      .get<{ max_players: unknown; solo_hand_mode: unknown; created_by: unknown; state_json: unknown; configuration_json: unknown }>(roomId)
    assert.ok(row, 'The smoke Room must have a durable creation record')
    assert.equal(row.max_players, 1, 'The durable Room must have one player')
    assert.equal(row.created_by, ownerId, 'The durable Room must belong to the smoke account')
    assert.equal(row.solo_hand_mode, mode, 'The durable Room must retain its selected hand mode')
    if (typeof row.configuration_json !== 'string') throw new Error('The creation record must use the persisted codec')
    const creation = parseGameCreationRecord(row.configuration_json)
    assert.ok(creation, 'The persisted creation record must decode')
    assert.equal(creation.resolvedWorkshopSources.length, 0, 'The smoke uses official cards')
    const configuration = creation.configuration, expanded = mode === 'choose-7'
    assert.equal(configuration.kind, 'standard-solo'); assert.equal(configuration.maxPlayers, 1)
    assert.equal(configuration.soloHandMode, mode)
    assert.equal(configuration.enableFarmersOfTheMoor, expanded); assert.equal(configuration.enableThroughTheSeasons, expanded)
    assert.equal(configuration.enableParentCards, expanded); assert.equal(configuration.enableCommunityDeck, false)
    assert.equal(configuration.customCardIds.length, 0)
    if (expanded) assert.equal(configuration.draftParents, true, 'The expanded smoke selects Parents manually')
    const seats = await db.prepare('SELECT player_index,user_id FROM room_players WHERE room_id=?')
      .all<{ player_index: unknown; user_id: unknown }>(roomId)
    assert.equal(seats.length, 1, 'The smoke Room must have one owned seat')
    const seat = seats[0]; assert.ok(seat)
    assert.equal(seat.player_index, 0); assert.equal(seat.user_id, ownerId)
    const initial = await db.prepare('SELECT frame_hash FROM game_replay_steps WHERE room_id=? AND step_no=0')
      .all<{ frame_hash: unknown }>(roomId)
    assert.equal(initial.length, 1, 'The smoke Room must have exactly one Step 0')
    const first = initial[0]
    if (!first || typeof first.frame_hash !== 'string' || !/^[a-f0-9]{64}$/.test(first.frame_hash)) throw new Error('Step 0 must have a frame hash')
    if (typeof row.state_json !== 'string') throw new Error('The smoke Room must have a durable body')
    let body: unknown
    try { body = parseRoomBody(row.state_json) } catch { throw new Error('The persisted Room body could not be decoded') }
    if (!object(body) || !object(body.state)) throw new Error('The durable body must contain a state')
    const state = body.state, players = state.players
    if (!Array.isArray(players) || players.length !== 1) throw new Error('The durable body must contain one player')
    const player: unknown = players[0]
    if (!object(player) || !strings(player.occupationHand) || !strings(player.minorHand)) throw new Error('The durable body must contain valid hands')
    assert.equal(expected.occupationHand.length, 7); assert.equal(expected.minorHand.length, 7)
    assert.ok(sameHand(player.occupationHand, expected.occupationHand), 'Persisted occupation hand differs from the observed hand')
    assert.ok(sameHand(player.minorHand, expected.minorHand), 'Persisted minor hand differs from the observed hand')
    let moor: SoloDurabilityProof['moor'] = null
    if (expanded) {
      if (!object(state.farmersOfTheMoor) || !Array.isArray(state.farmersOfTheMoor.specialActionCards)) throw new Error('The expanded Room must retain its Moor supply')
      const cards: unknown[] = state.farmersOfTheMoor.specialActionCards, ids: string[] = []
      let draw = 0, current = 0
      for (const card of cards) {
        if (!object(card) || typeof card.id !== 'string' || !object(card.location)) throw new Error('The persisted Moor supply must have explicit locations')
        ids.push(card.id)
        if (card.location.kind === 'solo-draw') draw++
        if (card.location.kind === 'solo-current') current++
      }
      assert.equal(cards.length, 10); assert.equal(new Set(ids).size, 10); assert.equal(draw, 9); assert.equal(current, 1)
      moor = { cards: 10, draw: 9, current: 1, privateSupplySha256: hash(cards) }
    }
    const proof: SoloDurabilityProof = { roomId, ownerId, configuration, ownedSeats: 1, step0: { count: 1, frameHash: first.frame_hash },
      hands: { occupationCount: player.occupationHand.length, minorCount: player.minorHand.length,
        occupationSha256: hash(player.occupationHand), minorSha256: hash(player.minorHand), match: true },
      moor, readOnlyTransaction: true }
    return proof
  })()
}
