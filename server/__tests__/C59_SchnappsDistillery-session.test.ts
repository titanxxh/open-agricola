import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import '../../shared/cards/C/C059_SchnappsDistillery'

describe('C059_SchnappsDistillery harvest max enforcement (server-side)', () => {
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
    playerA.minorPlayed.push('C059_SchnappsDistillery')
    playerA.resources.vegetable = 2

    // PlayerB: skip feeding complications
    setActiveWorkerCount(playerB, 0) // avoid pending feed

    session.loadState(state)
    return session
  }

  it('caps count at max=1 when client sends count=2', () => {
    const session = setup()
    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('feed')
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) throw new Error('expected harvestFeed pending')
    expect(resp.interaction.playerIndex).toBe(0)
    expect(resp.interaction.remaining).toBe(2)

    // Client sends 2 vegetable conversions for C59 (max=1). Server must cap.
    resp = session.resolveChoice(0, 'confirm', { selections: [
      {
        sourceId: 'C059_SchnappsDistillery',
        exchangeIndex: 0,
        count: 2,
        sourceName: 'Schnapps Distillery',
      },
    ] })

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
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) throw new Error('expected harvestFeed pending')

    resp = session.resolveChoice(0, 'confirm', { selections: [
      {
        sourceId: 'C059_SchnappsDistillery',
        exchangeIndex: 0,
        count: 1,
        sourceName: 'Schnapps Distillery',
      },
    ] })

    const playerA = resp.state.players[0]!
    expect(playerA.resources.vegetable).toBe(1)
    expect(playerA.resources.begging).toBe(0)
    const convertLog = resp.state.log.find((e) => e.key === 'log.harvestFeedConvert')
    expect(convertLog).toBeDefined()
    expect((convertLog as any).params.cost).toEqual({ vegetable: 1 })
  })

  it('selection with unknown sourceId is silently skipped', () => {
    const session = setup()
    let resp = session.performRoundEnd()
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) throw new Error('expected harvestFeed pending')

    // Server cannot resolve the exchange -> selection is dropped; player must
    // beg for the full 2-food deficit, vegetables untouched.
    resp = session.resolveChoice(0, 'confirm', { selections: [
      {
        sourceId: 'NoSuchCard',
        exchangeIndex: 0,
        count: 2,
        sourceName: 'Schnapps Distillery',
      },
    ] })

    const playerA = resp.state.players[0]!
    expect(playerA.resources.vegetable).toBe(2)
    expect(playerA.resources.begging).toBe(2)
  })
})
