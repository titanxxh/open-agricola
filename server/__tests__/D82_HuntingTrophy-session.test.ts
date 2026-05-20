import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/D/D82_HuntingTrophy'

const CARD_ID = 'D82_HuntingTrophy'

describe('D82_HuntingTrophy session', () => {
  const setupFarmRedevelopment = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 10

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.houseType = 'clay'
    player.rooms = 2
    player.resources = {
      ...player.resources,
      wood: 1,
      clay: 0,
      stone: 2,
      reed: 1,
      food: 0,
    }
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    setWorkersAtHome(state, player, 2)

    const space = state.actionSpaces.find((entry) => entry.id === 'farm-redevelopment')
    if (space) {
      space.roundAvailable = 1
      space.takenBy = []
    }

    session.loadState(state)
    return { session, player }
  }

  it('farm-redevelopment can reach the fence prompt with only 1 wood and no modifier mutation', () => {
    const { session, player } = setupFarmRedevelopment()

    const resp = session.takeAction(0, 'farm-redevelopment')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.options?.some((option) => option.labelKey === 'actions.fencing.name')).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.activeModifiers?.some((modifier) => modifier.cardId === CARD_ID)).toBe(false)
    expect(updatedPlayer.cardStates?.[CARD_ID]?.flagged).toBeUndefined()
    expect(player.activeModifiers?.some((modifier) => modifier.cardId === CARD_ID)).toBe(false)
  })
})
