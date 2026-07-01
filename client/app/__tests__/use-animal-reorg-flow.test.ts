import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState, Resource } from '../../../shared/contract/types'
import type { AnimalReorgState, PendingAnimalReorg } from '../../types/ui'
import {
  applyAnimalReorgToPlayer,
  buildBorrowedPlayedCardDisplays,
  buildCardDisplayMap,
  buildFarmCardDisplayMap,
  buildPastureDisplayMap,
  buildPostReorgPlan,
  buildPendingChoiceFromReorgProgress,
  computeReorgAvailableAnimals,
  buildReorgEngineProgressPlan,
  buildStableDisplayMap,
  hasUnassignedAnimals,
  shouldShowAnimalDiscardPrompt,
  wouldExceedExclusiveCardZoneLimit,
} from '../hooks/use-animal-reorg-flow'

const resources = (): Resource => ({
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
})

const player = (): PlayerState => ({
  id: 'p1',
  name: 'p1',
  color: 'red',
  resources: resources(),
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [
    {
      id: 'pasture-1',
      size: 1,
      tiles: [],
      stables: 0,
      animalType: null,
      animalCount: 0,
    },
    {
      id: 'pasture-2',
      size: 1,
      tiles: [],
      stables: 0,
      animalType: 'sheep',
      animalCount: 2,
    },
  ],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
})

const animalReorgState = (): AnimalReorgState => ({
  confirmDiscard: false,
  zones: [
    { id: 'pasture-1', zoneType: 'pasture', animalType: 'boar', animalCount: 4, capacity: 4 },
    { id: 'pasture-2', zoneType: 'pasture', animalType: null, animalCount: 0, capacity: 4 },
    { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 3, capacity: 1 },
    { id: 'stable:1-1', zoneType: 'stable', animalType: 'cattle', animalCount: 1, capacity: 1 },
    { id: 'card:C148_MudWallower', zoneType: 'card', animalType: 'boar', animalCount: 1, capacity: 1, cardId: 'C148_MudWallower' },
  ],
})

const gameState = (): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players: [player(), { ...player(), id: 'p2', name: 'p2', resources: { ...resources(), sheep: 1 } }],
  actionSpaces: [
    {
      id: 'forest',
      nameKey: 'actions.forest.name',
      descriptionKey: 'actions.forest.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
      resources: resources(),
      takenBy: [],
    },
  ],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
})

describe('use-animal-reorg-flow helpers', () => {
  it('applies animal assignments with pasture capacity clamp', () => {
    const target = player()
    applyAnimalReorgToPlayer({
      player: target,
      animalReorg: animalReorgState(),
      totals: { sheep: 1, boar: 3, cattle: 1 },
      getPastureCapacity: (pasture) => (pasture.id === 'pasture-1' ? 2 : 1),
    })
    expect(target.pastures[0].animalType).toBe('boar')
    expect(target.pastures[0].animalCount).toBe(2)
    expect(target.pastures[1].animalType).toBeNull()
    expect(target.pastures[1].animalCount).toBe(0)
  })

  it('writes back house, stable and resource totals', () => {
    const target = player()
    applyAnimalReorgToPlayer({
      player: target,
      animalReorg: animalReorgState(),
      totals: { sheep: 5, boar: 2, cattle: 4 },
      getPastureCapacity: () => 2,
    })
    expect(target.houseAnimalType).toBe('sheep')
    expect(target.houseAnimalCount).toBe(1)
    expect(target.stableAnimals['1-1']).toBe('cattle')
    expect(target.resources.sheep).toBe(5)
    expect(target.resources.boar).toBe(2)
    expect(target.resources.cattle).toBe(4)
  })

  it('keeps M084 lying horses available to ordinary reorg zones', () => {
    const target = player()
    target.resources.horse = 2
    target.cardStates = {
      M084_BogPony: { extraData: { lyingHorseCount: 1 } },
    }

    expect(computeReorgAvailableAnimals(target)).toMatchObject({ horse: 2 })
  })

  it('builds pasture display from reorg draft zones while reorganizing', () => {
    const display = buildPastureDisplayMap(player(), animalReorgState())
    expect(display.get('pasture-1')).toEqual({ animalType: 'boar', animalCount: 4 })
    expect(display.get('pasture-2')).toEqual({ animalType: null, animalCount: 0 })
  })

  it('builds stable display from reorg draft zones while reorganizing', () => {
    const display = buildStableDisplayMap(player(), animalReorgState())
    expect(display.get('1-1')).toEqual({ animalType: 'cattle', animalCount: 1 })
  })

  it('builds empty stable display from stable tiles', () => {
    const target = player()
    target.stableTiles = [{ row: 0, col: 0 }]
    target.stableAnimals = {}
    const display = buildStableDisplayMap(target, null)
    expect(display.get('0-0')).toEqual({ animalType: null, animalCount: 0 })
  })

  it('builds card display from reorg draft zones while reorganizing', () => {
    const display = buildCardDisplayMap(animalReorgState())
    expect(display.get('C148_MudWallower')).toEqual({
      animalType: 'boar',
      animalCount: 1,
      capacity: 1,
      zoneId: 'card:C148_MudWallower',
    })
  })

  it('builds borrowed played-card animal zones from other players cards outside reorg', () => {
    const state = gameState()
    const owner = state.players[0]!
    const viewer = state.players[1]!
    owner.name = 'Owner'
    owner.minorPlayed = ['M033_NightPasture']
    ;(viewer as PlayerState & { borrowedPlayedCardAnimalZones: AnimalReorgState['zones'] })
      .borrowedPlayedCardAnimalZones = [
        {
          id: 'card:M033_NightPasture:owner:p1:animalOwner:p2',
          zoneType: 'card',
          cardId: 'M033_NightPasture',
          ownerPlayerId: 'p1',
          animalOwnerPlayerId: 'p2',
          displayOwnerName: 'Owner',
          displaySource: 'borrowed-played-card',
          animalType: null,
          animalCount: 0,
          capacity: 1,
        },
      ]

    const display = buildBorrowedPlayedCardDisplays(state, viewer, null)

    expect(display).toEqual([
      {
        animalType: null,
        animalCount: 0,
        capacity: 1,
        zoneId: 'card:M033_NightPasture:owner:p1:animalOwner:p2',
        cardId: 'M033_NightPasture',
        cardType: 'minor',
        ownerPlayerId: 'p1',
        animalOwnerPlayerId: 'p2',
        displayOwnerName: 'Owner',
        displaySource: 'borrowed-played-card',
        isReorgDraft: false,
      },
    ])
  })

  it('overlays borrowed played-card animal zones with active reorg draft state', () => {
    const state = gameState()
    const owner = state.players[0]!
    const viewer = state.players[1]!
    owner.name = 'Owner'
    owner.minorPlayed = ['M033_NightPasture']
    ;(viewer as PlayerState & { borrowedPlayedCardAnimalZones: AnimalReorgState['zones'] })
      .borrowedPlayedCardAnimalZones = [
        {
          id: 'card:M033_NightPasture:owner:p1:animalOwner:p2',
          zoneType: 'card',
          cardId: 'M033_NightPasture',
          ownerPlayerId: 'p1',
          animalOwnerPlayerId: 'p2',
          displayOwnerName: 'Owner',
          displaySource: 'borrowed-played-card',
          animalType: null,
          animalCount: 0,
          capacity: 1,
        },
      ]
    const reorg = animalReorgState()
    reorg.zones.push({
      id: 'card:M033_NightPasture:owner:p1:animalOwner:p2',
      zoneType: 'card',
      cardId: 'M033_NightPasture',
      ownerPlayerId: 'p1',
      animalOwnerPlayerId: 'p2',
      displayOwnerName: 'Owner',
      displaySource: 'borrowed-played-card',
      animalType: 'horse',
      animalCount: 1,
      capacity: 1,
    })

    const display = buildBorrowedPlayedCardDisplays(state, viewer, reorg)

    expect(display).toEqual([
      expect.objectContaining({
        animalType: 'horse',
        animalCount: 1,
        zoneId: 'card:M033_NightPasture:owner:p1:animalOwner:p2',
        cardId: 'M033_NightPasture',
        displaySource: 'borrowed-played-card',
        isReorgDraft: true,
      }),
    ])
  })

  it('builds farm-card display from persisted per-zone storage after reorg', () => {
    const target = player()
    target.cardStates = {
      M034_HomeWood: {
        extraData: {
          animalCountsByZone: {
            'card:M034_HomeWood@0-0': {
              animalCounts: { horse: 1 },
              capacity: 1,
              allowedAnimalTypes: ['boar', 'cattle', 'horse'],
            },
          },
        },
      },
    }
    const display = buildFarmCardDisplayMap(target, null)
    expect(display.get('0-0')).toEqual({
      animalType: 'horse',
      animalCount: 1,
      animalCounts: { horse: 1 },
      capacity: 1,
      zoneId: 'card:M034_HomeWood@0-0',
      allowedAnimalTypes: ['boar', 'cattle', 'horse'],
    })
  })

  it('blocks assigning a second occupied card zone past exclusive limit', () => {
    const reorg = animalReorgState()
    reorg.zones.push(
      {
        id: 'card:M035_HorseTrough@0,0',
        zoneType: 'card',
        cardId: 'M035_HorseTrough',
        animalType: 'horse',
        animalCount: 1,
        capacity: 1,
        exclusiveCardZoneLimit: 1,
      },
      {
        id: 'card:M035_HorseTrough@0,1',
        zoneType: 'card',
        cardId: 'M035_HorseTrough',
        animalType: null,
        animalCount: 0,
        capacity: 1,
        exclusiveCardZoneLimit: 1,
      },
    )

    expect(wouldExceedExclusiveCardZoneLimit(reorg.zones, 'card:M035_HorseTrough@0,1')).toBe(true)
    expect(wouldExceedExclusiveCardZoneLimit(reorg.zones, 'card:M035_HorseTrough@0,0')).toBe(false)
  })

  it('builds pending choice with farm-redevelopment fence bonus', () => {
    const pending: PendingAnimalReorg = { playerIndex: 1, spaceId: 'farm-redevelopment' }
    const choice = buildPendingChoiceFromReorgProgress(
      {
        promptKey: 'ui.interactionFenceSelect',
        choice: [{ value: 'x', labelKey: 'x' }],
      },
      pending,
    )
    expect(choice.playerIndex).toBe(1)
    expect(choice.fenceExtraWood).toBe(1)
  })

  it('requires discard confirmation when animals remain unassigned', () => {
    expect(hasUnassignedAnimals({ sheep: 2, boar: 0, cattle: 0 })).toBe(true)
    expect(shouldShowAnimalDiscardPrompt(
      { zones: [], confirmDiscard: false },
      { sheep: 2, boar: 0, cattle: 0 },
    )).toBe(true)
    expect(shouldShowAnimalDiscardPrompt(
      { zones: [], confirmDiscard: true },
      { sheep: 2, boar: 0, cattle: 0 },
    )).toBe(false)
    expect(shouldShowAnimalDiscardPrompt(
      { zones: [], confirmDiscard: false },
      { sheep: 0, boar: 0, cattle: 0 },
    )).toBe(false)
  })

  it('plans harvest reorg handoff when pending animals remain', () => {
    const plan = buildPostReorgPlan({
      reorgSource: 'harvest-breed',
      nextState: gameState(),
      spaceId: 'forest',
      hasPendingAnimals: (candidate) => candidate.id === 'p2',
    })
    expect(plan.type).toBe('harvestNextPlayer')
    if (plan.type === 'harvestNextPlayer') {
      expect(plan.pendingPlayerIndex).toBe(1)
    }
  })

  it('plans action-space branch with target lookup', () => {
    const plan = buildPostReorgPlan({
      reorgSource: 'forest',
      nextState: gameState(),
      spaceId: 'forest',
      hasPendingAnimals: () => false,
    })
    expect(plan.type).toBe('actionSpace')
    if (plan.type === 'actionSpace') {
      expect(plan.hasTargetSpace).toBe(true)
    }
  })

  it('maps engine choice progress to reset flags and pending choice', () => {
    const pending: PendingAnimalReorg = {
      playerIndex: 0,
      spaceId: 'farm-redevelopment',
    }
    const plan = buildReorgEngineProgressPlan({
      progress: {
        type: 'choice',
        promptKey: 'ui.interactionFenceSelect',
        choice: [{ value: 'a', labelKey: 'a' }],
      },
      pendingAnimalReorg: pending,
      players: gameState().players,
      currentPlayerIndex: 0,
      nextPlayerIndex: () => 1,
    })
    expect(plan.type).toBe('choice')
    if (plan.type === 'choice') {
      expect(plan.resetFenceSelection).toBe(true)
      expect(plan.resetStableSelection).toBe(false)
      expect(plan.pendingChoice.fenceExtraWood).toBe(1)
    }
  })

  it('maps engine done progress to next-player advance plan', () => {
    const plan = buildReorgEngineProgressPlan({
      progress: { type: 'done' },
      pendingAnimalReorg: { playerIndex: 0, spaceId: 'forest' },
      players: gameState().players,
      currentPlayerIndex: 0,
      nextPlayerIndex: () => 1,
    })
    expect(plan.type).toBe('advance')
    if (plan.type === 'advance') {
      expect(plan.pendingNextPlayerIndex).toBe(1)
    }
  })
})
