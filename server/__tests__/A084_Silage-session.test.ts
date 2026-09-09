import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A084_Silage'

const CARD_ID = 'A084_Silage'
const FILLER = '__test_placeholder__'
type Animal = 'sheep' | 'boar' | 'cattle'

const fixedHands = (session: GameSession) => {
  stabilizeRandomHands(session.state.players)
  session.state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
}

const purchaseSession = (fields: number) => {
  const session = new GameSession(5084, undefined, { playerCount: 2 })
  fixedHands(session)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => setWorkersAtHome(state, player, 2))
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.fields = Array.from({ length: fields }, (_, col) => ({ row: 1, col, stacks: [] }))
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.options?.some((option) => option.value === CARD_ID)) return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

const roundSession = ({
  round = 5,
  reserveGrain = 1,
  fieldGrain = 0,
  sheep = 2,
  boar = 0,
  fields = 2,
}: {
  round?: number
  reserveGrain?: number
  fieldGrain?: number
  sheep?: number
  boar?: number
  fields?: number
} = {}) => {
  const session = new GameSession(6084, undefined, { playerCount: 2 })
  fixedHands(session)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.resources.food = 20
    player.resources.grain = 0
    player.resources.sheep = 0
    player.resources.boar = 0
    player.resources.cattle = 0
  })
  const player = state.players[0]!
  player.minorPlayed = [CARD_ID]
  player.resources.grain = reserveGrain
  player.resources.sheep = sheep
  player.resources.boar = boar
  player.fields = Array.from({ length: fields }, (_, col) => ({
    row: 2,
    col,
    stacks: col === 0 && fieldGrain > 0
      ? [{ kind: 'grain' as const, remaining: fieldGrain }]
      : [],
  }))
  player.pastures = [
    {
      id: 'silage-sheep', size: 1, tiles: [{ row: 1, col: 2 }], stables: 1,
      animalType: sheep > 0 ? 'sheep' : null, animalCount: sheep,
    },
    {
      id: 'silage-boar', size: 1, tiles: [{ row: 1, col: 3 }], stables: 1,
      animalType: boar > 0 ? 'boar' : null, animalCount: boar,
    },
  ]
  player.stableTiles = [{ row: 1, col: 2 }, { row: 1, col: 3 }]
  player.houseAnimalType = null
  player.houseAnimalCount = 0
  player.stableAnimals = {}
  session.loadState(state)
  return session
}

const cardPrompt = (session: GameSession) =>
  resolveTriggerIfPresent(session, session.performRoundEnd(), CARD_ID)

const hasSilageOffer = (response: SessionResponse) =>
  response.interaction.stateId === 'wait'
  && JSON.stringify(response.interaction.request).includes(CARD_ID)

const chooseAnimal = (session: GameSession, response: SessionResponse, animal: Animal) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) =>
    JSON.stringify(candidate).includes(animal))
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const placeAnimals = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    return response
  }
  const player = response.state.players[0]!
  const zones = [
    ...(player.resources.sheep > 0 ? [{
      id: 'silage-sheep', zoneType: 'pasture', animalType: 'sheep', animalCount: player.resources.sheep,
    }] : []),
    ...(player.resources.boar > 0 ? [{
      id: 'silage-boar', zoneType: 'pasture', animalType: 'boar', animalCount: player.resources.boar,
    }] : []),
  ]
  return session.resolveChoice(response.interaction.playerIndex, 'confirm', { zones })
}

describe('A084 Silage parity', () => {
  it('A084 S1: exactly two fields allow playing Silage for no resources', () => {
    const response = playMinor(purchaseSession(2))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('A084 S2: one field keeps Silage unavailable', () => {
    const response = purchaseSession(1).takeAction(0, 'major-improvement')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false
      : false).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('A084 S3: in a non-harvest round reserve grain breeds exactly the selected animal type', () => {
    const session = roundSession({ sheep: 2, boar: 2 })
    let response = chooseAnimal(session, cardPrompt(session), 'boar')
    response = placeAnimals(session, response)

    expect(response.state.players[0]!.resources, JSON.stringify(response.interaction)).toMatchObject({ grain: 0, sheep: 2, boar: 3 })
  })

  it('A084 S4: with no reserve grain, Silage removes one grain from a field and breeds', () => {
    const session = roundSession({ reserveGrain: 0, fieldGrain: 2 })
    let response = chooseAnimal(session, cardPrompt(session), 'sheep')
    response = placeAnimals(session, response)

    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.resources.sheep).toBe(3)
  })

  it('A084 S5: Silage can be declined without paying grain or breeding', () => {
    const session = roundSession()
    const offered = cardPrompt(session)
    expect(offered.interaction.stateId).toBe('wait')
    if (offered.interaction.stateId !== 'wait') return
    expect(offered.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)
    const response = session.resolveChoice(offered.interaction.playerIndex, '__skip__')

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, sheep: 2 })
  })

  it('A084 S6: Silage is not offered in a harvest round', () => {
    const session = roundSession({ round: 4 })
    const response = session.performRoundEnd()

    expect(hasSilageOffer(response)).toBe(false)
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('A084 S7: no grain in reserve or fields leaves no Silage offer', () => {
    const session = roundSession({ reserveGrain: 0, fieldGrain: 0 })
    const response = session.performRoundEnd()

    expect(hasSilageOffer(response)).toBe(false)
    expect(response.state.players[0]!.resources.sheep).toBe(2)
  })

  it('A084 S8: fewer than two animals of every type leaves no Silage offer', () => {
    const session = roundSession({ sheep: 1 })
    const response = session.performRoundEnd()

    expect(hasSilageOffer(response)).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, sheep: 1 })
  })

  it('A084 S9: characterize a played Silage after the farm drops below two fields', () => {
    const session = roundSession({ fields: 1 })
    const response = session.performRoundEnd()

    expect(hasSilageOffer(response)).toBe(false)
  })

  it('restores and undoes a chosen field payment', () => {
    const session = roundSession({ reserveGrain: 1, fieldGrain: 2 })
    const pending = chooseAnimal(session, cardPrompt(session), 'sheep')
    const option = pending.interaction.request.options?.find((candidate) => candidate.value.startsWith('farmyard:'))
    expect(option).toBeDefined()
    const snapshot = serializeSessionSnapshot(session.state, session)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    const paid = restored.resolveChoice(0, option!.value)
    expect(paid.ok, paid.error).toBe(true)
    expect(paid.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(paid.state.players[0]!.resources.grain).toBe(1)
    const undone = restored.undoStep(0)
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(2)
    expect(undone.state.players[0]!.resources.sheep).toBe(2)
  })

  it.each(['reserve', 'farmyard:2:2', 'farmyard:2:3'])('A084 S10: chooses grain from %s when several sources exist', (source) => {
    const session = roundSession({ reserveGrain: 1, fieldGrain: 2 })
    session.state.players[0]!.fields = [2, 3].map((col) => ({ row: 2, col, stacks: [{ kind: 'grain', remaining: 2 }] }))
    session.loadState(session.state)
    const offered = chooseAnimal(session, cardPrompt(session), 'sheep')
    expect(offered.interaction.stateId).toBe('wait')
    expect(offered.interaction.request.options?.map((option) => option.value))
      .toEqual(['reserve', 'farmyard:2:2', 'farmyard:2:3'])

    let response = session.resolveChoice(0, source)
    response = placeAnimals(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(source === 'reserve' ? 0 : 1)
    expect(response.state.players[0]!.fields.map((field) => field.stacks[0]!.remaining))
      .toEqual([source === 'farmyard:2:2' ? 1 : 2, source === 'farmyard:2:3' ? 1 : 2])
    expect(response.state.players[0]!.resources.sheep).toBe(3)
  })
})
