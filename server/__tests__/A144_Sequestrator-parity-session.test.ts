import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getStoredResource, setStoredResource } from '../../shared/cards/helpers/card-storage'

import '../../shared/cards/A/A144_Sequestrator'

const CARD_ID = 'A144_Sequestrator'
const FILLER = '__test_placeholder__'
const THREE_PASTURES = [
  'H-0-2', 'H-1-2', 'V-0-2', 'V-0-3',
  'H-2-2', 'V-1-2', 'V-1-3',
  'H-3-2', 'V-2-2', 'V-2-3',
]
const TWO_PASTURES = THREE_PASTURES.slice(0, 7)

const setup = ({ played = true, actor = 0 } = {}) => {
  const session = new GameSession(7144, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.fields = []
    player.pastures = []
    player.fenceSegments = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  if (played) {
    setStoredResource(owner, CARD_ID, 'reed', 3)
    setStoredResource(owner, CARD_ID, 'clay', 4)
  }
  session.loadState(state)
  return session
}

const chooseCard = (session: GameSession, response: SessionResponse, cardId: string) => {
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

describe('A144 Sequestrator parity', () => {
  it('A144 S1: playing Sequestrator stores three reed and four clay', () => {
    const session = setup({ played: false })
    const response = chooseCard(session, session.takeAction(0, 'lessons'), CARD_ID)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(getStoredResource(response.state.players[0]!, CARD_ID, 'reed')).toBe(3)
    expect(getStoredResource(response.state.players[0]!, CARD_ID, 'clay')).toBe(4)
  })

  it('A144 S2: the next player to reach five fields by plowing receives all four clay', () => {
    const session = setup({ actor: 1 })
    const state = session.getState().state
    const actor = state.players[1]!
    actor.fields = Array.from({ length: 4 }, (_, col) => ({ row: 0, col, crop: null, remaining: 0 }))
    session.loadState(state)
    let response = session.takeAction(1, 'farmland')
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
    })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return
    response = session.commitSelectionChoice(1, { tile: response.interaction.request.farm.selectableTiles[0]! })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.fields).toHaveLength(5)
    expect(response.state.players[1]!.resources.clay).toBe(4)
    expect(getStoredResource(response.state.players[0]!, CARD_ID, 'clay')).toBe(0)
    expect(getStoredResource(response.state.players[0]!, CARD_ID, 'reed')).toBe(3)
  })

  it('A144 S3: the next player to reach three pastures by fencing receives all three reed', () => {
    const session = setup({ actor: 1 })
    const state = session.getState().state
    const actor = state.players[1]!
    actor.resources.wood = 3
    actor.fenceSegments = TWO_PASTURES.map((edge) => ({
      edge, type: 'fence' as const, source: { kind: 'own' as const, ownerPlayerId: actor.id },
    }))
    session.loadState(state)
    const pending = session.takeAction(1, 'fencing')
    expect(pending.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'fence' } },
    })
    const response = session.commitSelectionChoice(1, {
      edges: THREE_PASTURES, palisadeEdges: [], extraWood: 0,
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.pastures).toHaveLength(3)
    expect(response.state.players[1]!.resources.reed).toBe(3)
    expect(getStoredResource(response.state.players[0]!, CARD_ID, 'reed')).toBe(0)
  })

  it('A144 S4: existing five fields do not receive stored clay retroactively', () => {
    const session = setup({ played: false })
    const state = session.getState().state
    state.players[0]!.fields = Array.from({ length: 5 }, (_, col) => ({ row: 0, col, crop: null, remaining: 0 }))
    session.loadState(state)
    const response = chooseCard(session, session.takeAction(0, 'lessons'), CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(getStoredResource(response.state.players[0]!, CARD_ID, 'clay')).toBe(4)
  })

  it('A144 S5: an emptied clay store cannot award clay again', () => {
    const session = setup()
    const state = session.getState().state
    const owner = state.players[0]!
    owner.fields = Array.from({ length: 5 }, (_, col) => ({ row: 0, col, crop: null, remaining: 0 }))
    setStoredResource(owner, CARD_ID, 'clay', 0)
    session.loadState(state)
    let response = session.takeAction(0, 'farmland')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return
    response = session.commitSelectionChoice(0, { tile: response.interaction.request.farm.selectableTiles[0]! })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })
})
