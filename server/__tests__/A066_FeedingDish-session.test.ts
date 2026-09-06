import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A066_FeedingDish'

const CARD_ID = 'A066_FeedingDish'
const FILLER = '__test_placeholder__'
type Animal = 'sheep' | 'boar' | 'cattle'

const MARKETS: Array<{ spaceId: string; animal: Animal }> = [
  { spaceId: 'sheep-market', animal: 'sheep' },
  { spaceId: 'pig-market', animal: 'boar' },
  { spaceId: 'cattle-market', animal: 'cattle' },
]

const setupPurchase = () => {
  const session = new GameSession(5066, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.occupationHand = [FILLER]
  player.resources.wood = 1
  const opponent = state.players[1]!
  setWorkersAtHome(state, opponent, 2)
  opponent.minorHand = [FILLER]
  opponent.occupationHand = [FILLER]
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  const enter = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (enter) response = session.resolveChoice(0, enter.value)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

const setupAction = ({
  spaceId,
  animal,
  ownedAnimal,
}: {
  spaceId: string
  animal?: Animal
  ownedAnimal?: Animal
}) => {
  const session = new GameSession(6066, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed = [CARD_ID]
  player.minorHand = [FILLER]
  player.occupationHand = [FILLER]
  player.resources.grain = 0
  player.resources.sheep = ownedAnimal === 'sheep' ? 1 : 0
  player.resources.boar = ownedAnimal === 'boar' ? 1 : 0
  player.resources.cattle = ownedAnimal === 'cattle' ? 1 : 0
  player.houseAnimalType = null
  player.houseAnimalCount = 0
  player.stableAnimals = {}
  player.pastures = ownedAnimal ? [{
    id: 'feeding-dish-pasture',
    size: 2,
    tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
    stables: 0,
    animalType: ownedAnimal,
    animalCount: 1,
  }] : []
  const opponent = state.players[1]!
  setWorkersAtHome(state, opponent, 2)
  opponent.minorHand = [FILLER]
  opponent.occupationHand = [FILLER]
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
  if (!space) throw new Error(`missing action space ${spaceId}`)
  space.takenBy = []
  if (animal) space.resources[animal] = 1
  session.loadState(state)
  return session
}

const useSpace = (session: GameSession, spaceId: string, animal?: Animal): SessionResponse => {
  let response = session.takeAction(0, spaceId)
  expect(response.ok, response.error).toBe(true)
  for (let step = 0; step < 6 && response.interaction.stateId === 'wait'; step++) {
    if (response.interaction.request.kind === 'select-trigger') {
      response = resolveTriggerIfPresent(session, response, CARD_ID)
      continue
    }
    if (response.interaction.request.kind !== 'animal-reorg' || !animal) break
    const player = response.state.players[0]!
    const samePasture = player.pastures.find((pasture) => pasture.animalType === animal)
    const count = player.resources[animal]
    response = session.resolveChoice(0, 'confirm', {
      zones: samePasture
        ? [{ id: samePasture.id, zoneType: 'pasture', animalType: animal, animalCount: count }]
        : [{ id: 'house', zoneType: 'house', animalType: animal, animalCount: count }],
    })
  }
  return response
}

describe('A066 Feeding Dish parity', () => {
  it('A066 S1: paying one wood plays Feeding Dish', () => {
    const response = playMinor(setupPurchase())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A066 S2: every animal market grants one grain when its animal was already owned', () => {
    MARKETS.forEach((entry) => {
      const response = useSpace(setupAction({ ...entry, ownedAnimal: entry.animal }), entry.spaceId, entry.animal)

      expect(response.state.players[0]!.resources.grain, entry.spaceId).toBe(1)
    })
  })

  it('A066 S3: characterize every animal market when its animal was not already owned', () => {
    MARKETS.forEach((entry) => {
      const response = useSpace(setupAction(entry), entry.spaceId, entry.animal)

      expect(response.state.players[0]!.resources.grain, entry.spaceId).toBe(1)
    })
  })

  it('A066 S4: characterize an animal market when only a different animal was owned', () => {
    const response = useSpace(setupAction({
      spaceId: 'pig-market',
      animal: 'boar',
      ownedAnimal: 'sheep',
    }), 'pig-market', 'boar')

    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('A066 S5: a non-animal accumulation space does not trigger Feeding Dish', () => {
    const response = useSpace(setupAction({ spaceId: 'forest' }), 'forest')

    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.resources.wood).toBeGreaterThan(0)
  })
})
