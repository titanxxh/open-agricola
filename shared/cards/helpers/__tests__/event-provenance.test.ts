import { describe, expect, it } from 'vitest'
import type { QueryableGameEvent } from '../../../events/query'
import {
  hasExchangeGained,
  hasResourceMovedFromActionSpace,
  hasResourceMovedToPlayer,
} from '../event-provenance'

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
})
