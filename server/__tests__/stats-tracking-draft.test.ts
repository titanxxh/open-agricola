import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

describe('PlayerStats draft tracking', () => {
  it('records each pick with draftTurn for occ + minor', () => {
    const session = new GameSession(123456, undefined, {
      playerCount: 2,
      draftMode: 'simultaneous',
      draftPoolSize: 7,
    })
    const draft = session.getState().state.draft!
    const p1Pool = draft.pools['p1']!
    const p2Pool = draft.pools['p2']!
    const p1Pick = { occCardId: p1Pool.occ[0]!, minorCardId: p1Pool.minor[0]! }
    const p2Pick = { occCardId: p2Pool.occ[0]!, minorCardId: p2Pool.minor[0]! }

    let resp = session.submitDraftPick('p1', p1Pick)
    expect(resp.ok).toBe(true)
    resp = session.submitDraftPick('p2', p2Pick)
    expect(resp.ok).toBe(true)

    const after = session.getState().state.players[0]!
    expect(after.stats.draftHistory.length).toBe(2)
    expect(after.stats.draftHistory).toEqual(
      expect.arrayContaining([
        { cardId: p1Pick.occCardId, draftTurn: 1 },
        { cardId: p1Pick.minorCardId, draftTurn: 1 },
      ]),
    )

    const p2 = session.getState().state.players[1]!
    expect(p2.stats.draftHistory).toEqual(
      expect.arrayContaining([
        { cardId: p2Pick.occCardId, draftTurn: 1 },
        { cardId: p2Pick.minorCardId, draftTurn: 1 },
      ]),
    )
  })

  it('recordDraftPlayed sets playedTurn on the original draft entry when occupation is played', async () => {
    const { recordDraftPick, recordDraftPlayed, createInitialPlayerStats } = await import('../../shared/logic/stats')
    const player = {
      id: 'p1',
      stats: createInitialPlayerStats({ isFirstPlayer: false }),
    } as unknown as Parameters<typeof recordDraftPick>[0]
    recordDraftPick(player, 'A29', 1)
    recordDraftPlayed(player, 'A29', 5)
    expect(player.stats.draftHistory[0]!.playedTurn).toBe(5)
  })
})
