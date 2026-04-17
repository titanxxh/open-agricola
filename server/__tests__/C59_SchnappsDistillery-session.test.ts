import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/game/player'
import '../../shared/cards/C/C59_SchnappsDistillery'

describe('C59_SchnappsDistillery harvest max enforcement (server-side)', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.resources.food = 0
    })

    const playerA = state.players[0]!
    const playerB = state.players[1]!
    playerA.startPlayer = true
    playerB.startPlayer = false
    playerA.name = 'PlayerA'
    playerB.name = 'PlayerB'

    // PlayerA needs 2 food (familySize=1 * 2), has C59 + 2 vegetables
    playerA.minorPlayed.push('C59_SchnappsDistillery')
    playerA.playedCards.push('minor:C59_SchnappsDistillery')
    playerA.resources.vegetable = 2

    // PlayerB: skip feeding complications
    setActiveWorkerCount(playerB, 0) // avoid pending feed

    session.loadState(state)
    return session
  }

  it('caps count at max=1 when client sends count=2', () => {
    const session = setup()
    let resp = session.performRoundEnd()
    expect(resp.pending.type).toBe('harvestFeed')
    if (resp.pending.type !== 'harvestFeed') throw new Error('expected harvestFeed pending')
    expect(resp.pending.playerIndex).toBe(0)
    expect(resp.pending.remaining).toBe(2)

    // Client sends 2 vegetable conversions for C59 (max=1). Server must cap.
    resp = session.confirmHarvestFeed(0, [
      {
        resourceKey: 'vegetable',
        count: 2,
        food: 5,
        sourceName: 'Schnapps Distillery',
        sourceId: 'C59_SchnappsDistillery',
      },
    ])

    const playerA = resp.state.players[0]!
    // Only 1 vegetable consumed (max=1), not 2
    expect(playerA.resources.vegetable).toBe(1)
    // No begging — 5 food (from 1 vegetable) covers 2-food requirement
    expect(playerA.resources.begging).toBe(0)
    // Verify the conversion log records cost=1 vegetable (not 2)
    const convertLog = resp.state.log.find((e) => e.key === 'log.harvestFeedConvert')
    expect(convertLog).toBeDefined()
    expect((convertLog as any).params.cost).toEqual({ vegetable: 1 })
  })

  it('allows count=1 (within max)', () => {
    const session = setup()
    let resp = session.performRoundEnd()
    if (resp.pending.type !== 'harvestFeed') throw new Error('expected harvestFeed pending')

    resp = session.confirmHarvestFeed(0, [
      {
        resourceKey: 'vegetable',
        count: 1,
        food: 5,
        sourceName: 'Schnapps Distillery',
        sourceId: 'C59_SchnappsDistillery',
      },
    ])

    const playerA = resp.state.players[0]!
    expect(playerA.resources.vegetable).toBe(1)
    expect(playerA.resources.begging).toBe(0)
    const convertLog = resp.state.log.find((e) => e.key === 'log.harvestFeedConvert')
    expect(convertLog).toBeDefined()
    expect((convertLog as any).params.cost).toEqual({ vegetable: 1 })
  })

  it('no sourceId: count=2 is NOT capped (legacy clients unaffected)', () => {
    const session = setup()
    let resp = session.performRoundEnd()
    if (resp.pending.type !== 'harvestFeed') throw new Error('expected harvestFeed pending')

    // Legacy selection without sourceId: server cannot enforce max, falls
    // through (resource-availability still bounds count to 2)
    resp = session.confirmHarvestFeed(0, [
      {
        resourceKey: 'vegetable',
        count: 2,
        food: 5,
        sourceName: 'Schnapps Distillery',
      },
    ])

    const playerA = resp.state.players[0]!
    // Both vegetables consumed (no sourceId → no cap)
    expect(playerA.resources.vegetable).toBe(0)
  })
})
