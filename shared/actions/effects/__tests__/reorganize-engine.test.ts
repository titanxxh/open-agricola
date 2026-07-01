import { describe, it, expect } from 'vitest'
import { reorganizeAction } from '../reorganize'
import type {
  ActionExecutionContext,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../../contract/types'
import '../../../cards/B/B012_Stockyard'
import '../../../cards/C/C011_WildlifeReserve'
import '../../../cards/C/C148_MudWallower'
import '../../../cards/M/M033_NightPasture'
import '../../../cards/M/M084_BogPony'

const NIGHT_PASTURE = 'M033_NightPasture'

const dummySpace: ActionSpace = {
  id: '__subflow:reorganize',
  nameKey: '',
  kind: 'synthetic',
} as unknown as ActionSpace

const makeCtx = (opts: {
  player?: Partial<PlayerState>
  state?: Partial<GameState>
  actionContext?: Record<string, unknown>
} = {}): ActionExecutionContext => {
  const player = {
    id: 'p1',
    name: 'P1',
    resources: {
      wood: 0,
      clay: 0,
      stone: 0,
      reed: 0,
      grain: 0,
      vegetable: 0,
      food: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
    },
    fields: [],
    roomTiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }],
    stableTiles: [],
    pastures: [],
    fenceSegments: [],
    cardStates: {},
    improvements: [],
    minorPlayed: [],
    occupationPlayed: [],
    activeModifiers: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    ...(opts.player ?? {}),
  } as unknown as PlayerState
  const state = {
    players: [player],
    currentPlayerIndex: 0,
    ...(opts.state ?? {}),
  } as unknown as GameState
  return {
    state,
    player,
    space: dummySpace,
    actionContext: opts.actionContext,
  } as ActionExecutionContext
}

describe('reorganizeAction.execute', () => {
  it('anytime trigger emits animal-reorg request with zones', () => {
    const ctx = makeCtx({ actionContext: { trigger: 'anytime' } })
    const result = reorganizeAction.execute(ctx)
    expect(result.type).toBe('request')
    if (result.type !== 'request') throw new Error(`expected 'request', got ${result.type}`)
    expect(result.promptKey).toBe('ui.interactionAnimalReorg')
    expect(result.promptParams).toEqual({ trigger: 'anytime' })
    expect(result.request.kind).toBe('animal-reorg')
    if (result.request.kind !== 'animal-reorg') throw new Error('not animal-reorg')
    expect(result.request.zones).toBeInstanceOf(Array)
  })

  it('returning-home trigger emits animal-reorg request with same zone shape', () => {
    const ctx = makeCtx({ actionContext: { trigger: 'returning-home' } })
    const result = reorganizeAction.execute(ctx)
    expect(result.type).toBe('request')
    if (result.type !== 'request') throw new Error(`expected 'request', got ${result.type}`)
    expect(result.promptParams).toEqual({ trigger: 'returning-home' })
    expect(result.request.kind).toBe('animal-reorg')
    if (result.request.kind !== 'animal-reorg') throw new Error('not animal-reorg')
    expect(result.request.zones).toBeInstanceOf(Array)
  })

  it('emits hosted card-zone metadata for a borrowed Night Pasture zone', () => {
    const owner = makeCtx({ player: { id: 'owner', name: 'Owner', minorPlayed: [NIGHT_PASTURE] } }).player
    owner.cardStates = { [NIGHT_PASTURE]: { extraData: {} } }
    const guest = makeCtx({ player: { id: 'guest', name: 'Guest' } }).player
    const ctx = makeCtx({ state: { enableFarmersOfTheMoor: true } })
    ctx.player = guest
    ctx.state.players = [owner, guest]
    const guestZoneId = `card:${NIGHT_PASTURE}:owner:${owner.id}:animalOwner:${guest.id}`

    const result = reorganizeAction.execute(ctx)

    expect(result.type).toBe('request')
    if (result.type !== 'request' || result.request.kind !== 'animal-reorg') throw new Error('not animal-reorg')
    expect(result.request.zones.find((zone) => zone.id === guestZoneId)).toMatchObject({
      id: guestZoneId,
      zoneType: 'card',
      cardId: NIGHT_PASTURE,
      ownerPlayerId: owner.id,
      animalOwnerPlayerId: guest.id,
      displayOwnerName: owner.name,
      displaySource: 'borrowed-played-card',
      capacity: 1,
    })
  })
})

describe('reorganizeAction.resolveChoice', () => {
  it('confirm without payload returns fail with errorKey', () => {
    const ctx = makeCtx()
    const result = reorganizeAction.resolveChoice!(ctx, 'confirm', undefined)
    expect(result.type).toBe('fail')
    if (result.type !== 'fail') throw new Error('not fail')
    expect(result.errorKey).toBe('log.reorganizeFail')
  })

  it('cancel returns recoverable fail without mutation', () => {
    const ctx = makeCtx({ player: { resources: { sheep: 3 } as never } })
    ctx.player.resources.sheep = 3
    const before = JSON.parse(JSON.stringify(ctx.player))

    const result = reorganizeAction.resolveChoice!(ctx, 'cancel')

    expect(result).toEqual({
      type: 'fail',
      errorKey: 'log.reorganizeFail',
      recoverable: true,
    })
    expect(ctx.player).toEqual(before)
  })

  it('confirm with zones reduces reserve sheep when assigned to pasture', () => {
    const ctx = makeCtx()
    ctx.player.resources.sheep = 3
    ctx.player.pastures = [
      {
        id: 'pasture-1',
        size: 1,
        tiles: [{ row: 0, col: 0 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]
    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [{ id: 'pasture-1', zoneType: 'pasture', animalType: 'sheep', animalCount: 2 }] as unknown as Record<string, unknown>,
    )
    expect(result.type).toBe('ok')
    expect(ctx.player.pastures[0]!.animalCount).toBe(2)
    expect(ctx.player.pastures[0]!.animalType).toBe('sheep')
    expect(ctx.player.resources.sheep).toBe(2)
  })

  it('keeps assigned horse totals when Farmers of the Moor is enabled', () => {
    const ctx = makeCtx({
      state: { enableFarmersOfTheMoor: true },
      player: {
        resources: {
          sheep: 0,
          boar: 0,
          cattle: 0,
          horse: 2,
        } as never,
        pastures: [
          {
            id: 'pasture-1',
            size: 1,
            tiles: [{ row: 0, col: 0 }],
            stables: 0,
            animalType: null,
            animalCount: 0,
          },
        ],
      },
    })

    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [{ id: 'pasture-1', zoneType: 'pasture', animalType: 'horse', animalCount: 1 }] as unknown as Record<string, unknown>,
    )

    expect(result.type).toBe('ok')
    expect(ctx.player.pastures[0]!.animalType).toBe('horse')
    expect(ctx.player.pastures[0]!.animalCount).toBe(1)
    expect(ctx.player.resources.horse).toBe(1)
  })

  it('normalizes mixed animalCounts on same-type unkeyed card zones', () => {
    const ctx = makeCtx({
      player: {
        minorPlayed: ['B012_Stockyard'],
        resources: { sheep: 1, boar: 1 } as never,
      },
    })

    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [{
        id: 'card:B012_Stockyard',
        zoneType: 'card',
        animalType: 'boar',
        animalCount: 2,
        animalCounts: { sheep: 1, boar: 1 },
      }] as unknown as Record<string, unknown>,
    )

    expect(result.type).toBe('ok')
    expect(ctx.player.resources.sheep).toBe(0)
    expect(ctx.player.resources.boar).toBe(1)
  })

  it('normalizes counters-held card zones before adding them to totals', () => {
    const ctx = makeCtx({
      player: {
        occupationPlayed: ['C148_MudWallower'],
        resources: { sheep: 1 } as never,
        cardStates: {
          C148_MudWallower: { counters: { counter: 0, held: 1 } },
        } as never,
      },
    })

    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [{
        id: 'card:C148_MudWallower',
        zoneType: 'card',
        cardId: 'C148_MudWallower',
        animalType: 'sheep',
        animalCount: 1,
        animalCounts: { sheep: 1 },
      }] as unknown as Record<string, unknown>,
    )

    expect(result.type).toBe('ok')
    expect(ctx.player.resources.sheep).toBe(0)
    expect(ctx.player.resources.boar).toBe(0)
  })

  it('filters invalid card animals before clamping capacity', () => {
    const ctx = makeCtx({
      player: {
        minorPlayed: ['C011_WildlifeReserve'],
        resources: { sheep: 2, boar: 1, cattle: 1 } as never,
      },
    })

    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [{
        id: 'card:C011_WildlifeReserve',
        zoneType: 'card',
        cardId: 'C011_WildlifeReserve',
        animalType: null,
        animalCount: 4,
        animalCounts: { sheep: 2, boar: 1, cattle: 1 },
      }] as unknown as Record<string, unknown>,
    )

    expect(result.type).toBe('ok')
    expect(ctx.player.resources.sheep).toBe(1)
    expect(ctx.player.resources.boar).toBe(1)
    expect(ctx.player.resources.cattle).toBe(1)
  })

  it('rejects horses from Wildlife Reserve card zones', () => {
    const ctx = makeCtx({
      state: { enableFarmersOfTheMoor: true },
      player: {
        minorPlayed: ['C011_WildlifeReserve'],
        resources: { sheep: 1, boar: 1, cattle: 1, horse: 1 } as never,
      },
    })

    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [{
        id: 'card:C011_WildlifeReserve',
        zoneType: 'card',
        cardId: 'C011_WildlifeReserve',
        animalType: null,
        animalCount: 4,
        animalCounts: { sheep: 1, boar: 1, cattle: 1, horse: 1 },
      }] as unknown as Record<string, unknown>,
    )

    expect(result.type).toBe('ok')
    expect(ctx.player.resources.sheep).toBe(1)
    expect(ctx.player.resources.boar).toBe(1)
    expect(ctx.player.resources.cattle).toBe(1)
    expect(ctx.player.resources.horse).toBe(0)
  })

  it('keeps M084 out of editable animal reorg zones', () => {
    const ctx = makeCtx({
      state: { enableFarmersOfTheMoor: true },
      player: {
        minorPlayed: ['M084_BogPony'],
        resources: { sheep: 0, boar: 0, cattle: 0, horse: 1 } as never,
        cardStates: {
          M084_BogPony: { extraData: { lyingHorseCount: 1 } },
        } as never,
        pastures: [
          {
            id: 'pasture-1',
            size: 1,
            tiles: [{ row: 0, col: 0 }],
            stables: 0,
            animalType: 'horse',
            animalCount: 1,
          },
        ],
      },
    })
    const request = reorganizeAction.execute(ctx)
    expect(request.type).toBe('request')
    if (request.type !== 'request' || request.request.kind !== 'animal-reorg') throw new Error('not animal-reorg')
    expect(request.request.zones.map((zone) => zone.id)).not.toContain('card:M084_BogPony')

    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [{ id: 'pasture-1', zoneType: 'pasture', animalType: 'horse', animalCount: 1 }] as unknown as Record<string, unknown>,
    )

    expect(result.type).toBe('ok')
    expect(ctx.player.resources.horse).toBe(1)
    expect(ctx.player.cardStates.M084_BogPony?.extraData?.lyingHorseCount).toBe(1)
  })

  it('lets reorg payload place M084 lying horses only in ordinary zones', () => {
    const ctx = makeCtx({
      state: { enableFarmersOfTheMoor: true },
      player: {
        minorPlayed: ['M084_BogPony'],
        resources: { sheep: 0, boar: 0, cattle: 0, horse: 1 } as never,
        cardStates: {
          M084_BogPony: { extraData: { lyingHorseCount: 1 } },
        } as never,
      },
    })

    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [{ id: 'house', zoneType: 'house', animalType: 'horse', animalCount: 1 }] as unknown as Record<string, unknown>,
    )

    expect(result.type).toBe('ok')
    expect(ctx.player.resources.horse).toBe(1)
    expect(ctx.player.houseAnimalType).toBe('horse')
    expect(ctx.player.houseAnimalCount).toBe(1)
    expect(ctx.player.cardStates.M084_BogPony?.extraData?.lyingHorseCount).toBe(1)
  })

  it('writes borrowed Night Pasture reorg storage to the card owner and preserves other hosted slots', () => {
    const owner = makeCtx({ player: { id: 'owner', name: 'Owner', minorPlayed: [NIGHT_PASTURE] } }).player
    const guest = makeCtx({
      player: {
        id: 'guest',
        name: 'Guest',
        resources: { sheep: 1 } as never,
      },
    }).player
    const other = makeCtx({
      player: {
        id: 'other',
        name: 'Other',
        resources: { boar: 1 } as never,
      },
    }).player
    const guestZoneId = `card:${NIGHT_PASTURE}:owner:${owner.id}:animalOwner:${guest.id}`
    const otherZoneId = `card:${NIGHT_PASTURE}:owner:${owner.id}:animalOwner:${other.id}`
    owner.cardStates = {
      [NIGHT_PASTURE]: {
        extraData: {
          animalCountsByZone: {
            [otherZoneId]: {
              animalCounts: { boar: 1 },
              ownerPlayerId: owner.id,
              animalOwnerPlayerId: other.id,
              cardId: NIGHT_PASTURE,
              capacity: 1,
              allowedAnimalType: null,
            },
          },
        },
      },
    }
    const ctx = makeCtx({ state: { enableFarmersOfTheMoor: true } })
    ctx.player = guest
    ctx.state.players = [owner, guest, other]

    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [{
        id: guestZoneId,
        zoneType: 'card',
        cardId: NIGHT_PASTURE,
        ownerPlayerId: owner.id,
        animalOwnerPlayerId: guest.id,
        animalType: 'sheep',
        animalCount: 1,
        animalCounts: { sheep: 1 },
      }] as unknown as Record<string, unknown>,
    )

    expect(result.type).toBe('ok')
    expect(guest.cardStates?.[NIGHT_PASTURE]).toBeUndefined()
    expect(owner.cardStates[NIGHT_PASTURE]?.extraData?.animalCountsByZone).toMatchObject({
      [guestZoneId]: {
        animalCounts: { sheep: 1 },
        ownerPlayerId: owner.id,
        animalOwnerPlayerId: guest.id,
      },
      [otherZoneId]: {
        animalCounts: { boar: 1 },
        ownerPlayerId: owner.id,
        animalOwnerPlayerId: other.id,
      },
    })
  })

  it('preserves untagged non-active Night Pasture slots when a guest reorganizes', () => {
    const owner = makeCtx({
      player: {
        id: 'owner',
        name: 'Owner',
        minorPlayed: [NIGHT_PASTURE],
        resources: { boar: 1 } as never,
      },
    }).player
    const guest = makeCtx({
      player: {
        id: 'guest',
        name: 'Guest',
        resources: { sheep: 1 } as never,
      },
    }).player
    const ownerZoneId = `card:${NIGHT_PASTURE}:owner:${owner.id}:animalOwner:${owner.id}`
    const guestZoneId = `card:${NIGHT_PASTURE}:owner:${owner.id}:animalOwner:${guest.id}`
    owner.cardStates = {
      [NIGHT_PASTURE]: {
        extraData: {
          animalCountsByZone: {
            [ownerZoneId]: {
              animalCounts: { boar: 1 },
              capacity: 3,
              allowedAnimalType: null,
            },
          },
        },
      },
    }
    const ctx = makeCtx({ state: { enableFarmersOfTheMoor: true } })
    ctx.player = guest
    ctx.state.players = [owner, guest]

    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [{
        id: guestZoneId,
        zoneType: 'card',
        cardId: NIGHT_PASTURE,
        ownerPlayerId: owner.id,
        animalOwnerPlayerId: guest.id,
        animalType: 'sheep',
        animalCount: 1,
        animalCounts: { sheep: 1 },
      }] as unknown as Record<string, unknown>,
    )

    expect(result.type).toBe('ok')
    expect(owner.cardStates[NIGHT_PASTURE]?.extraData?.animalCountsByZone).toMatchObject({
      [ownerZoneId]: {
        animalCounts: { boar: 1 },
      },
      [guestZoneId]: {
        animalCounts: { sheep: 1 },
        ownerPlayerId: owner.id,
        animalOwnerPlayerId: guest.id,
      },
    })
  })

  it('counts card animals from multiple Night Pasture owners into the animal owner totals', () => {
    const firstOwner = makeCtx({ player: { id: 'owner-a', name: 'Owner A', minorPlayed: [NIGHT_PASTURE] } }).player
    const secondOwner = makeCtx({ player: { id: 'owner-b', name: 'Owner B', minorPlayed: [NIGHT_PASTURE] } }).player
    const guest = makeCtx({
      player: {
        id: 'guest',
        name: 'Guest',
        resources: { sheep: 2 } as never,
      },
    }).player
    const firstZoneId = `card:${NIGHT_PASTURE}:owner:${firstOwner.id}:animalOwner:${guest.id}`
    const secondZoneId = `card:${NIGHT_PASTURE}:owner:${secondOwner.id}:animalOwner:${guest.id}`
    const ctx = makeCtx({ state: { enableFarmersOfTheMoor: true } })
    ctx.player = guest
    ctx.state.players = [firstOwner, secondOwner, guest]

    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [
        {
          id: firstZoneId,
          zoneType: 'card',
          cardId: NIGHT_PASTURE,
          ownerPlayerId: firstOwner.id,
          animalOwnerPlayerId: guest.id,
          animalType: 'sheep',
          animalCount: 1,
          animalCounts: { sheep: 1 },
        },
        {
          id: secondZoneId,
          zoneType: 'card',
          cardId: NIGHT_PASTURE,
          ownerPlayerId: secondOwner.id,
          animalOwnerPlayerId: guest.id,
          animalType: 'sheep',
          animalCount: 1,
          animalCounts: { sheep: 1 },
        },
      ] as unknown as Record<string, unknown>,
    )

    expect(result.type).toBe('ok')
    expect(guest.resources.sheep).toBe(2)
    expect(firstOwner.cardStates[NIGHT_PASTURE]?.extraData?.animalCountsByZone).toMatchObject({
      [firstZoneId]: { animalCounts: { sheep: 1 } },
    })
    expect(secondOwner.cardStates[NIGHT_PASTURE]?.extraData?.animalCountsByZone).toMatchObject({
      [secondZoneId]: { animalCounts: { sheep: 1 } },
    })
  })

  it('consumes M084 lying markers first when reorg discards horses', () => {
    const ctx = makeCtx({
      state: { enableFarmersOfTheMoor: true },
      player: {
        minorPlayed: ['M084_BogPony'],
        resources: { sheep: 0, boar: 0, cattle: 0, horse: 3 } as never,
        cardStates: {
          M084_BogPony: { extraData: { lyingHorseCount: 2 } },
        } as never,
        pastures: [
          {
            id: 'pasture-1',
            size: 2,
            tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
            stables: 0,
            animalType: 'horse',
            animalCount: 3,
          },
        ],
      },
    })

    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [{ id: 'pasture-1', zoneType: 'pasture', animalType: 'horse', animalCount: 1 }] as unknown as Record<string, unknown>,
    )

    expect(result.type).toBe('ok')
    expect(ctx.player.resources.horse).toBe(1)
    expect(ctx.player.cardStates.M084_BogPony?.extraData?.lyingHorseCount ?? 0).toBe(0)
  })

  it('removes a M084 lying marker before standing horses when reorg keeps other horses', () => {
    const ctx = makeCtx({
      state: { enableFarmersOfTheMoor: true },
      player: {
        minorPlayed: ['M084_BogPony'],
        resources: { sheep: 0, boar: 0, cattle: 0, horse: 3 } as never,
        cardStates: {
          M084_BogPony: { extraData: { lyingHorseCount: 1 } },
        } as never,
        pastures: [
          {
            id: 'pasture-1',
            size: 2,
            tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
            stables: 0,
            animalType: 'horse',
            animalCount: 3,
          },
        ],
      },
    })

    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [{ id: 'pasture-1', zoneType: 'pasture', animalType: 'horse', animalCount: 2 }] as unknown as Record<string, unknown>,
    )

    expect(result.type).toBe('ok')
    expect(ctx.player.resources.horse).toBe(2)
    expect(ctx.player.cardStates.M084_BogPony?.extraData?.lyingHorseCount ?? 0).toBe(0)
  })

  it('clears stale ordinary card-zone animals when the zone disappears', () => {
    const ctx = makeCtx({
      player: {
        resources: { sheep: 0, boar: 1, cattle: 0 } as never,
        cardStates: {
          A011_MudPatch: { extraData: { animalCounts: { boar: 1 } } },
        } as never,
      },
    })

    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [] as unknown as Record<string, unknown>,
    )

    expect(result.type).toBe('ok')
    expect(ctx.player.resources.boar).toBe(0)
    expect(ctx.player.cardStates.A011_MudPatch?.extraData?.animalCounts).toBeUndefined()
  })
})
