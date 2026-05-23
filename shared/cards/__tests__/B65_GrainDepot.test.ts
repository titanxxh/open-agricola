import { describe, expect, it } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import type { PlayerState } from '../../contract/types'

const CARD_ID = 'B65_GrainDepot'

const setWorkersAtHome = (player: PlayerState, count: number) => {
  player.workers = Array.from({ length: 5 }, (_, i) => ({
    id: String(i + 1),
    isActive: i < count,
    isNewborn: false,
  }))
}

describe('B65 Grain Depot', () => {
  it('uses the selected improvement payment feeIndex for onBuy future grain', () => {
    const session = new GameSession(1)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    setWorkersAtHome(state.players[0]!, 2)
    setWorkersAtHome(state.players[1]!, 0)
    session.loadState(state)

    const liveState = session.getState().state
    const player = liveState.players[0]!
    player.resources = {
      ...player.resources,
      wood: 2,
      clay: 2,
      stone: 2,
      food: 0,
      reed: 0,
      grain: 0,
      vegetable: 0,
    }
    player.minorHand = [CARD_ID]
    player.minorPlayed = []
    player.occupationHand = ['__test_placeholder__']
    liveState.players[1]!.minorHand = ['__test_placeholder__']
    liveState.players[1]!.occupationHand = ['__test_placeholder__']
    liveState.availableMajorImprovements = []

    let resp = session.takeAction(0, 'major-improvement')
    if (resp.interaction.promptKey !== 'prompt.selectPayment') {
      const option = resp.interaction.options?.find((o) => o.value === `minor:${CARD_ID}`)
      expect(option).toBeDefined()
      resp = session.resolveChoice(0, option!.value)
    }

    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    expect(resp.interaction.options?.length).toBeGreaterThan(1)

    const clayPayment = resp.interaction.options?.find((o) =>
      o.value === `pay:improvement:minor:${CARD_ID}:1`,
    )
    expect(clayPayment).toBeDefined()

    resp = session.resolveChoice(0, clayPayment!.value)

    const futureGrain = resp.state.futureMeeples.filter((entry) => entry.cardId === CARD_ID)
    expect(futureGrain).toHaveLength(3)
    expect(futureGrain.map((entry) => entry.resources)).toEqual([
      { grain: 1 },
      { grain: 1 },
      { grain: 1 },
    ])
    expect(resp.state.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'card.triggered', cardId: CARD_ID }),
    ]))
    expect(resp.state.log).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'log.cardTriggered' }),
    ]))
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'card.played',
        cardId: CARD_ID,
        sourceActionId: 'apply-improvement',
        sourceCardId: CARD_ID,
      }),
    ]))
  })
})
