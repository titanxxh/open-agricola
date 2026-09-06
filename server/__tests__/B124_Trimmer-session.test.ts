import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { isCardFlagged, readCardExtraData } from '../../shared/cards/helpers/card-state'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B124_Trimmer'

const CARD_ID = 'B124_Trimmer'
const FILLER = '__test_placeholder__'
const ONE_CELL = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
const TWO_CELL_OUTER = ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2']
const SECOND_CELL = ['H-0-1', 'H-1-1', 'V-0-2']

const pasture = (tiles: Array<{ row: number; col: number }>) => ({
  id: 'pasture-0', size: tiles.length, tiles, stables: 0, animalType: null, animalCount: 0,
})

const setup = ({
  played = true, wood = 4, edges = [] as string[], tiles = [] as Array<{ row: number; col: number }>,
} = {}) => {
  const session = new GameSession(5124, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  const owner = state.players[0]!
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.resources = { ...owner.resources, wood, stone: 0 }
  owner.fenceSegments = edges.map((edge) => ({ edge, type: 'fence' as const }))
  owner.pastures = tiles.length > 0 ? [pasture(tiles)] : []
  if (played) {
    owner.cardStates[CARD_ID] = {
      extraData: { pastureArea: tiles.length },
      flagged: false,
    }
  }
  session.loadState(state)
  return session
}

const chooseCard = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  return option ? session.resolveChoice(response.interaction.playerIndex, option.value) : response
}

const fence = (session: GameSession, edges: string[]) => {
  let response = session.takeAction(0, 'fencing')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId, JSON.stringify(response.interaction)).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.kind, JSON.stringify(response.interaction)).toBe('farm-select')
  response = session.commitSelectionChoice(0, { edges, palisadeEdges: [], extraWood: 0 })
  expect(response.ok, response.error).toBe(true)
  return response
}

describe('B124 Trimmer parity', () => {
  it('B124 S1: playing Trimmer during work records the already enclosed pasture area', () => {
    const session = setup({
      played: false, wood: 0, edges: ONE_CELL, tiles: [{ row: 0, col: 0 }],
    })

    const response = chooseCard(session, session.takeAction(0, 'lessons'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'pastureArea')).toBe(1)
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(false)
  })

  it('B124 S2: enclosing a new farmyard space during work gains two stone', () => {
    const response = fence(setup(), ONE_CELL)

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 2 })
    expect(response.state.players[0]!.pastures[0]?.tiles).toHaveLength(1)
    expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'pastureArea')).toBe(1)
  })

  it('B124 S3: subdividing an existing two-space pasture grants no stone', () => {
    const response = fence(setup({
      wood: 4, edges: TWO_CELL_OUTER, tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
    }), ['V-0-1'])

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, stone: 0 })
    expect(response.state.players[0]!.pastures).toHaveLength(2)
    expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'pastureArea')).toBe(2)
  })

  it('B124 S4: a new work phase can reward Trimmer again for newly enclosed area', () => {
    const session = setup({ wood: 8 })
    let response = fence(session, ONE_CELL)
    expect(response.state.players[0]!.resources.stone).toBe(2)

    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
    })
    session.loadState(state)
    response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(6)
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(false)

    response = fence(session, SECOND_CELL)

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, stone: 4 })
    expect(response.state.players[0]!.pastures.flatMap((entry) => entry.tiles)).toHaveLength(2)
    expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'pastureArea')).toBe(2)
  })
})
