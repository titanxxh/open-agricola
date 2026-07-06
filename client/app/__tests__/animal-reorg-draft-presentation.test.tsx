// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyResources } from '../../../shared/contract/state-constants'
import type { GameState, PlayerState } from '../../../shared/contract/types'
import type { ClientInteractionState } from '../../../shared/contract/protocol/game'
import { useAnimalReorgDraftPresentation } from '../animal-reorg-draft-presentation'

const player = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: { ...emptyResources, sheep: 2, boar: 1, cattle: 0, horse: 1 },
  workers: [],
  rooms: 2,
  houseType: 'wood',
  fields: [],
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  extraOccupationsFromCards: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
  stats: {} as PlayerState['stats'],
  ...overrides,
})

const state = (target = player()): GameState => ({
  players: [target],
  currentPlayerIndex: 0,
  round: 1,
  phase: 'work',
  actionSpaces: [],
  events: [],
  rngState: 1,
  deck: { minor: [], occupation: [] },
  publicMajorIds: [],
  majorDeck: [],
  publicEventArchive: [],
  nextPublicEventArchivePacketSeq: 1,
}) as GameState

const animalReorgInteraction = (): ClientInteractionState => ({
  stateId: 'wait',
  playerIndex: 0,
  spaceId: 'animal-reorg',
  promptKey: 'ui.interactionReorgAnimalsTitle',
  request: {
    kind: 'animal-reorg',
    zones: [
      {
        id: 'pasture-1',
        zoneType: 'pasture',
        animalType: null,
        animalCount: 0,
        capacity: 2,
      },
      {
        id: 'card:mixed',
        zoneType: 'card',
        animalType: null,
        animalCount: 0,
        animalCounts: {},
        allowedAnimalType: null,
        capacity: 2,
      },
    ],
  },
})

describe('useAnimalReorgDraftPresentation', () => {
  it('owns animal reorg draft lifecycle and submit payload', () => {
    const confirm = vi.fn()
    const { result } = renderHook(() =>
      useAnimalReorgDraftPresentation({
        state: state(),
        pendingAnimalReorg: { playerIndex: 0, spaceId: 'animal-reorg' },
      }),
    )

    act(() => result.current.syncFromInteraction(animalReorgInteraction()))
    expect(result.current.isActive).toBe(true)
    expect(result.current.animalReorg?.confirmDiscard).toBe(false)

    act(() => result.current.controls.adjustAnimal('pasture-1', 'sheep', 1))
    act(() => result.current.controls.adjustAnimal('pasture-1', 'sheep', 1))
    act(() => result.current.controls.adjustAnimal('card:mixed', 'boar', 1))
    act(() => result.current.controls.adjustAnimal('card:mixed', 'horse', 1))

    expect(result.current.submitDraft.animalReorgZones).toEqual([
      expect.objectContaining({ id: 'pasture-1', animalType: 'sheep', animalCount: 2 }),
      expect.objectContaining({
        id: 'card:mixed',
        animalType: null,
        animalCount: 2,
        animalCounts: { boar: 1, horse: 1 },
      }),
    ])
    expect(result.current.hasReorgOverflow).toBe(false)

    act(() => result.current.controls.adjustAnimal('pasture-1', 'sheep', -1))
    expect(result.current.reorgTotals.sheep).toBe(1)
    expect(result.current.reorgAvailable?.sheep).toBe(2)

    act(() => result.current.controls.confirm(
      { sheep: 1, boar: 0, cattle: 0, horse: 0 },
      confirm,
    ))
    expect(confirm).not.toHaveBeenCalled()
    expect(result.current.animalReorg?.confirmDiscard).toBe(true)

    act(() => result.current.controls.cancelDiscardPrompt())
    expect(result.current.animalReorg?.confirmDiscard).toBe(false)

    act(() => result.current.controls.adjustAnimal('pasture-1', 'sheep', 1))
    act(() => result.current.controls.confirm(
      { sheep: 0, boar: 0, cattle: 0, horse: 0 },
      confirm,
    ))
    expect(confirm).toHaveBeenCalledWith('confirm')

    act(() => result.current.reset())
    expect(result.current.animalReorg).toBe(null)
    expect(result.current.submitDraft.animalReorgZones).toBeUndefined()
  })
})
