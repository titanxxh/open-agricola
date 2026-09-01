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
                { value: 'Major_Fireplace1', labelKey: 'Major_Fireplace1' },
                { value: 'Major_ClayOven', labelKey: 'Major_ClayOven' },
              ],
              playerIndex: 0,
              spaceId: 'test',
            },
          } satisfies InteractionPresentationPlan,
          options: [
            { value: 'Major_Fireplace1', labelKey: 'Major_Fireplace1' },
            { value: 'Major_ClayOven', labelKey: 'Major_ClayOven' },
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

    act(() => result.current.harvestFeed.updateCount('__basic__-ex0', 2))
    expect(result.current.harvestFeed.selections).toEqual([
      {
        count: 2,
        sourceName: 'Basic conversion',
        sourceId: '__basic__',
        exchangeIndex: 0,
        from: { grain: 1 },
        to: { food: 1 },
      },
    ])
    expect(result.current.harvestFeed.summary.food).toBe(3)
    expect(result.current.harvestFeed.summary.grain).toBe(2)
    expect(result.current.harvestFeed.begging).toBe(1)

    act(() => result.current.harvestFeed.reset())
    act(() => result.current.harvestFeed.updateCount('C059_SchnappsDistillery-ex0', 1))
    act(() => result.current.harvestFeed.updateCount('C105_BasketCarrier-ex0', 1))
    expect(result.current.harvestFeed.convertedFood).toBe(3)
    expect(result.current.harvestFeed.begging).toBe(0)
    expect(result.current.harvestFeed.summary.food).toBe(6)

    act(() => result.current.harvestFeed.reset())
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
    act(() => result.current.harvestFeed.updateCount('C105_BasketCarrier-ex0', 1))
    expect(result.current.harvestFeed.convertedFood).toBe(0)
    expect(result.current.harvestFeed.begging).toBe(0)

    act(() => result.current.reset())
    expect(result.current.bake.counts).toEqual({})
    expect(result.current.anytime.counts).toEqual({})
    expect(result.current.harvestFeed.counts['__basic__-ex0']).toBe(0)
    expect(Object.values(result.current.harvestFeed.counts).every((count) => count === 0)).toBe(true)
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

    act(() => result.current.harvestFeed.updateCount('C109_SchnappsDistiller-ex0', 1))
    act(() => result.current.harvestFeed.updateCount('C105_BasketCarrier-ex0', 1))

    expect(result.current.harvestFeed.counts['C105_BasketCarrier-ex0']).toBe(1)
    expect(result.current.harvestFeed.selections.map((selection) => selection.sourceId)).toEqual([
      'C109_SchnappsDistiller',
      'C105_BasketCarrier',
    ])

    act(() => result.current.harvestFeed.updateCount('C109_SchnappsDistiller-ex0', -1))
    expect(result.current.harvestFeed.counts['C109_SchnappsDistiller-ex0']).toBe(1)
    expect(result.current.harvestFeed.counts['C105_BasketCarrier-ex0']).toBe(1)
  })
})
