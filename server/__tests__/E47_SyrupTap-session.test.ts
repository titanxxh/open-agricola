import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/E/E47_SyrupTap'

const CARD_ID = 'E47_SyrupTap'

describe('E47_SyrupTap session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    session.loadState(state)
    return session
  }

  it('collecting wood from forest queues 1 food on next round', () => {
    const session = setup()
    const state = session.getState().state
    // Ensure forest has wood
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    expect(forest).toBeDefined()
    if (forest) {
      forest.resources.wood = 3
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    // Check futureMeeples are queued for round 2
    const futureMeeples = resp.state.futureMeeples.filter(
      (fm) => fm.cardId === CARD_ID,
    )
    expect(futureMeeples.length).toBe(1)
    expect(futureMeeples[0]!.round).toBe(2)
    expect(futureMeeples[0]!.resources.food).toBe(1)
    const playerId = resp.state.players[0]!.id
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        from: expect.objectContaining({ kind: 'actionSpace' }),
        to: { kind: 'player', playerId },
        resources: expect.objectContaining({ wood: expect.any(Number) }),
      }),
      expect.objectContaining({
        type: 'futureMeeple.queued',
        sourceCardId: CARD_ID,
      }),
    ]))
  })

  it('collecting non-wood resources does not trigger', () => {
    const session = setup()
    const state = session.getState().state
    // Use clay-pit (clay accumulation space)
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    expect(clayPit).toBeDefined()
    if (clayPit) {
      clayPit.resources.clay = 2
      clayPit.resources.wood = 0
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)

    const futureMeeples = resp.state.futureMeeples.filter(
      (fm) => fm.cardId === CARD_ID,
    )
    expect(futureMeeples.length).toBe(0)
    expect(resp.state.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'futureMeeple.queued', sourceCardId: CARD_ID }),
    ]))
  })

  it('does not trigger on round 14 (no next round)', () => {
    const session = setup()
    const state = session.getState().state
    state.round = 14

    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) {
      forest.resources.wood = 3
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const futureMeeples = resp.state.futureMeeples.filter(
      (fm) => fm.cardId === CARD_ID,
    )
    expect(futureMeeples.length).toBe(0)
  })
})
