import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../contract/types'
import { subtractAnimalsFromBoard } from '../animals'

const NIGHT_PASTURE = 'M033_NightPasture'

const emptyResources = () => ({
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
})

const createPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1', name: 'P1', color: 'red',
  resources: emptyResources(), workers: [], rooms: 2, houseType: 'wood',
  fields: [], roomTiles: [], stableTiles: [], improvements: [],
  minorHand: [], minorPlayed: [], occupationHand: [], occupationPlayed: [],
  houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
  pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 }, startPlayer: false, cardStates: {},
  ...overrides,
} as PlayerState)

describe('subtractAnimalsFromBoard', () => {
  it('扣完单 pasture', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 1 },
      pastures: [{ id: 'pasture-1', size: 1, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: 'sheep', animalCount: 1 }],
    })
    subtractAnimalsFromBoard(p, { sheep: 1 })
    expect(p.resources.sheep).toBe(0)
    expect(p.pastures[0].animalCount).toBe(0)
    expect(p.pastures[0].animalType).toBeNull()
  })

  it('多 pasture 部分扣（顺序）', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 5 },
      pastures: [
        { id: 'p1', size: 2, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: 'sheep', animalCount: 3 },
        { id: 'p2', size: 1, tiles: [{ row: 2, col: 1 }], stables: 0, animalType: 'sheep', animalCount: 2 },
      ],
    })
    subtractAnimalsFromBoard(p, { sheep: 4 })
    expect(p.resources.sheep).toBe(1)
    expect(p.pastures[0].animalCount).toBe(0)
    expect(p.pastures[0].animalType).toBeNull()
    expect(p.pastures[1].animalCount).toBe(1)
    expect(p.pastures[1].animalType).toBe('sheep')
  })

  it('pasture + house + stable 串联', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 3 },
      pastures: [{ id: 'p1', size: 1, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: 'sheep', animalCount: 1 }],
      houseAnimalType: 'sheep', houseAnimalCount: 1,
      stableAnimals: { '2-2': 'sheep' },
    })
    subtractAnimalsFromBoard(p, { sheep: 3 })
    expect(p.resources.sheep).toBe(0)
    expect(p.pastures[0].animalCount).toBe(0)
    expect(p.houseAnimalCount).toBe(0)
    expect(p.houseAnimalType).toBeNull()
    expect(p.stableAnimals['2-2']).toBeNull()
  })

  it('stable 多 entry 扣 1', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), cattle: 2 },
      stableAnimals: { '2-2': 'cattle', '2-3': 'cattle' },
    })
    subtractAnimalsFromBoard(p, { cattle: 1 })
    expect(p.resources.cattle).toBe(1)
    const remaining = Object.values(p.stableAnimals).filter((a) => a === 'cattle').length
    expect(remaining).toBe(1)
  })

  it('animal-holder 卡 extraData.held', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), boar: 2 },
      cardStates: { C148_MudWallower: { extraData: { held: 2, animalType: 'boar' } } as any },
    })
    subtractAnimalsFromBoard(p, { boar: 1 })
    expect(p.resources.boar).toBe(1)
    expect((p.cardStates!.C148_MudWallower.extraData as any).held).toBe(1)
  })

  it('animal-holder 卡 animalCountsByZone', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 2 },
      cardStates: {
        M034_HomeWood: {
          extraData: {
            animalCountsByZone: {
              'card:M034_HomeWood@0,0': { animalCounts: { sheep: 2 } },
            },
          },
        } as any,
      },
    })
    subtractAnimalsFromBoard(p, { sheep: 1 })
    expect(p.resources.sheep).toBe(1)
    const zone = ((p.cardStates!.M034_HomeWood.extraData as any).animalCountsByZone as any)['card:M034_HomeWood@0,0']
    expect(zone.animalCounts.sheep).toBe(1)
    expect(zone.held).toBe(1)
  })

  it('hosted animal-holder card animalCountsByZone', () => {
    const owner = createPlayer({ id: 'owner', name: 'Owner' })
    const guest = createPlayer({
      id: 'guest',
      name: 'Guest',
      resources: { ...emptyResources(), sheep: 1 },
    })
    const guestZoneId = `card:${NIGHT_PASTURE}:owner:${owner.id}:animalOwner:${guest.id}`
    owner.minorPlayed = [NIGHT_PASTURE]
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
      } as any,
    }
    const state = { players: [owner, guest], enableFarmersOfTheMoor: true } as GameState

    subtractAnimalsFromBoard(guest, { sheep: 1 }, state)

    expect(guest.resources.sheep).toBe(0)
    const zone = ((owner.cardStates!.M033_NightPasture.extraData as any).animalCountsByZone as any)[guestZoneId]
    expect(zone.animalCounts?.sheep ?? 0).toBe(0)
  })

  it('无 state 时只扣当前玩家的 hosted animal-holder card animalCountsByZone', () => {
    const owner = createPlayer({
      id: 'owner',
      name: 'Owner',
      resources: { ...emptyResources(), sheep: 1 },
    })
    const guest = createPlayer({
      id: 'guest',
      name: 'Guest',
      resources: { ...emptyResources(), sheep: 1 },
    })
    const ownerZoneId = `card:${NIGHT_PASTURE}:owner:${owner.id}:animalOwner:${owner.id}`
    const guestZoneId = `card:${NIGHT_PASTURE}:owner:${owner.id}:animalOwner:${guest.id}`
    owner.minorPlayed = [NIGHT_PASTURE]
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
            [ownerZoneId]: {
              animalCounts: { sheep: 1 },
              ownerPlayerId: owner.id,
              animalOwnerPlayerId: owner.id,
              cardId: NIGHT_PASTURE,
              capacity: 3,
              allowedAnimalType: null,
            },
          },
        },
      } as any,
    }

    subtractAnimalsFromBoard(owner, { sheep: 1 })

    const zoneStorage = (owner.cardStates!.M033_NightPasture.extraData as any).animalCountsByZone as any
    expect(owner.resources.sheep).toBe(0)
    expect(zoneStorage[ownerZoneId].animalCounts?.sheep ?? 0).toBe(0)
    expect(zoneStorage[guestZoneId].animalCounts?.sheep ?? 0).toBe(1)
    expect(guest.resources.sheep).toBe(1)
  })

  it('多 type 同时', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 1, boar: 1 },
      pastures: [
        { id: 'p1', size: 1, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: 'sheep', animalCount: 1 },
        { id: 'p2', size: 1, tiles: [{ row: 2, col: 1 }], stables: 0, animalType: 'boar', animalCount: 1 },
      ],
    })
    subtractAnimalsFromBoard(p, { sheep: 1, boar: 1 })
    expect(p.resources.sheep).toBe(0)
    expect(p.resources.boar).toBe(0)
    expect(p.pastures[0].animalCount).toBe(0)
    expect(p.pastures[1].animalCount).toBe(0)
  })
})
