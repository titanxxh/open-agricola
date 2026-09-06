import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E042_WaterGully'

const CARD_ID = 'E042_WaterGully'
const FILLER = '__test_placeholder__'

const setup = ({
  well = true, stone = 1, round = 5, pasture = false,
} = {}) => {
  const session = new GameSession(7042, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.pastures = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: index === 0 ? stone : 0, food: 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const owner = state.players[0]!
  owner.minorHand = [CARD_ID, FILLER]
  owner.improvements = well ? ['Major_Well'] : []
  if (pasture) {
    owner.pastures = [{
      id: 'water-gully-pasture',
      size: 2,
      tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
      stables: 0,
      animalType: null,
      animalCount: 0,
    }]
  }
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!response.interaction.request.options?.some((option) => option.value === CARD_ID)) {
    const branch = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false)

const schedule = (response: SessionResponse) => response.state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID)
  .map((entry) => ({
    round: entry.round,
    resource: (entry.resources.cattle ?? 0) > 0 ? 'cattle' : 'grain',
  }))
  .sort((left, right) => left.round - right.round)

const finishRound = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  session.loadState(state)
  return session.performRoundEnd()
}

const placeCattle = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    return response
  }
  const zone = response.interaction.request.zones
    .find((candidate) => candidate.id === 'water-gully-pasture')
  expect(zone).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, 'confirm', {
    zones: [{
      ...zone!, animalType: 'cattle',
      animalCount: response.state.players[0]!.resources.cattle,
    }],
  })
}

describe('E042 Water Gully parity', () => {
  it('E042 S1: owning the Major Well and paying one stone plays Water Gully and schedules cattle, grain, cattle', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.stone).toBe(0)
    expect(schedule(response)).toEqual([
      { round: 6, resource: 'cattle' },
      { round: 7, resource: 'grain' },
      { round: 8, resource: 'cattle' },
    ])
  })

  it('E042 S2: without the Major Well Water Gully is unavailable and pays no stone', () => {
    const response = enterMinor(setup({ well: false }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.stone).toBe(1)
    expect(schedule(response)).toEqual([])
  })

  it('E042 S3: without one stone an otherwise eligible Water Gully is unavailable', () => {
    const response = enterMinor(setup({ stone: 0 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(schedule(response)).toEqual([])
  })

  it('E042 S4: a round-twelve play keeps only cattle then grain within round fourteen', () => {
    const response = play(setup({ round: 12 }))

    expect(schedule(response)).toEqual([
      { round: 13, resource: 'cattle' },
      { round: 14, resource: 'grain' },
    ])
  })

  it('E042 S5: a round-thirteen play keeps only the first cattle within round fourteen', () => {
    const response = play(setup({ round: 13 }))

    expect(schedule(response)).toEqual([{ round: 14, resource: 'cattle' }])
  })

  it('E042 S6: a round-fourteen play succeeds but schedules no future goods', () => {
    const response = play(setup({ round: 14 }))

    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(schedule(response)).toEqual([])
  })

  it('E042 S7: the three scheduled goods are received in cattle, grain, cattle order', () => {
    const session = setup({ round: 1, pasture: true })
    play(session)

    let response = placeCattle(session, finishRound(session))
    expect(response.state.round).toBe(2)
    expect(response.state.players[0]!.resources).toMatchObject({ cattle: 1, grain: 0 })

    response = finishRound(session)
    expect(response.state.round).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ cattle: 1, grain: 1 })

    response = placeCattle(session, finishRound(session))
    expect(response.state.round).toBe(4)
    expect(response.state.players[0]!.resources).toMatchObject({ cattle: 2, grain: 1 })
    expect(schedule(response)).toEqual([])
  })
})
