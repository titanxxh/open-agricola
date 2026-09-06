import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

import '../../shared/cards/A/A104_WoodHarvester'

const CARD_ID = 'A104_WoodHarvester'
const FILLER = '__test_placeholder__'

const setup = ({ played = true, spaceWood = {} as Record<string, number> } = {}) => {
  const session = new GameSession(5104, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = played ? 4 : 1
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = played ? 20 : 0
    player.resources.wood = 0
    if (played) markAllWorkersUsed(state, player)
    else setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  state.actionSpaces.forEach((space) => {
    space.resources.wood = spaceWood[space.id] ?? 0
  })
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

describe('A104 Wood Harvester parity', () => {
  it('A104 S1: Wood Harvester is played as the first occupation without paying food', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A104 S2: each qualifying wood accumulation space grants its threshold reward at harvest', () => {
    const response = autoAdvanceRoundEnd(setup({ spaceWood: { forest: 2, grove: 3, copse: 4 } }))

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 18 })
  })

  it('A104 S3: wood accumulation spaces below two wood grant nothing', () => {
    const response = autoAdvanceRoundEnd(setup({ spaceWood: { forest: 1, grove: 0, copse: 1 } }))

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 16 })
  })

  it('A104 S4: OA counts wood sitting on a non-wood accumulation space', () => {
    const response = autoAdvanceRoundEnd(setup({ spaceWood: { 'clay-pit': 2 } }))

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 16 })
  })
})
