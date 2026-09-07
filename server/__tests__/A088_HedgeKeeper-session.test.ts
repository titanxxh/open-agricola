import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getOwnOrdinaryFenceReserveCount } from '../../shared/domain/supply-tokens'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A088_HedgeKeeper'

const CARD_ID = 'A088_HedgeKeeper'
const FILLER = '__test_placeholder__'
const ONE_CELL = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']
const TWO_CELL = [
  'H-0-1', 'H-0-2', 'H-1-1', 'H-1-2', 'V-0-1', 'V-0-3',
]

const setup = ({ wood = 0, played = true, existingFence = false } = {}) => {
  const session = new GameSession(5088, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 0
    player.resources.wood = 0
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.wood = wood
  if (existingFence) {
    owner.fenceSegments = [{
      edge: ONE_CELL[0]!, type: 'fence', source: { kind: 'own', ownerPlayerId: owner.id },
    }]
  }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: string) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const buildFences = (session: GameSession, edges: string[]) => {
  const pending = session.takeAction(0, 'fencing')
  expect(pending.ok, pending.error).toBe(true)
  expect(pending.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'fence' } },
  })
  return session.commitSelectionChoice(0, { edges, palisadeEdges: [], extraWood: 0 })
}

describe('A088 Hedge Keeper session', () => {
  it('A088 S1: Hedge Keeper is played as the first occupation without paying food', () => {
    const response = playOccupation(setup({ played: false }), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A088 S2: completes an existing edge with three free fences and no wood', () => {
    const session = setup({ existingFence: true })
    expect(session.getActionAvailability(0).fencing).toBe(true)
    const response = buildFences(session, ONE_CELL)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.pastures).toHaveLength(1)
    expect(getOwnOrdinaryFenceReserveCount(response.state.players[0]!)).toBe(11)
  })

  it('A088 S3: building four fences with Hedge Keeper costs one wood', () => {
    const session = setup({ wood: 1 })
    const response = buildFences(session, ONE_CELL)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
  })

  it('A088 S4: building six fences with Hedge Keeper costs three wood', () => {
    const session = setup({ wood: 3 })
    const response = buildFences(session, TWO_CELL)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(6)
  })

  it('A088 S5: the three-fence discount does not make six fences affordable with only two wood', () => {
    const session = setup({ wood: 2 })
    const response = buildFences(session, TWO_CELL)

    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.resources.wood).toBe(2)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
  })

})
