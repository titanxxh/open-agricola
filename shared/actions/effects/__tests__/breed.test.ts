import { createOfficialCardRegistry, installOfficialCardRegistry } from '../../../cards/__tests__/card-environment'

installOfficialCardRegistry()

import { describe, it, expect } from 'vitest'
import type { GameState, PlayerState, Pasture } from '../../../contract/types'
import { breed, canBreedAnimals } from '../breed'
import type { DraftGameEvent, EventSink } from '../../../contract/events'
import { getBreedThreshold, type CardEffect } from '../../../cards/card-effects'
import { withActiveRegistry } from '../../../cards/active-registry'
import { CardRegistry } from '../../../cards/registry'
import { E084_DollysMother_impl } from '../../../cards/E/E084_DollysMother'
import { M033_NightPasture_impl } from '../../../cards/M/M033_NightPasture'
import { OLD_E203_Shepherd } from '../../../cards/classic/E/OLD_E203_Shepherd'

const NIGHT_PASTURE = 'M033_NightPasture'

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    pastures: [],
    stableAnimals: {},
    stableTiles: [],
    farmTiles: {},
    rooms: 2,
    roomTiles: [{ row: 1, col: 0 }, { row: 2, col: 0 }],
    workers: [],
    occupations: [],
    occupationHand: [],
    occupationPlayed: [],
    minorPlayed: [],
    minorHand: [],
    improvements: [],
    cardStates: {},
    activeModifiers: [],
    houseAnimals: {},
    ...overrides,
  } as unknown as PlayerState)

const makeState = (player: PlayerState): GameState =>
  ({ players: [player], actionSpaces: [] } as unknown as GameState)

const makePasture = (capacityTiles: number): Pasture => ({
  id: `pasture-${Math.random()}`,
  size: capacityTiles,
  tiles: Array.from({ length: capacityTiles }, (_, col) => ({ row: 0, col })),
  stables: 0,
  animalType: null,
  animalCount: 0,
})

const withEffects = <T>(effects: CardEffect[], fn: () => T): T => {
  const registry = new CardRegistry()
  effects.forEach((effect) => registry.setEffect(effect))
  return withActiveRegistry(registry, fn)
}

describe('breed core helper', () => {
  it('passes the effective parent count to offspring queries in availability and execution', () => {
    const player = makePlayer({ occupationPlayed: ['TEST_Parents', 'TEST_Offspring'], pastures: [makePasture(4)] })
    player.resources.sheep = 2
    const state = makeState(player)
    const options = { sourceCard: 'harvest', animalTypes: ['sheep'] as const }
    const queriedCounts: number[] = []
    withEffects([
      { id: 'TEST_Parents', computeBreedableAnimalCount: (_state, _player, _type, count) => count + 2 },
      {
        id: 'TEST_Offspring',
        computeBreedOffspringCount: (_state, _player, _type, _count, ctx) => {
          queriedCounts.push(ctx.breedableCount)
          return ctx.breedableCount >= 4 ? 2 : 0
        },
      },
    ], () => {
      expect(canBreedAnimals(state, player, options)).toBe(true)
      expect(breed(state, player, options).breedSummary.resources).toEqual({ sheep: 2 })
      expect(queriedCounts).toEqual([4, 4])
    })
  })

  it('composes played-card offspring queries without bypassing parent eligibility', () => {
    const player = makePlayer({ occupationPlayed: ['TEST_More', 'TEST_Double'], pastures: [makePasture(4)] })
    player.resources.sheep = 1
    const state = makeState(player)
    const options = { sourceCard: 'harvest', animalTypes: ['sheep'] as const }
    withEffects([
      { id: 'TEST_More', computeBreedOffspringCount: (_state, _player, _type, count) => count + 1 },
      { id: 'TEST_Double', computeBreedOffspringCount: (_state, _player, _type, count) => count * 2 },
    ], () => {
      expect(canBreedAnimals(state, player, options)).toBe(false)
      expect(breed(state, player, options).breedSummary.animalCount).toBe(0)
      player.resources.sheep = 2
      expect(canBreedAnimals(state, player, options)).toBe(true)
      expect(breed(state, player, options).breedSummary.resources).toEqual({ sheep: 4 })
      expect(player.resources.sheep).toBe(6)
    })
  })

  it.each([
    [0, 0],
    [-2, 0],
    [2.9, 2],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
  ])('normalizes offspring count %s to %i in availability and execution', (count, expected) => {
    const player = makePlayer({ occupationPlayed: ['TEST_Offspring'], pastures: [makePasture(2)] })
    player.resources.sheep = 2
    const state = makeState(player)
    const options = { sourceCard: 'harvest', animalTypes: ['sheep'] as const }
    withEffects([{ id: 'TEST_Offspring', computeBreedOffspringCount: () => count }], () => {
      expect(canBreedAnimals(state, player, options)).toBe(expected > 0)
      const result = breed(state, player, options)
      expect(result.breedSummary.animalCount).toBe(expected)
      expect(player.resources.sheep).toBe(2 + expected)
    })
  })

  it('breeds 1 of each type when ≥2 + capacity available', () => {
    const player = makePlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 2, boar: 2, cattle: 2, begging: 0,
      },
      pastures: [makePasture(3)],
    } as Partial<PlayerState>)
    const state = makeState(player)
    const { breedSummary } = breed(state, player, { sourceCard: 'harvest' })
    expect(breedSummary.animalCount).toBeGreaterThan(0)
    // 至少一类繁殖成功
    expect(player.resources.sheep + player.resources.boar + player.resources.cattle)
      .toBeGreaterThan(6)
  })

  it('skips an animal when count < 2', () => {
    const player = makePlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 1, boar: 2, cattle: 0, begging: 0,
      },
      pastures: [makePasture(3)],
    } as Partial<PlayerState>)
    const state = makeState(player)
    const { breedSummary } = breed(state, player, { sourceCard: 'harvest' })
    expect(breedSummary.resources.sheep).toBeUndefined()
  })

  it('respects animalTypes filter — only breeds boar', () => {
    const player = makePlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 2, boar: 2, cattle: 2, begging: 0,
      },
      pastures: [makePasture(3)],
    } as Partial<PlayerState>)
    const state = makeState(player)
    const { breedSummary } = breed(state, player, { sourceCard: 'A165_PigBreeder', animalTypes: ['boar'] })
    expect(breedSummary.resources.sheep).toBeUndefined()
    expect(breedSummary.resources.cattle).toBeUndefined()
    expect(breedSummary.resources.boar).toBe(1)
  })

  it('does not exceed capacity — stops when free capacity exhausted', () => {
    // Default house zone has capacity=1; no pasture, no stable. Only 1 type can breed.
    const player = makePlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 4, boar: 4, cattle: 4, begging: 0,
      },
      pastures: [],
    } as Partial<PlayerState>)
    const state = makeState(player)
    const { breedSummary } = breed(state, player, { sourceCard: 'harvest' })
    expect(breedSummary.animalCount).toBe(1)
    expect(breedSummary.animalTypes).toBe(1)
  })

  it('uses default breeding threshold 2 when no modifier applies', () => {
    const player = makePlayer()
    const state = makeState(player)

    expect(getBreedThreshold(state, player, 'sheep', { sourceCard: 'harvest' })).toBe(2)
  })

  it('uses the minimum matching breeding threshold modifier', () => {
    const player = makePlayer({
      minorPlayed: ['TEST_Threshold3', 'TEST_Threshold1'],
    })
    const state = makeState(player)

    const threshold = withEffects([
      {
        id: 'TEST_Threshold3',
        computeBreedThreshold: (_state, _player, animalType) =>
          animalType === 'boar' ? 3 : undefined,
      },
      {
        id: 'TEST_Threshold1',
        computeBreedThreshold: (_state, _player, animalType) =>
          animalType === 'boar' ? 1 : undefined,
      },
    ], () => getBreedThreshold(state, player, 'boar', { sourceCard: 'harvest' }))

    expect(threshold).toBe(1)
  })

  it('breeds through the generic threshold helper', () => {
    const player = makePlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 1, cattle: 0, begging: 0,
      },
      pastures: [makePasture(1)],
      minorPlayed: ['TEST_BoarThreshold'],
    } as Partial<PlayerState>)
    const state = makeState(player)

    const result = withEffects([
      {
        id: 'TEST_BoarThreshold',
        computeBreedThreshold: (_state, _player, animalType) =>
          animalType === 'boar' ? 1 : undefined,
      },
    ], () => breed(state, player, { sourceCard: 'harvest' }))

    expect(result.breedSummary.resources.boar).toBe(1)
    expect(player.resources.boar).toBe(2)
  })

  it('includes horses in default harvest breeding when Farmers of the Moor is enabled', () => {
    const player = makePlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, horse: 2, begging: 0,
      },
      pastures: [makePasture(1)],
    } as Partial<PlayerState>)
    const state = { ...makeState(player), enableFarmersOfTheMoor: true } as GameState

    const { breedSummary } = breed(state, player, { sourceCard: 'harvest' })

    expect(breedSummary.resources.horse).toBe(1)
    expect(player.resources.horse).toBe(3)
  })

  it('does not breed M084 lying horses', () => {
    const player = makePlayer({
      minorPlayed: ['M084_BogPony'],
      cardStates: {
        M084_BogPony: { extraData: { lyingHorseCount: 1 } },
      },
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, horse: 2, begging: 0,
      },
      pastures: [makePasture(1)],
    } as Partial<PlayerState>)
    const state = { ...makeState(player), enableFarmersOfTheMoor: true } as GameState

    const { breedSummary } = breed(state, player, { sourceCard: 'harvest' })

    expect(breedSummary.resources.horse).toBeUndefined()
    expect(player.resources.horse).toBe(2)
  })

  it('keeps ordinary card-zone animals breedable', () => {
    const player = makePlayer({
      cardStates: {
        A011_MudPatch: { extraData: { animalCounts: { boar: 1 } } },
      },
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 2, cattle: 0, begging: 0,
      },
      pastures: [makePasture(1)],
    } as Partial<PlayerState>)
    const state = makeState(player)

    const { breedSummary } = breed(state, player, { sourceCard: 'harvest' })

    expect(breedSummary.resources.boar).toBe(1)
    expect(player.resources.boar).toBe(3)
  })

  it('counts borrowed Night Pasture animals for the card owner, not the guest, when breeding', () => {
    const owner = makePlayer({
      id: 'owner',
      name: 'Owner',
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 1, boar: 0, cattle: 0, begging: 0,
      },
      minorPlayed: [NIGHT_PASTURE],
      pastures: [makePasture(1)],
    } as Partial<PlayerState>)
    const guest = makePlayer({
      id: 'guest',
      name: 'Guest',
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 1, boar: 0, cattle: 0, begging: 0,
      },
    } as Partial<PlayerState>)
    const guestZoneId = `card:${NIGHT_PASTURE}:owner:${owner.id}:animalOwner:${guest.id}`
    owner.cardStates = {
      [NIGHT_PASTURE]: {
        extraData: {
          animalCountsByZone: {
            [guestZoneId]: {
              animalCounts: { sheep: 1 },
              ownerPlayerId: owner.id,
              animalOwnerPlayerId: guest.id,
              cardId: NIGHT_PASTURE,
              capacity: 1,
              allowedAnimalType: null,
            },
          },
        },
      },
    }
    const state = { players: [owner, guest], actionSpaces: [], enableFarmersOfTheMoor: true } as unknown as GameState

    const ownerBreed = withEffects([M033_NightPasture_impl.effect], () =>
      breed(state, owner, { sourceCard: 'harvest' }),
    )
    const guestBreed = withEffects([M033_NightPasture_impl.effect], () =>
      breed(state, guest, { sourceCard: 'harvest' }),
    )

    expect(ownerBreed.breedSummary.resources.sheep).toBe(1)
    expect(owner.resources.sheep).toBe(2)
    expect(guestBreed.breedSummary.resources.sheep).toBeUndefined()
    expect(guest.resources.sheep).toBe(1)
  })

  it('keeps horses out of default harvest breeding when Farmers of the Moor is disabled', () => {
    const player = makePlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, horse: 2, begging: 0,
      },
      pastures: [makePasture(1)],
    } as Partial<PlayerState>)
    const state = makeState(player)

    const { breedSummary } = breed(state, player, { sourceCard: 'harvest' })

    expect(breedSummary.resources.horse).toBeUndefined()
    expect(player.resources.horse).toBe(2)
  })

  it('E84 lowers only harvest sheep breeding threshold and does not write virtual sheep state', () => {
    const player = makePlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 1, boar: 0, cattle: 0, begging: 0,
      },
      pastures: [makePasture(1)],
      minorPlayed: ['E084_DollysMother'],
    } as Partial<PlayerState>)
    const state = makeState(player)

    const result = withEffects([E084_DollysMother_impl.effect], () =>
      breed(state, player, { sourceCard: 'harvest' }),
    )

    expect(result.breedSummary.resources.sheep).toBe(1)
    expect(player.resources.sheep).toBe(2)
    expect(player.cardStates.E084_DollysMother?.extraData?.virtualSheepAdded).toBeUndefined()
  })

  it('E84 does not lower card-triggered sheep breeding threshold', () => {
    const player = makePlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 1, boar: 0, cattle: 0, begging: 0,
      },
      pastures: [makePasture(1)],
      minorPlayed: ['E084_DollysMother'],
    } as Partial<PlayerState>)
    const state = makeState(player)

    const result = withEffects([E084_DollysMother_impl.effect], () =>
      breed(state, player, { sourceCard: 'A165_PigBreeder', animalTypes: ['sheep'] }),
    )

    expect(result.breedSummary.resources.sheep).toBeUndefined()
    expect(player.resources.sheep).toBe(1)
  })
})

describe('classic E203 Shepherd through the public breeding boundary', () => {
  const cardId = OLD_E203_Shepherd.meta.id
  const withShepherd = <T>(run: () => T): T => {
    const registry = createOfficialCardRegistry()
    registry.loadImpl(cardId, OLD_E203_Shepherd.impl)
    return withActiveRegistry(registry, run)
  }
  const setup = (sheep: number, played = true) => {
    const player = makePlayer({
      occupationPlayed: played ? [cardId] : [],
      occupationHand: played ? [] : [cardId],
      pastures: [makePasture(4)],
    })
    player.resources.sheep = sheep
    const state = makeState(player)
    state.players.push(...['p2', 'p3', 'p4'].map(id => makePlayer({ id })))
    return { state, player }
  }

  it.each([[0, 0], [1, 0], [2, 1], [3, 1], [4, 2], [7, 2]])(
    '%i sheep produce %i newborns with matching events, summary and placement minimums',
    (sheep, expected) => {
      const { state, player } = setup(sheep)
      const events: DraftGameEvent[] = []
      const eventSink: EventSink = {
        emit: event => { events.push(event) },
        emitMany: nextEvents => { events.push(...nextEvents) },
      }
      withShepherd(() => {
        const result = breed(state, player, { sourceCard: 'harvest' }, eventSink)
        expect(player.resources.sheep).toBe(sheep + expected)
        expect(result.breedSummary).toEqual({
          resources: expected ? { sheep: expected } : {},
          animalCount: expected,
          animalTypes: expected ? 1 : 0,
        })
        expect(result.placementMinimums).toEqual(expected ? { sheep: 2 + expected } : {})
        expect(events).toEqual(expected ? [{
          type: 'farm.animalBred', animals: { sheep: expected }, source: 'harvest',
        }] : [])
      })
    },
  )

  it('does not apply a card in hand or another player’s played zone', () => {
    const { state, player } = setup(4, false)
    state.players[1].occupationPlayed = [cardId]
    withShepherd(() => {
      expect(breed(state, player, { sourceCard: 'harvest' }).breedSummary.resources).toEqual({ sheep: 1 })
    })
    expect(player.resources.sheep).toBe(5)
    expect(state.players[1].resources.sheep).toBe(0)
  })

  it('changes only sheep and grants two in each later breeding without persistent counters', () => {
    const { state, player } = setup(4)
    player.resources.boar = 2
    player.resources.cattle = 2
    withShepherd(() => {
      expect(breed(state, player, { sourceCard: 'harvest' }).breedSummary.resources)
        .toEqual({ sheep: 2, boar: 1, cattle: 1 })
      expect(breed(state, player, { sourceCard: 'private-breeding', animalTypes: ['sheep'] }).breedSummary.resources)
        .toEqual({ sheep: 2 })
    })
    expect(player.resources).toMatchObject({ sheep: 8, boar: 3, cattle: 3 })
    expect(player.cardStates).toEqual({})
  })
})
