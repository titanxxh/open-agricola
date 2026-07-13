import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { ActionFlow, GameState, PlayerState, Resource } from '../../shared/contract/types'
import { computeScores } from '../../shared/domain/scoring'

import '../../shared/cards/E/E134_Omnifarmer'

const CARD_ID = 'E134_Omnifarmer'

const emptyResources = (): Resource => ({
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
})

const createPlayer = (id = 'p1'): PlayerState => ({
  id, name: id, color: 'red',
  resources: emptyResources(),
  workers: [
    { id: '1', isActive: true, isNewborn: false },
    { id: '2', isActive: true, isNewborn: false },
    { id: '3', isActive: false, isNewborn: false },
    { id: '4', isActive: false, isNewborn: false },
    { id: '5', isActive: false, isNewborn: false },
  ],
  rooms: 2, houseType: 'wood',
  fields: [], fences: 0,
  roomTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
  stableTiles: [],
  improvements: [], minorHand: [], minorPlayed: [],
  occupationHand: [], occupationPlayed: [],
  houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
  pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 }, startPlayer: false,
  cardStates: {},
}) as PlayerState

const createState = (...players: PlayerState[]): GameState => ({
  round: 14, currentPlayerIndex: 0, players,
  actionSpaces: [], log: [], roundStartSnapshot: null,
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1, availableMajorImprovements: [],
  futureMeeples: [], pendingFutureMeeples: [],
  gameOver: true, workPhaseObtainedResources: {},
}) as GameState

const setStored = (player: PlayerState, stored: string[]): void => {
  player.cardStates ??= {}
  player.cardStates[CARD_ID] = {
    extraData: { storedGoods: stored },
  }
}

const setupEffect = () => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const effect = getCardEffect(CARD_ID)
  expect(effect).toBeDefined()
  return { session, effect: effect! }
}

const optionValues = (flow: ActionFlow | undefined): string[] => {
  expect(flow).toBeDefined()
  const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
  expect(leaf.actionId).toBe('emit-choice')
  return ((leaf.params as { options: Array<{ value: string }> }).options)
    .map((option) => option.value)
    .sort()
}

type SessionResponseLike = {
  state: GameState
  interaction: { stateId: string; playerIndex: number }
}

const addHarvestOutcome = (
  state: GameState,
  player: PlayerState,
  crops: Array<'grain' | 'vegetable'> = [],
  animals: Array<'sheep' | 'boar' | 'cattle'> = [],
) => {
  state.harvestReapSummary = {
    [player.id]: {
      resources: Object.fromEntries(crops.map((crop) => [crop, 1])),
      grainFields: crops.includes('grain') ? 1 : 0,
      vegetableFields: crops.includes('vegetable') ? 1 : 0,
      harvestedCrops: crops.map((crop, index) => ({
        row: 0,
        col: index,
        crop,
        amount: 1,
        sources: ['base'],
      })),
    },
  }
  state.harvestBreedSummary = {
    [player.id]: {
      resources: Object.fromEntries(animals.map((animal) => [animal, 1])),
      animalTypes: animals.length,
      animalCount: animals.length,
    },
  }
}

describe('E134_Omnifarmer session', () => {
  describe('computeBonusScore', () => {
    it.each([
      [[], 0],
      [['grain'], 0],
      [['grain', 'vegetable'], 3],
      [['grain', 'vegetable', 'sheep'], 5],
      [['grain', 'vegetable', 'sheep', 'boar'], 7],
      [['grain', 'vegetable', 'sheep', 'boar', 'cattle'], 9],
    ])('scores stored goods %#', (stored, expected) => {
      const player = createPlayer()
      player.occupationPlayed = [CARD_ID]
      setStored(player, stored)

      const [result] = computeScores(createState(player))
      const bonusCat = result.categories.find(c => c.key === 'cardBonusVp')
      expect(bonusCat?.total ?? 0).toBe(expected)
    })
  })

  describe('onAfterHarvest', () => {
    it('offers crop candidates from current harvest outcome, not live resources', () => {
      const { effect } = setupEffect()
      const player = createPlayer()
      player.occupationPlayed.push(CARD_ID)
      player.resources.vegetable = 5
      setStored(player, [])
      const state = createState(player)
      addHarvestOutcome(state, player, ['grain'])

      expect(optionValues(effect.onAfterHarvest!(state, player))).toEqual(['grain', 'skip'])
    })

    it('offers newborn animal candidates from current harvest outcome', () => {
      const { effect } = setupEffect()
      const player = createPlayer()
      player.occupationPlayed.push(CARD_ID)
      setStored(player, ['grain'])
      const state = createState(player)
      addHarvestOutcome(state, player, [], ['sheep', 'boar'])

      expect(optionValues(effect.onAfterHarvest!(state, player))).toEqual(['boar', 'sheep', 'skip'])
    })

    it('does not offer sheep only because Dollys Mother is played', () => {
      const { effect } = setupEffect()
      const player = createPlayer()
      player.occupationPlayed.push(CARD_ID)
      player.minorPlayed.push('E084_DollysMother')
      player.resources.sheep = 5
      setStored(player, [])
      const state = createState(player)
      addHarvestOutcome(state, player)

      expect(effect.onAfterHarvest!(state, player)).toBeUndefined()
    })
  })

  describe('resolveChoice', () => {
    it('stores a valid current-harvest good and returns a payment flow', () => {
      const { effect } = setupEffect()
      const player = createPlayer()
      player.occupationPlayed.push(CARD_ID)
      player.resources.grain = 1
      setStored(player, [])
      const state = createState(player)
      addHarvestOutcome(state, player, ['grain'])

      const followUp = effect.resolveChoice!(state, player, 'grain', { sourceCard: CARD_ID })

      expect(followUp).toBeDefined()
      expect(player.cardStates?.[CARD_ID]?.extraData).toEqual({ storedGoods: ['grain'] })
    })

    it('rejects forged choices outside current harvest outcome', () => {
      const { effect } = setupEffect()
      const player = createPlayer()
      player.occupationPlayed.push(CARD_ID)
      player.resources.sheep = 1
      setStored(player, [])
      const state = createState(player)
      addHarvestOutcome(state, player, ['grain'])

      const followUp = effect.resolveChoice!(state, player, 'sheep', { sourceCard: CARD_ID })

      expect(followUp).toBeUndefined()
      expect(player.cardStates?.[CARD_ID]?.extraData).toEqual({ storedGoods: [] })
    })

    it('rejects current-harvest goods that are unavailable to pay', () => {
      const { effect } = setupEffect()
      const player = createPlayer()
      player.occupationPlayed.push(CARD_ID)
      player.resources.grain = 0
      setStored(player, [])
      const state = createState(player)
      addHarvestOutcome(state, player, ['grain'])

      const followUp = effect.resolveChoice!(state, player, 'grain', { sourceCard: CARD_ID })

      expect(followUp).toBeUndefined()
      expect(player.cardStates?.[CARD_ID]?.extraData).toEqual({ storedGoods: [] })
    })
  })

  it('keeps summaries through onAfterHarvest pending and cleans them after resolution', () => {
    const { session } = setupEffect()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.grain = 1
    setStored(player, [])
    addHarvestOutcome(state, player, ['grain'])
    session.loadState(state)

    const resp = (session as unknown as { continueAfterHarvestEffects: () => SessionResponseLike }).continueAfterHarvestEffects()

    expect(resp.state.harvestReapSummary).toBeDefined()
    expect(resp.state.harvestBreedSummary).toBeDefined()
    expect(resp.interaction.stateId).toBe('wait')

    const done = session.resolveChoice(resp.interaction.playerIndex, 'skip')

    expect(done.state.harvestReapSummary).toBeUndefined()
    expect(done.state.harvestBreedSummary).toBeUndefined()
  })
})
