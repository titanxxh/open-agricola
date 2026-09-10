import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { AnimalType } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/A/A168_AnimalTeacher'
import '../../shared/cards/A/A116_WoodCutter'

const CARD_ID = 'A168_AnimalTeacher'

const OCCUPATION = 'A116_WoodCutter'

const FILLER = '__test_placeholder__'

const setup = ({ played = true, food = 2 } = {}) => {
  const session = new GameSession(6168, undefined, { playerCount: 4 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.stableAnimals = {}
    player.pastures = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [OCCUPATION] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.food = food
  owner.pastures = [{
    id: 'animal-teacher-pasture', size: 1, tiles: [{ row: 0, col: 1 }], stables: 0,
    animalType: null, animalCount: 0,
  }]
  session.loadState(state)
  return session
}

const playCardFromLessons = (
  session: GameSession, spaceId: 'lessons' | 'lessons-4', cardId: string,
) => {
  const response = session.takeAction(0, spaceId)
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === cardId)
  expect(card, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const enterAnimalChoices = (session: GameSession, initial: SessionResponse) => {
  let response = resolveTriggerIfPresent(session, initial, CARD_ID)
  for (let step = 0; step < 4; step += 1) {
    if (response.interaction.stateId !== 'wait') return response
    const options = response.interaction.request.options ?? []
    if (options.some((option) => {
      const gained = option.effectPreview?.resourcesGained
      return gained?.sheep || gained?.boar || gained?.cattle
    })) return response
    const enter = options.find((option) =>
      option.value !== '__skip__' && option.sourceCard === CARD_ID)
      ?? options.find((option) => option.value !== '__skip__')
    if (!enter) return response
    response = session.resolveChoice(response.interaction.playerIndex, enter.value)
  }
  return response
}

const chooseAnimal = (
  session: GameSession, initial: SessionResponse, animal: AnimalType,
) => {
  let response = enterAnimalChoices(session, initial)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) =>
    candidate.effectPreview?.resourcesGained?.[animal] === 1)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'animal-reorg') {
    response = session.resolveChoice(response.interaction.playerIndex, 'confirm', {
      zones: [{
        id: 'animal-teacher-pasture', zoneType: 'pasture', animalType: animal, animalCount: 1,
      }],
    })
  }
  return response
}

const useLessons = (session: GameSession, spaceId: 'lessons' | 'lessons-4' = 'lessons') =>
  playCardFromLessons(session, spaceId, OCCUPATION)

describe('A168 Animal Teacher parity', () => {
  it('A168 S1: Animal Teacher is played as the first occupation in a four-player game', () => {
    const response = playCardFromLessons(setup({ played: false, food: 0 }), 'lessons', CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A168 S2: after Lessons its owner may take one sheep for no food', () => {
    const session = setup({ food: 2 })
    const response = chooseAnimal(session, useLessons(session), 'sheep')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, sheep: 1 })
    expect(response.state.players[0]!.pastures[0]).toMatchObject({
      animalType: 'sheep', animalCount: 1,
    })
  })

  it('A168 S3: after Lessons its owner may pay one food for one boar', () => {
    const session = setup({ food: 2 })
    const response = chooseAnimal(session, useLessons(session), 'boar')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, boar: 1 })
  })

  it('A168 S4: after Lessons its owner may pay two food for one cattle', () => {
    const session = setup({ food: 3 })
    const response = chooseAnimal(session, useLessons(session), 'cattle')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, cattle: 1 })
  })

  it('A168 S5: the Animal Teacher purchase may be declined', () => {
    const session = setup({ food: 3 })
    let response = enterAnimalChoices(session, useLessons(session))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 2, sheep: 0, boar: 0, cattle: 0,
    })
  })

  it('A168 S6: with no food after paying for Lessons only sheep remains affordable', () => {
    const session = setup({ food: 1 })
    const response = enterAnimalChoices(session, useLessons(session))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const animals = response.interaction.request.options?.filter((option) =>
      option.value !== '__skip__' && !option.disabled) ?? []

    expect(animals).toHaveLength(1)
    expect(animals[0]!.effectPreview?.resourcesGained).toMatchObject({ sheep: 1 })
  })

  it('A168 S7: Lessons4 also triggers Animal Teacher while a non-Lessons action does not', () => {
    const lessons4Session = setup({ food: 3 })
    const lessons4 = chooseAnimal(lessons4Session, useLessons(lessons4Session, 'lessons-4'), 'sheep')
    expect(lessons4.state.players[0]!.resources).toMatchObject({ food: 2, sheep: 1 })

    const nonTarget = setup({ food: 0 }).takeAction(0, 'day-laborer')
    expect(nonTarget.state.players[0]!.resources).toMatchObject({ food: 2, sheep: 0 })
    expect(nonTarget.interaction.stateId === 'wait' ? nonTarget.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })
})
