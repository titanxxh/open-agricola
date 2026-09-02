import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B122_Mineralogist'

const CARD_ID = 'B122_Mineralogist'

const setup = (inHand = false) => {
  const session = new GameSession(122, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  player.occupationPlayed = inHand ? [] : [CARD_ID]
  player.resources = { ...player.resources, clay: 0, stone: 0, grain: 0 }
  state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 2
  state.actionSpaces.find((space) => space.id === 'western-quarry')!.resources.stone = 2
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait') {
    const option = response.interaction.request.options?.find((entry) => entry.value === CARD_ID)
    if (option) response = session.resolveChoice(0, option.value)
  }
  return response
}

describe('B122 Mineralogist parity', () => {
  it('B122 S1: playing Mineralogist through Lessons keeps the occupation in play', () => {
    const response = playOccupation(setup(true))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B122 S2: Clay Pit grants its clay and one stone', () => {
    const response = setup().takeAction(0, 'clay-pit')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, stone: 1 })
  })

  it('B122 S3: Western Quarry grants its stone and one clay', () => {
    const response = setup().takeAction(0, 'western-quarry')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 2, clay: 1 })
  })

  it('B122 S4: a non-clay and non-stone space grants no opposite resource', () => {
    const response = setup().takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, clay: 0, stone: 0 })
  })
})
