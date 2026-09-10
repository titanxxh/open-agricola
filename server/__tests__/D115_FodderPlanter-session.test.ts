import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/D/D115_FodderPlanter'

const CARD_ID = 'D115_FodderPlanter'

const FILLER = '__test_placeholder__'

const setup = ({ played = true, species = ['sheep'], grain = 2 } = {}) => {
  const session = new GameSession(6115, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 4
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.pastures = []
    player.fields = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  player.resources.grain = grain
  player.fields = [
    { row: 0, col: 0, stacks: [] },
    { row: 0, col: 1, stacks: [] },
  ]
  species.forEach((animalType, index) => {
    const type = animalType as 'sheep' | 'boar'
    player.resources[type] = 2
    player.pastures.push({
      id: type, animalType: type, animalCount: 2, size: 2, stables: 1,
      tiles: [{ row: 1, col: index * 2 }, { row: 1, col: index * 2 + 1 }],
    })
  })
  if (!played) {
    state.round = 14
    state.roundPhase = 'work'
    state.actionSpaces.find((space) => space.id === '__test-worker-sink__')!.takenBy = []
    state.players.forEach((candidate) => setWorkersAtHome(state, candidate, 2))
  }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait') {
    const card = options(response).find((option) => option.value === CARD_ID)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  return response
}

const arrange = (session: GameSession, keptSpecies: string[]) => {
  const player = session.getState().state.players[0]!
  return session.resolveChoice(0, 'confirm', keptSpecies.map((animalType) => ({
    id: animalType, zoneType: 'pasture', animalType,
    animalCount: player.resources[animalType as 'sheep' | 'boar'],
  })))
}

const enterSow = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({
    stateId: 'wait', promptKey: 'ui.interactionFodderPlanterSow',
  })
  if (response.interaction.stateId !== 'wait') return response
  const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
  expect(accept).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, accept!.value)
}

describe('D115 Fodder Planter parity', () => {
  it('D115 S1: Fodder Planter is played as the first occupation', () => {
    const response = playOccupation(setup({ played: false, species: [] }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('D115 S2: two kept newborn animal types allow sowing exactly two fields', () => {
    const session = setup({ species: ['sheep', 'boar'] })
    session.performRoundEnd()
    let response = enterSow(session, arrange(session, ['sheep', 'boar']))
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { farm: { farmType: 'sow', maxSelections: 2 } },
    })

    response = session.commitSelectionChoice(0, { crops: [
      { row: 0, col: 0, crop: 'grain' },
      { row: 0, col: 1, crop: 'grain' },
    ] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.fields.map((field) => field.stacks)).toEqual([
      [{ kind: 'grain', remaining: 3 }], [{ kind: 'grain', remaining: 3 }],
    ])
  })

  it('D115 S3: one kept newborn limits sowing to one field', () => {
    const session = setup()
    session.performRoundEnd()
    let response = enterSow(session, arrange(session, ['sheep']))
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { farm: { farmType: 'sow', maxSelections: 1 } },
    })

    response = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[0]!.fields[1]!.stacks).toEqual([])
  })

  it('D115 S4: the newborn-based sow may be declined', () => {
    const session = setup()
    session.performRoundEnd()
    const offered = arrange(session, ['sheep'])
    expect(offered.interaction).toMatchObject({
      stateId: 'wait', promptKey: 'ui.interactionFodderPlanterSow',
    })

    const response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(2)
    expect(response.state.players[0]!.fields.every((field) => field.stacks.length === 0)).toBe(true)
  })

  it('D115 S5: a discarded newborn gives no Fodder Planter sow', () => {
    const session = setup()
    session.performRoundEnd()

    const response = arrange(session, [])

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.resources.grain).toBe(2)
    expect(response.state.players[0]!.fields.every((field) => field.stacks.length === 0)).toBe(true)
  })
})
