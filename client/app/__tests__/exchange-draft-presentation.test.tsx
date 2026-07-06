// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { emptyResources } from '../../../shared/contract/state-constants'
import type { ActionChoiceOption, PlayerState } from '../../../shared/contract/types'
import type { InteractionPresentationPlan } from '../interaction-presentation'
import { useExchangeDraftPresentation } from '../exchange-draft-presentation'

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
      resources: { ...emptyResources, grain: 3, boar: 2 },
      improvements: ['Major_CookingHearth1'],
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

    act(() => result.current.reset())
    expect(result.current.bake.counts).toEqual({})
    expect(result.current.anytime.counts).toEqual({})
    expect(Object.values(result.current.harvestFeed.counts)).toEqual([0, 0])
  })
})
