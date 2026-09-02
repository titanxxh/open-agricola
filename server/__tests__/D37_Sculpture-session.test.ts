import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getAllTilePositions, positionKey } from '../../shared/domain/farm'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/D/D037_Sculpture'

const CARD_ID = 'D037_Sculpture'

const setup = ({ round, unused, stone }: { round: number; unused: number; stone: number }) => {
  const session = new GameSession(1)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.occupationHand = ['__test_placeholder__']
  player.resources.stone = stone
  const occupied = new Set(player.roomTiles.map(positionKey))
  player.fields = getAllTilePositions()
    .filter((tile) => !occupied.has(positionKey(tile)))
    .slice(0, 13 - unused)
    .map((tile) => ({ ...tile, stacks: [] }))
  const improvement = state.actionSpaces.find((space) => space.id === 'major-improvement')
  if (!improvement) throw new Error('major-improvement missing')
  improvement.takenBy = []
  session.loadState(state)
  return session
}

const enterImprovementChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const action = response.interaction.request.options?.find((candidate) => {
    return candidate.value.startsWith('action-improvement-')
  })
  if (action) response = session.resolveChoice(0, action.value)
  return response
}

const cardOption = (session: GameSession) => {
  const response = enterImprovementChoice(session)
  if (response.interaction.stateId !== 'wait') return { response, option: undefined }
  return {
    response,
    option: response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID),
  }
}

describe('D037 Sculpture parity', () => {
  it('D037 S1: two rounds left and one unused farm space allow Sculpture for one stone', () => {
    const session = setup({ round: 12, unused: 1, stone: 1 })
    const { response: offered, option } = cardOption(session)

    const response = option ? session.resolveChoice(0, option.value) : offered

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.stone).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('D037 S2: equality between rounds left and unused spaces keeps Sculpture unavailable', () => {
    const { response, option } = cardOption(setup({ round: 12, unused: 2, stone: 1 }))
    expect(option).toBeUndefined()
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('D037 S3: more unused spaces than rounds left keeps Sculpture unavailable', () => {
    const { response, option } = cardOption(setup({ round: 2, unused: 13, stone: 1 }))
    expect(option).toBeUndefined()
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('D037 S4: no stone keeps an otherwise legal Sculpture unavailable', () => {
    const { response, option } = cardOption(setup({ round: 12, unused: 1, stone: 0 }))
    expect(option).toBeUndefined()
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })
})
