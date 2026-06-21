import { describe, expect, it } from 'vitest'
import type { QueryableGameEvent } from '../../../events/query'
import {
  hasExchangeGained,
  hasResourceMovedFromActionSpace,
  hasResourceMovedToPlayer,
  sumActionSpaceMovedToTriggerPlayer,
  sumResourceMovedFromActionSpace,
  sumResourceMovedToPlayer,
  sumActualPaidResource,
  sumResourcePaid,
} from '../event-provenance'
import type { CardListenerContext } from '../../card-listeners'

const moved = (overrides: Partial<Extract<QueryableGameEvent, { type: 'resource.moved' }>> = {}) => ({
  type: 'resource.moved',
  resources: { grain: 1 },
  from: { kind: 'actionSpace', spaceId: 'grain-seeds' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
  ...overrides,
}) as Extract<QueryableGameEvent, { type: 'resource.moved' }>

const exchanged = (overrides: Partial<Extract<QueryableGameEvent, { type: 'resource.exchanged' }>> = {}) => ({
  type: 'resource.exchanged',
  paid: { wood: 1 },
  gained: { grain: 1 },
  paidFrom: { kind: 'player', playerId: 'p1' },
  paidTo: { kind: 'supply' },
  gainedFrom: { kind: 'supply' },
  gainedTo: { kind: 'player', playerId: 'p1' },
  exchangeSource: 'E78_SleightofHand',
  ...overrides,
}) as Extract<QueryableGameEvent, { type: 'resource.exchanged' }>

const paid = (overrides: Partial<Extract<QueryableGameEvent, { type: 'resource.paid' }>> = {}) => ({
  type: 'resource.paid',
  resources: { food: 1 },
  to: { kind: 'supply' },
  paymentFor: 'occupation',
  paymentSources: [{ from: { kind: 'player', playerId: 'p1' }, resources: { food: 1 } }],
  ...overrides,
}) as Extract<QueryableGameEvent, { type: 'resource.paid' }>

describe('event provenance helpers', () => {
  it('matches resource moves to a specific player', () => {
    expect(hasResourceMovedToPlayer([moved()], 'grain', 'p1')).toBe(true)
    expect(hasResourceMovedToPlayer([moved()], 'grain', 'p2')).toBe(false)
    expect(hasResourceMovedToPlayer([moved({ resources: { wood: 1 } })], 'grain', 'p1')).toBe(false)
  })

  it('matches resource moves from action spaces with a predicate', () => {
    expect(hasResourceMovedFromActionSpace([moved()], 'grain')).toBe(true)
    expect(hasResourceMovedFromActionSpace([moved()], 'grain', event =>
      event.from.kind === 'actionSpace' && event.from.spaceId === 'other',
    )).toBe(false)
    expect(hasResourceMovedFromActionSpace([
      moved({ from: { kind: 'card', cardId: 'C162_ForestOwner' } }),
    ], 'grain')).toBe(false)
  })

  it('matches resource exchanges by gained resource and source', () => {
    expect(hasExchangeGained([exchanged()], 'grain', event => event.exchangeSource === 'E78_SleightofHand')).toBe(true)
    expect(hasExchangeGained([exchanged()], 'vegetable')).toBe(false)
    expect(hasExchangeGained([exchanged()], 'grain', event => event.exchangeSource === 'other')).toBe(false)
  })

  it('sums moved and paid resources with predicates', () => {
    const events: readonly QueryableGameEvent[] = [
      moved({ resources: { wood: 1 } }),
      moved({ resources: { wood: 2 }, from: { kind: 'supply' } }),
      moved({ resources: { wood: 4 }, to: { kind: 'player', playerId: 'p2' } }),
      moved({ resources: { clay: 2 }, from: { kind: 'actionSpace', spaceId: 'clay-pit' } }),
      moved({ resources: { clay: 5 }, from: { kind: 'supply' } }),
      moved({ resources: { wood: 0 } }),
      moved({ resources: { wood: -1 } }),
      paid(),
      paid({ resources: { food: 1 } }),
      paid({ resources: { food: 4 }, paymentFor: 'major-improvement' }),
      paid({ resources: { food: 0 } }),
      paid({ resources: { food: -1 } }),
      exchanged(),
    ]
    const snapshot = JSON.stringify(events)

    expect(sumResourceMovedToPlayer(events, 'wood', 'p1')).toBe(3)
    expect(sumResourceMovedFromActionSpace(events, 'clay')).toBe(2)
    expect(sumResourcePaid(events, 'food', event => event.paymentFor === 'occupation')).toBe(2)
    expect(sumResourceMovedToPlayer(undefined, 'wood', 'p1')).toBe(0)
    expect(sumResourceMovedFromActionSpace(undefined, 'clay')).toBe(0)
    expect(sumResourcePaid(undefined, 'food')).toBe(0)
    expect(JSON.stringify(events)).toBe(snapshot)
  })

  it('sums actual paid resources from payment sources without double-counting', () => {
    const events: readonly QueryableGameEvent[] = [
      paid({
        resources: { 'B155_ArtTeacher:traveling-players-food': 1 },
        paymentSources: [{ from: { kind: 'actionSpace', spaceId: 'traveling-players' }, resources: { food: 1 } }],
      }),
      paid({
        resources: { food: 1 },
        paymentSources: [{ from: { kind: 'player', playerId: 'p1' }, resources: { food: 1 } }],
      }),
      paid({ resources: { food: 1 }, paymentSources: undefined }),
      paid({ resources: { wood: 1 }, paymentSources: undefined }),
    ]

    expect(sumActualPaidResource(events, 'food', event => event.paymentFor === 'occupation')).toBe(3)
  })

  it('sums action-space resources moved to the trigger player from listener context', () => {
    const ctx = {
      player: { id: 'owner' },
      triggerPlayer: { id: 'trigger' },
      transactionEvents: [
        moved({ resources: { wood: 5 }, to: { kind: 'player', playerId: 'trigger' } }),
      ],
      actionEvents: [
        moved({ resources: { wood: 2 }, to: { kind: 'player', playerId: 'trigger' } }),
        moved({ resources: { wood: 3 }, to: { kind: 'player', playerId: 'owner' } }),
        moved({
          resources: { wood: 4 },
          from: { kind: 'card', cardId: 'Test_Source' },
          to: { kind: 'player', playerId: 'trigger' },
        }),
      ],
    } as unknown as CardListenerContext

    expect(sumActionSpaceMovedToTriggerPlayer(ctx, 'wood')).toBe(2)
  })
})
