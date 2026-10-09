import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import '../../shared/cards/C/C059_SchnappsDistillery'

describe('C059_SchnappsDistillery harvest max enforcement (server-side)', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
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

  it('rejects a count above max without mutating the feeding draft', () => {
    const session = setup()
    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('feed')
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) throw new Error('expected harvestFeed pending')
    expect(resp.interaction.playerIndex).toBe(0)
    expect(resp.interaction.request.remaining).toBe(2)

    const before = session.getState()
    resp = session.resolveChoice(0, 'confirm', { selections: [
      {
        sourceId: 'C059_SchnappsDistillery',
        exchangeIndex: 0,
        count: 2,
        sourceName: 'Schnapps Distillery',
      },
    ] })

    expect(resp.ok).toBe(false)
    expect(resp.state).toEqual(before.state)
    expect(resp.interaction).toEqual(before.interaction)

    resp = session.resolveChoice(0, 'confirm', { selections: [{
      sourceId: 'C059_SchnappsDistillery',
      exchangeIndex: 0,
      count: 1,
      sourceName: 'Schnapps Distillery',
    }] })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
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

  it('rejects an unknown source without mutating the feeding draft', () => {
    const session = setup()
    let resp = session.performRoundEnd()
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) throw new Error('expected harvestFeed pending')

    const before = session.getState()
    resp = session.resolveChoice(0, 'confirm', { selections: [
      {
        sourceId: 'NoSuchCard',
        exchangeIndex: 0,
        count: 2,
        sourceName: 'Schnapps Distillery',
      },
    ] })

    expect(resp.ok).toBe(false)
    expect(resp.state).toEqual(before.state)
    expect(resp.interaction).toEqual(before.interaction)
  })
})
