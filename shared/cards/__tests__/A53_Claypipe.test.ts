import { describe, expect, it } from 'vitest'

import type { ActionSpace, GameState, PlayerState } from '../../game/types'
import { gainAction } from '../../actions/effects/gain'
import { playImprovement } from '../../actions/effects/improvement'
import { getCardEffect } from '../card-effects'
import { getWorkPhaseBuildingResources } from '../../logic/work-phase-resources'

import '../A/A53_Claypipe'

const createPlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: {
    wood: 0,
    clay: 1,
    reed: 0,
    stone: 0,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
  },
  familySize: 2,
  workersAvailable: 2,
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: ['A53_Claypipe'],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  newbornCount: 0,
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
})

const createState = (player: PlayerState): GameState => ({
  round: 3,
  phase: 'work',
  currentPlayerIndex: 0,
  players: [player],
  actionSpaces: [],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
  workPhaseObtainedResources: {},
} as GameState)

const createSpace = (id: string): ActionSpace => ({
  id,
  nameKey: `actions.${id}.name`,
  descriptionKey: `actions.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  resources: {
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
  },
  takenBy: null,
} as ActionSpace)

describe('A53_Claypipe', () => {
  it('triggers on return home when 7 building resources were gained before playing it', () => {
    const player = createPlayer()
    const state = createState(player)
    const space = createSpace('custom-gain')

    const gainResult = gainAction.execute({
      state,
      player,
      space,
      params: { wood: 3, clay: 2, reed: 1, stone: 1 },
    } as any)
    expect(gainResult.type).toBe('ok')
    expect(getWorkPhaseBuildingResources(state, player.id)).toBe(7)

    const playResult = playImprovement(state, player, 'minor:A53_Claypipe', 'any')
    expect(playResult.type).toBe('ok')
    expect(player.minorPlayed).toContain('A53_Claypipe')
    expect(player.cardStates?.A53_Claypipe?.infobox).toBe('7 / 7')

    const effect = getCardEffect('A53_Claypipe')
    expect(effect?.onReturnHome).toBeDefined()
    const flow = effect?.onReturnHome?.(state, player)
    expect(flow).toEqual({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: 'A53_Claypipe' },
      ],
    })
    expect(player.cardStates?.A53_Claypipe?.infobox).toBe('0 / 7')
  })

  it('does not trigger on return home when only 6 building resources were gained before playing it', () => {
    const player = createPlayer()
    const state = createState(player)
    const space = createSpace('custom-gain')

    const gainResult = gainAction.execute({
      state,
      player,
      space,
      params: { wood: 3, clay: 2, reed: 1 },
    } as any)
    expect(gainResult.type).toBe('ok')
    expect(getWorkPhaseBuildingResources(state, player.id)).toBe(6)

    const playResult = playImprovement(state, player, 'minor:A53_Claypipe', 'any')
    expect(playResult.type).toBe('ok')
    expect(player.cardStates?.A53_Claypipe?.infobox).toBe('6 / 7')

    const effect = getCardEffect('A53_Claypipe')
    const flow = effect?.onReturnHome?.(state, player)
    expect(flow).toBeUndefined()
    expect(player.cardStates?.A53_Claypipe?.infobox).toBe('0 / 7')
  })
})
