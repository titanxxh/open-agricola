import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A148_Woolgrower'
import '../../shared/cards/A/A151_Minstrel'
import '../../shared/cards/A/A152_NightSchoolStudent'

const FILLER = '__test_placeholder__'

const setup = (cardId: string, played = true) => {
  const session = new GameSession(7151, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [cardId]
  owner.occupationPlayed = played ? [cardId] : []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: string) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

describe('A148 Woolgrower parity', () => {
  it('A148 S1: Woolgrower can be played as the first occupation in a four-player game', () => {
    expect(playOccupation(setup('A148_Woolgrower', false), 'A148_Woolgrower')
      .state.players[0]!.occupationPlayed).toContain('A148_Woolgrower')
  })

  it('A148 S2: two completed feeding phases allow exactly two sheep on Woolgrower', () => {
    const session = setup('A148_Woolgrower')
    const state = session.getState().state
    state.completedFeedingPhases = 2
    state.players[0]!.resources.sheep = 3
    session.loadState(state)
    let response = session.takeAction(0, 'day-laborer')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') return
    expect(response.interaction.request.zones).toContainEqual(expect.objectContaining({
      id: 'card:A148_Woolgrower', cardId: 'A148_Woolgrower', animalType: 'sheep', capacity: 2,
    }))
    response = session.resolveChoice(0, 'confirm', [
      { id: 'card:A148_Woolgrower', zoneType: 'card', animalType: 'sheep', animalCount: 2 },
    ] as unknown as Record<string, unknown>)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(2)
  })

  it('A148 S3: before the first feeding phase Woolgrower provides no sheep zone', () => {
    const session = setup('A148_Woolgrower')
    const state = session.getState().state
    state.completedFeedingPhases = 0
    state.players[0]!.resources.sheep = 1
    session.loadState(state)
    const response = session.takeAction(0, 'day-laborer')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') return
    expect(response.interaction.request.zones.some((zone) => zone.id === 'card:A148_Woolgrower')).toBe(false)
  })
})

const placeWorker = (state: GameSession['state'], playerIndex: number, spaceId: string, workerId = '1') => {
  const player = state.players[playerIndex]!
  state.actionSpaces.find((space) => space.id === spaceId)!.takenBy = [{ playerId: player.id, workerId }]
}

const returnHomeSetup = (cardId: string) => {
  const session = setup(cardId)
  const state = session.getState().state
  state.round = 5
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder.splice(0, 4, 'sheep-market', 'grain-utilization', 'fencing', 'major-improvement')
  state.availableMajorImprovements = ['Major_Joinery']
  state.players[0]!.resources = { ...state.players[0]!.resources, wood: 2, stone: 2 }
  state.players[0]!.pastures = [{
    id: 'p1', size: 1, tiles: [{ row: 0, col: 2 }], stables: 0, animalType: null, animalCount: 0,
  }]
  state.players[0]!.occupationHand = ['A116_WoodCutter']
  return { session, state }
}

const endRound = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session.performRoundEnd()
}

describe('A151 Minstrel parity', () => {
  it('A151 S1: Minstrel can be played as the first occupation in a four-player game', () => {
    expect(playOccupation(setup('A151_Minstrel', false), 'A151_Minstrel')
      .state.players[0]!.occupationPlayed).toContain('A151_Minstrel')
  })

  it('A151 S2: Minstrel offers the only legal vacant stage-one space', () => {
    const { session, state } = returnHomeSetup('A151_Minstrel')
    placeWorker(state, 0, 'fencing', '1')
    placeWorker(state, 1, 'sheep-market', '1')
    placeWorker(state, 2, 'major-improvement', '1')
    state.players[0]!.resources.grain = 1
    state.players[0]!.fields = [{ row: 0, col: 0, crop: null, remaining: 0 }]
    session.loadState(state)
    expect(session.getState().actionAvailability?.['grain-utilization']).toBe(true)
    let response = endRound(session)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'A151_Minstrel' })
    if (response.interaction.stateId !== 'wait') return
    const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const sow = response.interaction.request.options?.find((option) => option.labelKey === 'actions.sow.name')
      expect(sow, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, sow!.value)
    }
    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] })
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
  })

  it('A151 S3: two vacant stage-one spaces offer no Minstrel action', () => {
    const { session, state } = returnHomeSetup('A151_Minstrel')
    placeWorker(state, 0, 'fencing', '1')
    placeWorker(state, 1, 'grain-utilization', '1')
    session.loadState(state)
    const response = endRound(session)
    expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== 'A151_Minstrel').toBe(true)
  })
})

const resolveOccupation = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait') return response
  const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
  if (accept) response = session.resolveChoice(response.interaction.playerIndex, accept.value)
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === 'A116_WoodCutter')
  return card ? session.resolveChoice(response.interaction.playerIndex, card.value) : response
}

describe('A152 Night-School Student parity', () => {
  it('A152 S1: Night-School Student can be played as the first occupation in a four-player game', () => {
    expect(playOccupation(setup('A152_NightSchoolStudent', false), 'A152_NightSchoolStudent')
      .state.players[0]!.occupationPlayed).toContain('A152_NightSchoolStudent')
  })

  it('A152 S2: with no person returning from Lessons one food plays an occupation', () => {
    const { session, state } = returnHomeSetup('A152_NightSchoolStudent')
    state.players[0]!.resources.food = 20
    session.loadState(state)
    const response = resolveOccupation(session, endRound(session))
    expect(response.state.players[0]!.occupationPlayed).toContain('A116_WoodCutter')
    expect(response.state.players[0]!.resources.food).toBe(19)
  })

  it('A152 S3: a person returning from Lessons suppresses Night-School Student', () => {
    const { session, state } = returnHomeSetup('A152_NightSchoolStudent')
    placeWorker(state, 1, 'lessons', '1')
    session.loadState(state)
    const response = endRound(session)
    expect(response.state.players[0]!.occupationHand).toContain('A116_WoodCutter')
    expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== 'A152_NightSchoolStudent').toBe(true)
  })
})
