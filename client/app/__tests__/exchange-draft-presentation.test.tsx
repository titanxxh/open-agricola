// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyResources } from '../../../shared/contract/state-constants'
import type { ActionChoiceOption, PlayerState } from '../../../shared/contract/types'
import type { InteractionPresentationPlan } from '../interaction-presentation'
import { useExchangeDraftPresentation } from '../exchange-draft-presentation'

vi.mock('../../services/card-meta', () => ({
  getCardMeta: (id: string) => ({
    C059_SchnappsDistillery: {
      exchanges: [{ from: { vegetable: 1 }, to: { food: 5 }, max: 1, triggers: ['harvest'] }],
    },
    C105_BasketCarrier: {
      exchanges: [{ from: { food: 2 }, to: { wood: 1, reed: 1, grain: 1 }, max: 1, triggers: ['harvest'] }],
    },
    C109_SchnappsDistiller: {
      exchanges: [{ from: { vegetable: 1 }, to: { food: 5 }, max: 1, triggers: ['harvest'] }],
    },
    Major_Fireplace1: {
      exchanges: [{ from: { sheep: 1 }, to: { food: 2 }, triggers: ['anytime'] }],
    },
    B104_SheepWalker: {
      exchanges: [{ from: { sheep: 1 }, to: { stone: 1 }, triggers: ['anytime'], fromFarmyard: true }],
    },
  })[id],
}))

const mkPlayer = (overrides: Partial<PlayerState> = {}): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: { ...emptyResources },
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
    houseAnimals: {},
    stableAnimals: {},
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    activeModifiers: [],
    cardStates: {},
    stats: {} as PlayerState['stats'],
    ...overrides,
  }) as PlayerState

const tradeOption = (
  value: string,
  sourceCard: string,
  resourcesPaid: Record<string, number>,
  resourcesGained: Record<string, number>,
): ActionChoiceOption => ({
  value,
  labelKey: value,
  sourceCard,
  effectPreview: {
    kind: 'resourceExchange',
    resourcesPaid,
    resourcesGained,
  },
})

describe('useExchangeDraftPresentation', () => {
  it('uses shared counters for heating and updates fuel payment and sickness after wood conversion', () => {
    const player = mkPlayer({ resources: { ...emptyResources, wood: 2, fuel: 1 } })
    const { result } = renderHook(() => useExchangeDraftPresentation({
      state: { players: [player] }, pendingChoice: null,
      interactionPresentationPlan: {
        kind: 'heating', playerIndex: 0, playerId: 'p1', required: 2, requiredWithWoodConversion: 2,
        maxNewSickWorkers: 2, placedAnimals: {}, exchangeCatalog: [
          { sourceId: '__basic__', exchangeIndex: 2, from: { wood: 1 }, to: { fuel: 1 } },
        ],
      }, locale: 'en', cardLabel: id => id, getCardMeta: () => undefined,
    }))
    expect(result.current.harvest.heating).toMatchObject({ fuelUsed: 1, sickWorkers: 1 })
    act(() => result.current.harvest.updateCount('__basic__-ex2', 1))
    expect(result.current.harvest.heating).toMatchObject({ fuelUsed: 2, sickWorkers: 0 })
    expect(result.current.harvest.selections).toEqual([expect.objectContaining({ sourceId: '__basic__', exchangeIndex: 2, count: 1 })])
    act(() => result.current.harvest.heating?.updatePayment(-1))
    expect(result.current.harvest.heating).toMatchObject({ fuelUsed: 1, sickWorkers: 1 })
    act(() => result.current.harvest.reset())
    expect(result.current.harvest.heating).toMatchObject({ fuelUsed: 1, sickWorkers: 1 })
    expect(result.current.harvest.selections).toEqual([])
  })

  it('includes food received during a nested trade when returning to feeding', () => {
    const player = mkPlayer({ resources: { ...emptyResources, food: 2 } })
    const { result } = renderHook(() => useExchangeDraftPresentation({
      state: { players: [player] }, pendingChoice: null,
      interactionPresentationPlan: { kind: 'harvest-feed', playerIndex: 0, remaining: 3, foodUsed: 1 },
      locale: 'en', cardLabel: (id: string) => id, getCardMeta: () => undefined,
    }))
    expect(result.current.harvest.begging).toBe(1)
    expect(result.current.harvest.convertedFood).toBe(2)
  })

  it('updates farmyard-only limits in the selected feeding order', () => {
    const player = mkPlayer({
      resources: { ...emptyResources, sheep: 2 },
      improvements: ['Major_Fireplace1'],
      occupationPlayed: ['B104_SheepWalker'],
    })
    const { result } = renderHook(() => useExchangeDraftPresentation({
      state: { players: [player] },
      pendingChoice: null,
      interactionPresentationPlan: {
        kind: 'harvest-feed', playerIndex: 0, remaining: 2, foodUsed: 0,
        placedAnimals: { sheep: 1 }, maxTradeTimesBySourceId: { B104_SheepWalker: 1 },
      },
      locale: 'en',
      cardLabel: (id: string) => id,
      getCardMeta: () => undefined,
    }))
    act(() => result.current.harvest.updateCount('Major_Fireplace1-ex0', 1))
    act(() => result.current.harvest.updateCount('B104_SheepWalker-ex0', 1))
    expect(result.current.harvest.selections.map((selection) => selection.sourceId)).toEqual(['Major_Fireplace1'])
    act(() => result.current.harvest.reset())
    act(() => result.current.harvest.updateCount('B104_SheepWalker-ex0', 1))
    act(() => result.current.harvest.updateCount('Major_Fireplace1-ex0', 1))
    expect(result.current.harvest.selections.map((selection) => selection.sourceId)).toEqual(['B104_SheepWalker', 'Major_Fireplace1'])
  })

  it('owns bake, anytime exchange, and harvest feed draft counts and payloads', () => {
    const player = mkPlayer({
      resources: { ...emptyResources, grain: 3, vegetable: 1, boar: 2 },
      improvements: ['Major_CookingHearth1'],
      minorPlayed: ['C059_SchnappsDistillery'],
      occupationPlayed: ['C105_BasketCarrier'],
    })
    const state = { players: [player] }
    const cardLabel = (id: string) => id
    const getMeta = (id: string) =>
      id === 'Major_CookingHearth1'
        ? {
            exchanges: [
              { from: { boar: 1 }, to: { food: 3 }, triggers: ['anytime'] },
            ],
          }
        : undefined

    const { result, rerender } = renderHook(
      ({ plan, options }) =>
        useExchangeDraftPresentation({
          state,
          pendingChoice: {
            promptKey: plan.kind === 'harvest-feed' ? undefined : plan.pendingChoice.promptKey,
            options,
            playerIndex: 0,
            spaceId: 'test',
          },
          interactionPresentationPlan: plan,
          locale: 'en',
          cardLabel,
          getCardMeta: getMeta,
        }),
      {
        initialProps: {
          plan: {
            kind: 'exchange-center',
            pendingChoice: {
              promptKey: 'ui.interactionBakeBreadChoice',
              options: [
                { value: 'Major_Fireplace1', labelKey: 'Major_Fireplace1', quantityLimit: 3, effectPreview: { kind: 'resourceExchange', resourcesPaid: { grain: 1 }, resourcesGained: { food: 2 } } },
                { value: 'Major_ClayOven', labelKey: 'Major_ClayOven', quantityLimit: 1, effectPreview: { kind: 'resourceExchange', resourcesPaid: { grain: 1 }, resourcesGained: { food: 5 } } },
              ],
              playerIndex: 0,
              spaceId: 'test',
            },
          } satisfies InteractionPresentationPlan,
          options: [
            { value: 'Major_Fireplace1', labelKey: 'Major_Fireplace1', quantityLimit: 3, effectPreview: { kind: 'resourceExchange', resourcesPaid: { grain: 1 }, resourcesGained: { food: 2 } } },
            { value: 'Major_ClayOven', labelKey: 'Major_ClayOven', quantityLimit: 1, effectPreview: { kind: 'resourceExchange', resourcesPaid: { grain: 1 }, resourcesGained: { food: 5 } } },
          ],
        },
      },
    )

    act(() => result.current.bake.updateCount('Major_Fireplace1', 2))
    expect(result.current.bake.choice).toBe('bulk:Major_Fireplace1=2')
    expect(result.current.bake.summary.food).toBe(4)
    expect(result.current.bake.summary.grain).toBe(1)

    act(() => {
      rerender({
        plan: {
          kind: 'exchange-center',
          pendingChoice: {
            promptKey: 'ui.interactionExchangeChoice',
            options: [
              tradeOption('trade:1:2', 'Major_CookingHearth1', { boar: 2 }, { food: 6 }),
            ],
            playerIndex: 0,
            spaceId: 'test',
          },
        },
        options: [
          tradeOption('trade:1:2', 'Major_CookingHearth1', { boar: 2 }, { food: 6 }),
        ],
      })
    })

    act(() => result.current.anytime.updateCount('Major_CookingHearth1-ex0', 3))
    expect(result.current.anytime.counts['Major_CookingHearth1-ex0']).toBe(2)
    expect(result.current.anytime.choice).toBe('bulk:1=2')
    expect(result.current.anytime.summary.food).toBe(6)
    expect(result.current.anytime.summary.boar).toBe(2)

    player.resources.food = 2
    act(() => {
      rerender({
        plan: {
          kind: 'harvest-feed',
          playerIndex: 0,
          remaining: 3,
          foodUsed: 1,
        },
        options: [],
      })
    })

    act(() => result.current.harvest.updateCount('__basic__-ex0', 2))
    expect(result.current.harvest.selections).toEqual([
      {
        count: 2,
        sourceName: 'Basic conversion',
        sourceId: '__basic__',
        exchangeIndex: 0,
        from: { grain: 1 },
        to: { food: 1 },
      },
    ])
    expect(result.current.harvest.summary.food).toBe(4)
    expect(result.current.harvest.summary.grain).toBe(2)
    expect(result.current.harvest.begging).toBe(0)

    act(() => result.current.harvest.reset())
    act(() => result.current.harvest.updateCount('C059_SchnappsDistillery-ex0', 1))
    act(() => result.current.harvest.updateCount('C105_BasketCarrier-ex0', 1))
    expect(result.current.harvest.convertedFood).toBe(3)
    expect(result.current.harvest.begging).toBe(0)
    expect(result.current.harvest.summary.food).toBe(6)

    act(() => result.current.harvest.reset())
    act(() => {
      rerender({
        plan: {
          kind: 'harvest-feed',
          playerIndex: 0,
          remaining: 0,
          foodUsed: 0,
        },
        options: [],
      })
    })
    act(() => result.current.harvest.updateCount('C105_BasketCarrier-ex0', 1))
    expect(result.current.harvest.convertedFood).toBe(0)
    expect(result.current.harvest.begging).toBe(0)

    act(() => result.current.reset())
    expect(result.current.bake.counts).toEqual({})
    expect(result.current.anytime.counts).toEqual({})
    expect(result.current.harvest.counts['__basic__-ex0']).toBe(0)
    expect(Object.values(result.current.harvest.counts).every((count) => count === 0)).toBe(true)
  })

  it('submits harvest exchanges in the order selected by the player', () => {
    const player = mkPlayer({
      resources: { ...emptyResources, vegetable: 1 },
      occupationPlayed: ['C105_BasketCarrier', 'C109_SchnappsDistiller'],
    })
    const { result } = renderHook(() => useExchangeDraftPresentation({
      state: { players: [player] },
      pendingChoice: { promptKey: undefined, options: [], playerIndex: 0, spaceId: 'test' },
      interactionPresentationPlan: {
        kind: 'harvest-feed',
        playerIndex: 0,
        remaining: 4,
        foodUsed: 0,
      },
      locale: 'en',
      cardLabel: (id) => id,
      getCardMeta: () => undefined,
    }))

    act(() => result.current.harvest.updateCount('C109_SchnappsDistiller-ex0', 1))
    act(() => result.current.harvest.updateCount('C105_BasketCarrier-ex0', 1))

    expect(result.current.harvest.counts['C105_BasketCarrier-ex0']).toBe(1)
    expect(result.current.harvest.selections.map((selection) => selection.sourceId)).toEqual([
      'C109_SchnappsDistiller',
      'C105_BasketCarrier',
    ])

    act(() => result.current.harvest.updateCount('C109_SchnappsDistiller-ex0', -1))
    expect(result.current.harvest.counts['C109_SchnappsDistiller-ex0']).toBe(1)
    expect(result.current.harvest.counts['C105_BasketCarrier-ex0']).toBe(1)
  })
})
