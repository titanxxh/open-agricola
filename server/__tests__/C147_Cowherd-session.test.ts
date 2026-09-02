import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/C/C147_Cowherd'

const CARD_ID = 'C147_Cowherd'

const setup = (currentPlayerIndex: number, played = true) => {
  const session = new GameSession(147, undefined, { playerCount: 3 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = currentPlayerIndex
  state.round = 14
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.cattle = 0
  })
  const owner = state.players[0]!
  if (played) owner.occupationPlayed = [CARD_ID]
  else owner.occupationHand = [CARD_ID]
  owner.pastures = [{
    id: 'owner-pasture',
    size: 1,
    tiles: [{ row: 0, col: 2 }],
    stables: 0,
    animalType: null,
    animalCount: 0,
  }]
  const cattleMarket = state.actionSpaces.find((space) => space.id === 'cattle-market')!
  cattleMarket.resources.cattle = 1
  session.loadState(state)
  return session
}

const useCattleMarket = (session: GameSession, playerIndex: number) => {
  let response: SessionResponse = session.takeAction(playerIndex, 'cattle-market')
  for (let step = 0; step < 5; step++) {
    if (response.interaction.stateId !== 'wait') break
    if (response.interaction.request.kind === 'select-trigger') {
      response = resolveTriggerIfPresent(session, response, CARD_ID)
      continue
    }
    if (response.interaction.request.kind !== 'animal-reorg') break
    const cattle = response.state.players[playerIndex]!.resources.cattle
    response = session.resolveChoice(playerIndex, 'confirm', {
      zones: playerIndex === 0
        ? [{ id: 'owner-pasture', zoneType: 'pasture', animalType: 'cattle', animalCount: cattle }]
        : [{ id: 'house', zoneType: 'house', animalType: 'cattle', animalCount: cattle }],
    })
  }
  return response
}

describe('C147 Cowherd parity', () => {
  it('C147 S1: playing Cowherd through Lessons keeps the occupation in play', () => {
    const response = setup(0, false).takeAction(0, 'lessons')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('C147 S2: the owner using Cattle Market gains one additional cattle', () => {
    const response = useCattleMarket(setup(0), 0)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.cattle).toBe(2)
    expect(response.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'cattle', animalCount: 2 })
  })

  it('C147 S3: another player using Cattle Market gains no cattle for the owner', () => {
    const response = useCattleMarket(setup(1), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.cattle).toBe(0)
    expect(response.state.players[1]!.resources.cattle).toBe(1)
  })

  it('C147 S4: the owner using another action gains no cattle', () => {
    const response = setup(0).takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.cattle).toBe(0)
  })
})
