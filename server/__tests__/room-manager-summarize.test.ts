/**
 * Summarize rooms for the lobby display.
 */
import { describe, expect, it } from 'vitest'
import { summarizeRoomsForLobby } from '../game/room-manager.ts'

describe('summarizeRoomsForLobby', () => {
  const room = (
    id: string,
    playerCount: number,
    maxPlayers = 2,
    createdBy = 'u1',
  ) => ({
    id,
    players: Array.from({ length: playerCount }, () => ({} as never)),
    maxPlayers,
    createdBy,
  })

  it('hides rooms with zero players to keep the lobby free of zombies', () => {
    const summaries = summarizeRoomsForLobby(
      [room('alive', 1), room('zombie', 0), room('joinable', 1, 4)],
      undefined,
      () => false,
    )
    expect(summaries.map((s) => s.id)).toEqual(['alive', 'joinable'])
  })

  it('keeps fixed dev rooms even when empty', () => {
    const summaries = summarizeRoomsForLobby(
      [room('dev2', 0), room('alive', 1)],
      undefined,
      (id) => id === 'dev2',
    )
    expect(summaries.map((s) => s.id)).toEqual(['dev2', 'alive'])
  })

  it('caps the result count when given a positive limit', () => {
    const summaries = summarizeRoomsForLobby(
      [room('a', 1), room('b', 1), room('c', 1)],
      2,
      () => false,
    )
    expect(summaries.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('reports status="playing" only when all seats are filled', () => {
    const summaries = summarizeRoomsForLobby(
      [room('half', 1, 4), room('full', 2, 2)],
      undefined,
      () => false,
    )
    expect(summaries).toEqual([
      { id: 'half', playerCount: 1, maxPlayers: 4, createdBy: 'u1', status: 'waiting' },
      { id: 'full', playerCount: 2, maxPlayers: 2, createdBy: 'u1', status: 'playing' },
    ])
  })
})
