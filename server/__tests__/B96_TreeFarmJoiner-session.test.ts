import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'

const CARD_ID = 'B96_TreeFarmJoiner'
const MINOR_ID = 'B4_WoodPile'

describe('B96 Tree Farm Joiner session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 2
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })

    const playerA = state.players[0]!
    const playerB = state.players[1]!
    playerA.startPlayer = true
    playerA.occupationPlayed.push(CARD_ID)
    playerA.minorHand = [MINOR_ID]
    setActiveWorkerCount(playerB, 0)
    state.futureMeeples = [{
      id: 'b96-future-wood',
      cardId: CARD_ID,
      playerId: playerA.id,
      round: 3,
      actionId: null,
      resources: { wood: 1 },
    }]

    session.loadState(state)
    return session
  }

  it('offers a card-local optional minor improvement after future wood receive', () => {
    const session = setup()

    const resp = session.performRoundEnd()

    expect(resp.state.players[0]!.resources.wood).toBe(1)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionOptionalAction')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined)
      .toBe(CARD_ID)
  })
})
